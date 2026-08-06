// Region geometry: an outline plus zero or more holes.
//
// Rings are stored in a canonical winding — outline counter-clockwise, holes clockwise —
// and that one invariant is what keeps the rest of this file short. Under it, the left
// normal of any ring edge points into the walkable area, whether the edge belongs to the
// outline or to a hole. Nudging away from a desk and nudging in off a wall are the same
// operation, so there is no "which side of what am I on" case to get wrong.
import { isCCW } from './math.js';
import { polyCentroid, pointInPolygon, closestPointOnSegment } from './helpers.js';

const EPS = 1e-9;

/** Accepts the bare-array form as an outline with no holes. Does not copy. */
export function toRegion(input) {
    if (Array.isArray(input)) return { outline: input, holes: [] };
    if (input && Array.isArray(input.outline)) {
        return { outline: input.outline, holes: Array.isArray(input.holes) ? input.holes : [] };
    }
    return { outline: [], holes: [] };
}

/** Copies every point and applies the canonical winding. */
export function normaliseRegion(input) {
    const { outline, holes } = toRegion(input);
    const o = outline.map((p) => ({ x: p.x, y: p.y }));
    if (!isCCW(o)) o.reverse();
    const h = holes
        .filter((ring) => Array.isArray(ring) && ring.length >= 3)
        .map((ring) => {
            const copy = ring.map((p) => ({ x: p.x, y: p.y }));
            if (isCCW(copy)) copy.reverse();
            return copy;
        });
    return { outline: o, holes: h };
}

export const ringsOf = (region) => [region.outline, ...region.holes];

const ringsEqual = (a, b) =>
    a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

export function regionsEqual(a, b) {
    if (!ringsEqual(a.outline, b.outline)) return false;
    if (a.holes.length !== b.holes.length) return false;
    return a.holes.every((ring, i) => ringsEqual(ring, b.holes[i]));
}

function onRing(p, ring, eps = EPS) {
    for (let i = 0; i < ring.length; i++) {
        const q = closestPointOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
        if (Math.hypot(p.x - q.x, p.y - q.y) <= eps) return true;
    }
    return false;
}

/** Strict: false on the outline and false anywhere on or inside a hole. */
export function pointInRegion(p, region, eps = EPS) {
    if (!pointInPolygon(p, region.outline, eps)) return false;
    for (const hole of region.holes) {
        if (pointInPolygon(p, hole, eps) || onRing(p, hole, eps)) return false;
    }
    return true;
}

/**
 * Nearest point on any ring, with enough context to work out which way is inward:
 * `{ point, ring, ringIndex, edgeIndex, distance }`.
 */
export function closestOnRegion(p, region) {
    let best = null;
    for (const [r, ring] of ringsOf(region).entries()) {
        if (!Array.isArray(ring) || ring.length < 2) continue;
        for (let i = 0; i < ring.length; i++) {
            const q = closestPointOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
            const distance = Math.hypot(p.x - q.x, p.y - q.y);
            if (best && distance >= best.distance) continue;
            best = {
                point: q,
                ring: r === 0 ? 'outline' : 'hole',
                ringIndex: r === 0 ? undefined : r - 1,
                edgeIndex: i,
                distance
            };
        }
    }
    return best;
}

/** Nearest point on the outline or on any hole edge, whichever is closer. */
export function closestPointOnRegionBoundary(p, region) {
    return closestOnRegion(p, region)?.point ?? { x: p.x, y: p.y };
}

/** Distance to the nearest wall, counting hole edges as walls. */
export function distanceToRegionBoundary(p, region) {
    return closestOnRegion(p, region)?.distance ?? Infinity;
}

/**
 * Moves `p` a distance `d` into the walkable area, along the inward normal of the nearest
 * ring edge. From a hole edge that means away from the hole, which is the difference
 * between clamping a click onto the floor beside the desk and onto the desk itself.
 */
export function nudgeIntoRegion(p, region, d = 0.5) {
    const start = { x: p.x, y: p.y };
    if (!(d > 0) || !region?.outline || region.outline.length < 3) return start;

    const hit = closestOnRegion(p, region);
    if (!hit) return start;
    const ring = hit.ring === 'outline' ? region.outline : region.holes[hit.ringIndex];
    const a = ring[hit.edgeIndex];
    const b = ring[(hit.edgeIndex + 1) % ring.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len > 0) {
        const candidate = { x: p.x + (-ey / len) * d, y: p.y + (ex / len) * d };
        if (pointInRegion(candidate, region)) return candidate;
    }

    // A sharp corner can leave the edge normal pointing out. Aim at the outline centroid
    // instead, or straight away from the hole when the nearest wall was one of its edges.
    const target = hit.ring === 'outline' ? polyCentroid(region.outline) : polyCentroid(ring);
    const sign = hit.ring === 'outline' ? 1 : -1;
    const vx = (target.x - p.x) * sign;
    const vy = (target.y - p.y) * sign;
    const L = Math.hypot(vx, vy) || 1;
    return { x: p.x + (vx / L) * d, y: p.y + (vy / L) * d };
}

/** Longest step allowed at a near-straight vertex, as a multiple of the clearance. */
const MAX_CORNER_STEP = 4;

function ringVertexAt(p, region, eps = 1e-6) {
    for (const [r, ring] of ringsOf(region).entries()) {
        for (let i = 0; i < ring.length; i++) {
            if (Math.abs(ring[i].x - p.x) <= eps && Math.abs(ring[i].y - p.y) <= eps) {
                return { ring, index: i, isHole: r > 0 };
            }
        }
    }
    return null;
}

const unit = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
};

/**
 * Offsets a waypoint that sits on a ring vertex far enough along the interior bisector
 * that both walls meeting there stay `clearance` clear.
 *
 * Simply pushing the waypoint `clearance` from the nearest wall is not enough: two
 * waypoints offset that way from the ends of one edge leave the straight run between them
 * closer to that edge than either of its endpoints was. Offsetting by
 * `clearance / sin(half-angle)` puts the waypoint where the two offset walls meet, which
 * is the point the run actually has to pass through.
 *
 * Returns null when the waypoint is not on a ring vertex — the funnel only turns at
 * those, so anything else needs no corner treatment.
 */
export function pushCornerClear(p, region, clearance) {
    if (!(clearance > 0)) return null;
    const found = ringVertexAt(p, region);
    if (!found) return null;

    const { ring, index } = found;
    const v = ring[index];
    const prev = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const d1 = unit(prev.x - v.x, prev.y - v.y);
    const d2 = unit(next.x - v.x, next.y - v.y);

    let bisector = unit(d1.x + d2.x, d1.y + d2.y);
    if (Math.hypot(d1.x + d2.x, d1.y + d2.y) < 1e-9) bisector = { x: -d2.y, y: d2.x };
    // The bisector points one of two ways; the walkable one is whichever leaves the wall.
    const probe = { x: v.x + bisector.x * 1e-6, y: v.y + bisector.y * 1e-6 };
    if (!pointInRegion(probe, region)) bisector = { x: -bisector.x, y: -bisector.y };

    const sinHalf = Math.abs(bisector.x * d1.y - bisector.y * d1.x);
    const step = clearance / Math.max(sinHalf, 1 / MAX_CORNER_STEP);
    return { x: v.x + bisector.x * step, y: v.y + bisector.y * step };
}
