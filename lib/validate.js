// Polygon and region validation.
//
// Errors carry enough location to draw a red dot on: which ring, which vertex, which pair
// of edges, and where they cross. An editor dragging a vertex creates a self-intersecting
// polygon on most mouse moves, so "which one" is the useful half of the answer.
export const ValidationErrorCodes = {
    NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES',
    DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX',
    SELF_INTERSECTION: 'SELF_INTERSECTION',
    HOLE_OUTSIDE_OUTLINE: 'HOLE_OUTSIDE_OUTLINE',
    HOLE_INTERSECTS_OUTLINE: 'HOLE_INTERSECTS_OUTLINE',
    HOLE_TOUCHES_OUTLINE: 'HOLE_TOUCHES_OUTLINE',
    HOLE_OVERLAP: 'HOLE_OVERLAP'
};

const TOUCH_EPS = 1e-9;

const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

/** Proper crossing only: collinear overlaps and shared endpoints are not reported here. */
function crossPoint(a, b, c, d) {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if (!(o1 * o2 < 0 && o3 * o4 < 0)) return null;
    const rx = b.x - a.x, ry = b.y - a.y;
    const sx = d.x - c.x, sy = d.y - c.y;
    const denom = rx * sy - ry * sx;
    if (denom === 0) return null;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
    return { x: a.x + rx * t, y: a.y + ry * t };
}

function distToSegment(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const denom = abx * abx + aby * aby;
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / denom));
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

function onRing(p, ring, eps = TOUCH_EPS) {
    for (let i = 0; i < ring.length; i++) {
        if (distToSegment(p, ring[i], ring[(i + 1) % ring.length]) <= eps) return true;
    }
    return false;
}

/** Even-odd ray cast. Points exactly on the ring answer arbitrarily; test `onRing` first. */
function insideRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

const ringLabel = (ring, ringIndex) => (ring === 'outline' ? 'outline' : `hole ${ringIndex}`);

/**
 * Returns an empty array when the polygon is usable, otherwise the problems found.
 *
 * By default it stops at the first problem of each kind, which is all `buildNavMesh`
 * needs. Pass `{ all: true }` to collect every occurrence — an editor wants to mark all
 * of them, not just the first.
 */
export function validatePolygon(poly, opts = {}) {
    const { all = false, ring = 'outline', ringIndex } = opts;
    const errors = [];
    const where = ringIndex === undefined ? { ring } : { ring, ringIndex };

    if (!Array.isArray(poly) || poly.length < 3) {
        errors.push({
            code: ValidationErrorCodes.NOT_ENOUGH_VERTICES,
            message: `The ${ringLabel(ring, ringIndex)} needs at least 3 vertices`,
            ...where
        });
        return errors;
    }

    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (a.x === b.x && a.y === b.y) {
            errors.push({
                code: ValidationErrorCodes.DUPLICATE_ADJACENT_VERTEX,
                message: `Duplicate adjacent vertex at index ${i} of the ${ringLabel(ring, ringIndex)}`,
                ...where,
                index: i,
                at: { x: a.x, y: a.y }
            });
            if (!all) break;
        }
    }

    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        for (let j = i + 1; j < poly.length; j++) {
            if (Math.abs(i - j) <= 1) continue;
            if (i === 0 && j === poly.length - 1) continue; // shared endpoint on the wrap
            const hit = crossPoint(a, b, poly[j], poly[(j + 1) % poly.length]);
            if (!hit) continue;
            errors.push({
                code: ValidationErrorCodes.SELF_INTERSECTION,
                message: `Edges ${i}-${i + 1} and ${j}-${j + 1} of the ${ringLabel(ring, ringIndex)} cross`,
                ...where,
                index: i,
                edges: [i, j],
                at: hit
            });
            if (!all) return errors;
        }
    }

    return errors;
}

/** Reports the first crossing and the first point contact between two rings. */
function compareRings(ring, other, ringIndex, codes) {
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        for (let j = 0; j < other.length; j++) {
            const hit = crossPoint(a, b, other[j], other[(j + 1) % other.length]);
            if (hit) {
                return [{
                    code: codes.crossing,
                    message: codes.crossingMessage,
                    ring: 'hole',
                    ringIndex,
                    index: i,
                    edges: [i, j],
                    at: hit
                }];
            }
        }
    }
    for (let i = 0; i < ring.length; i++) {
        if (!onRing(ring[i], other)) continue;
        return [{
            code: codes.touching,
            message: codes.touchingMessage,
            ring: 'hole',
            ringIndex,
            index: i,
            at: { x: ring[i].x, y: ring[i].y }
        }];
    }
    for (let i = 0; i < other.length; i++) {
        if (!onRing(other[i], ring)) continue;
        return [{
            code: codes.touching,
            message: codes.touchingMessage,
            ring: 'hole',
            ringIndex,
            at: { x: other[i].x, y: other[i].y }
        }];
    }
    return [];
}

/**
 * Validates an outline plus its holes: every ring on its own, then how they sit relative
 * to one another. A bare array is treated as an outline with no holes.
 *
 * Holes must lie strictly inside the outline and strictly outside each other. Touching is
 * rejected rather than supported: it leaves the region only weakly simple, which the
 * triangulator cannot bridge reliably, and an editor can always pull the vertex back.
 */
export function validateRegion(input, opts = {}) {
    const { all = false } = opts;
    const outline = Array.isArray(input) ? input : input?.outline;
    const holes = (Array.isArray(input) ? [] : input?.holes) ?? [];

    const errors = validatePolygon(outline, { all, ring: 'outline' });
    if (!Array.isArray(holes)) return errors;

    for (let h = 0; h < holes.length; h++) {
        errors.push(...validatePolygon(holes[h], { all, ring: 'hole', ringIndex: h }));
        if (errors.length && !all) return errors;
    }
    // How the rings sit relative to each other is meaningless while one is broken alone.
    if (errors.length) return errors;

    for (let h = 0; h < holes.length; h++) {
        const problems = compareRings(holes[h], outline, h, {
            crossing: ValidationErrorCodes.HOLE_INTERSECTS_OUTLINE,
            touching: ValidationErrorCodes.HOLE_TOUCHES_OUTLINE,
            crossingMessage: `Hole ${h} crosses the outline`,
            touchingMessage: `Hole ${h} touches the outline`
        });
        if (problems.length) {
            errors.push(...problems);
            if (!all) return errors;
            continue;
        }
        const stray = holes[h].findIndex((p) => !insideRing(p, outline));
        if (stray >= 0) {
            errors.push({
                code: ValidationErrorCodes.HOLE_OUTSIDE_OUTLINE,
                message: `Hole ${h} lies outside the outline`,
                ring: 'hole',
                ringIndex: h,
                index: stray,
                at: { x: holes[h][stray].x, y: holes[h][stray].y }
            });
            if (!all) return errors;
        }
    }

    for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
            const problems = compareRings(holes[j], holes[i], j, {
                crossing: ValidationErrorCodes.HOLE_OVERLAP,
                touching: ValidationErrorCodes.HOLE_OVERLAP,
                crossingMessage: `Holes ${i} and ${j} overlap`,
                touchingMessage: `Holes ${i} and ${j} touch`
            });
            if (!problems.length && (insideRing(holes[j][0], holes[i]) || insideRing(holes[i][0], holes[j]))) {
                problems.push({
                    code: ValidationErrorCodes.HOLE_OVERLAP,
                    message: `Holes ${i} and ${j} are nested`,
                    ring: 'hole',
                    ringIndex: j,
                    index: 0,
                    at: { x: holes[j][0].x, y: holes[j][0].y }
                });
            }
            if (problems.length) {
                errors.push(...problems);
                if (!all) return errors;
            }
        }
    }

    return errors;
}
