import { isCCW, triArea2 } from './math.js';

const EPS = 1e-9;

const samePos = (p, q) => p.x === q.x && p.y === q.y;

/** Inclusive: a vertex sitting exactly on an edge of the ear still blocks it. */
function inEar(p, a, b, c) {
    return triArea2(a, b, p) >= -EPS && triArea2(b, c, p) >= -EPS && triArea2(c, a, p) >= -EPS;
}

function blocked(ring, a, b, c) {
    for (const p of ring) {
        if (p === a || p === b || p === c) continue;
        // Bridging a hole duplicates a vertex, so identity alone is not enough to
        // recognise a corner of the candidate ear.
        if (samePos(p, a) || samePos(p, b) || samePos(p, c)) continue;
        if (inEar(p, a, b, c)) return true;
    }
    return false;
}

/**
 * Ear clipping over one ring, counter-clockwise.
 *
 * `complete` is false when no ear could be found, which leaves a hole in the coverage.
 * Callers that build a navmesh must treat that as a failure rather than shipping the
 * partial result: the missing triangles look exactly like unwalkable floor.
 */
function earClip(ring) {
    const list = ring.slice();
    const tris = [];
    while (list.length > 3) {
        let clipped = false;
        for (let i = 0; i < list.length; i++) {
            const a = list[(i - 1 + list.length) % list.length];
            const b = list[i];
            const c = list[(i + 1) % list.length];
            if (triArea2(a, b, c) <= 0) continue;
            if (blocked(list, a, b, c)) continue;
            tris.push([a, b, c]);
            list.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) return { tris, complete: false };
    }
    tris.push([list[0], list[1], list[2]]);
    return { tris, complete: true };
}

/**
 * Ear-clipping triangulation of a simple (non self-intersecting) polygon.
 * Input winding is normalised internally; output triangles are counter-clockwise.
 * Returns an empty array for fewer than 3 vertices.
 */
export function triangulate(simplePoly) {
    if (!Array.isArray(simplePoly) || simplePoly.length < 3) return [];
    const verts = simplePoly.slice();
    if (!isCCW(verts)) verts.reverse();
    return earClip(verts).tris;
}

const maxXIndex = (ring) => {
    let best = 0;
    for (let i = 1; i < ring.length; i++) if (ring[i].x > ring[best].x) best = i;
    return best;
};

/**
 * Index into `ring` of a vertex mutually visible from the hole vertex `m`.
 *
 * Casts a ray from `m` along +x. For a counter-clockwise ring the interior lies to the
 * left of travel, so the first wall the ray can legally reach is an upward edge. The
 * endpoint of that edge is visible unless a reflex vertex blocks the line of sight, in
 * which case the blocker nearest the ray is used instead. Eberly's construction.
 */
function findBridge(ring, m) {
    let hitX = Infinity;
    let edge = -1;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (!(a.y < b.y) || m.y < a.y || m.y > b.y) continue;
        const x = a.x + ((m.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (x < m.x || x >= hitX) continue;
        hitX = x;
        edge = i;
    }
    if (edge < 0) return -1;

    const i0 = edge;
    const i1 = (edge + 1) % ring.length;
    const p0 = ring[i0];
    const p1 = ring[i1];
    if (p0.y === m.y && p0.x === hitX) return i0;
    if (p1.y === m.y && p1.x === hitX) return i1;

    let best = p0.x > p1.x || (p0.x === p1.x && Math.abs(p0.y - m.y) <= Math.abs(p1.y - m.y)) ? i0 : i1;

    // The sight triangle stays fixed on the first candidate while the search runs, so the
    // set of possible blockers does not shift as a nearer one is found.
    const intersection = { x: hitX, y: m.y };
    const corner = ring[best];
    const first = best;
    let bestTan = Infinity;
    let bestDist = Infinity;
    for (let i = 0; i < ring.length; i++) {
        if (i === first) continue;
        const r = ring[i];
        if (r.x <= m.x) continue;
        const prev = ring[(i - 1 + ring.length) % ring.length];
        const next = ring[(i + 1) % ring.length];
        if (triArea2(prev, r, next) >= 0) continue; // convex vertices cannot block
        if (!inTriangle(r, m, intersection, corner)) continue;
        const tan = Math.abs(r.y - m.y) / (r.x - m.x);
        const dist = Math.hypot(r.x - m.x, r.y - m.y);
        if (tan < bestTan - EPS || (Math.abs(tan - bestTan) <= EPS && dist < bestDist)) {
            bestTan = tan;
            bestDist = dist;
            best = i;
        }
    }
    return best;
}

/** Inclusive point-in-triangle, either winding. */
function inTriangle(p, a, b, c) {
    const d1 = triArea2(a, b, p);
    const d2 = triArea2(b, c, p);
    const d3 = triArea2(c, a, p);
    return !((d1 < -EPS || d2 < -EPS || d3 < -EPS) && (d1 > EPS || d2 > EPS || d3 > EPS));
}

/** Cuts a zero-width slit from `ring[k]` to `hole[m]` and back, merging the two rings. */
function spliceHole(ring, k, hole, m) {
    const inserted = [];
    for (let i = 0; i < hole.length; i++) inserted.push(hole[(m + i) % hole.length]);
    inserted.push({ x: hole[m].x, y: hole[m].y });
    inserted.push({ x: ring[k].x, y: ring[k].y });
    return [...ring.slice(0, k + 1), ...inserted, ...ring.slice(k + 1)];
}

/**
 * Merges every hole into the outline. Holes are taken rightmost first so that a hole
 * bridged later can attach to an earlier hole's vertices; the order is fixed rather than
 * input-dependent, which is what keeps the resulting triangulation deterministic.
 */
function eliminateHoles(outline, holes) {
    const order = holes
        .map((ring, i) => ({ ring, i, m: maxXIndex(ring) }))
        .sort((a, b) => b.ring[b.m].x - a.ring[a.m].x || a.i - b.i);

    let merged = outline;
    for (const { ring, m } of order) {
        const k = findBridge(merged, ring[m]);
        if (k < 0) return null;
        merged = spliceHole(merged, k, ring, m);
    }
    return merged;
}

/**
 * Triangulates an outline with zero or more holes. Accepts a bare array as an outline
 * with no holes. Winding is normalised internally: the outline is wound
 * counter-clockwise and each hole clockwise.
 *
 * Unlike `triangulate` this reports failure instead of returning a partial result.
 */
export function triangulateRegion(region) {
    const outline = Array.isArray(region) ? region : region?.outline;
    const holes = (Array.isArray(region) ? [] : region?.holes) ?? [];
    if (!Array.isArray(outline) || outline.length < 3) return { ok: true, tris: [] };

    const ccw = isCCW(outline) ? outline.slice() : outline.slice().reverse();
    const rings = holes
        .filter((h) => Array.isArray(h) && h.length >= 3)
        .map((h) => (isCCW(h) ? h.slice().reverse() : h.slice()));

    const ring = rings.length ? eliminateHoles(ccw, rings) : ccw;
    if (!ring) return { ok: false, message: 'No bridge found from a hole to the outline' };

    const { tris, complete } = earClip(ring);
    if (!complete) return { ok: false, message: 'Ear clipping stalled before covering the region' };
    return { ok: true, tris };
}

