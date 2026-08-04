// Misc geometry helpers used by the API and the demo.
import { V, isCCW } from './math.js';

/** Area-weighted centroid of a polygon. */
export function polyCentroid(poly) {
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const w = p.x * q.y - q.x * p.y;
        A += w;
        cx += (p.x + q.x) * w;
        cy += (p.y + q.y) * w;
    }
    A = A * 0.5 || 1;
    return { x: cx / (6 * A), y: cy / (6 * A) };
}

/**
 * Strict interior test: true only when `p` is inside and not on the outline.
 *
 * A bare even-odd ray cast answers arbitrarily for a point lying exactly on an edge
 * (which side it reports depends on the edge's orientation), so the boundary is
 * checked explicitly first.
 */
export function pointInPolygon(p, poly, eps = 1e-9) {
    if (!poly || poly.length < 3) return false;

    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (V.dist(p, closestPointOnSegment(p, a, b)) <= eps) return false;
    }

    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

export function closestPointOnSegment(p, a, b) {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const denom = ab.x * ab.x + ab.y * ab.y || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / denom));
    return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

/** Nearest point on the polygon outline to `p`, plus the index of the edge it lies on. */
function closestEdge(p, poly) {
    let best = null;
    let bd = Infinity;
    let index = -1;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const q = closestPointOnSegment(p, a, b);
        const d = V.dist(p, q);
        if (d < bd) { bd = d; best = q; index = i; }
    }
    return { point: best, index, distance: bd };
}

export function closestPointOnBoundary(p, poly) {
    if (!poly || poly.length < 2) return p;
    return closestEdge(p, poly).point ?? p;
}

/**
 * Moves `p` a distance `d` into the polygon.
 *
 * Steps along the inward normal of the nearest edge. Aiming at the centroid instead —
 * as this used to — is wrong for concave shapes, whose centroid can lie outside the
 * polygon entirely (an L-shaped room is the classic case). The centroid direction is
 * kept only as a fallback for when the normal step does not land inside, e.g. at a
 * sharp corner where neither adjacent edge's normal points into the interior.
 */
export function nudgeInside(p, poly, d = 0.5) {
    if (!poly || poly.length < 3 || !(d > 0)) return { x: p.x, y: p.y };

    const { index } = closestEdge(p, poly);
    if (index >= 0) {
        const a = poly[index];
        const b = poly[(index + 1) % poly.length];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const len = Math.hypot(ex, ey);
        if (len > 0) {
            // Left normal of a->b points into a CCW polygon, right normal into a CW one.
            const s = isCCW(poly) ? 1 : -1;
            const nx = (-ey / len) * s;
            const ny = (ex / len) * s;
            const candidate = { x: p.x + nx * d, y: p.y + ny * d };
            if (pointInPolygon(candidate, poly)) return candidate;
        }
    }

    const c = polyCentroid(poly);
    const vx = c.x - p.x;
    const vy = c.y - p.y;
    const L = Math.hypot(vx, vy) || 1;
    return { x: p.x + (vx / L) * d, y: p.y + (vy / L) * d };
}
