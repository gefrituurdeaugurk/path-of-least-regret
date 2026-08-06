// Navmesh adjacency, A* over the triangle graph, portal extraction and funnel (string pulling).
import { triArea2, V, centroidTriangle } from './math.js';

const EPS_PT = 1e-9;

const samePt = (p, q) => p === q || (Math.abs(p.x - q.x) < EPS_PT && Math.abs(p.y - q.y) < EPS_PT);
const edgesOfTri = (t) => [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];

/**
 * Assigns a stable integer id to each distinct vertex position, so edges can be
 * hashed instead of compared pairwise. Positions within EPS_PT are treated as one
 * vertex; the surrounding buckets are probed so a value landing just across a
 * quantisation boundary still matches its neighbour.
 */
function createVertexIndex() {
    const buckets = new Map();
    let next = 0;
    const keyOf = (ix, iy) => `${ix},${iy}`;
    return (p) => {
        const ix = Math.round(p.x / EPS_PT);
        const iy = Math.round(p.y / EPS_PT);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const hit = buckets.get(keyOf(ix + dx, iy + dy));
                if (hit && samePt(hit.p, p)) return hit.id;
            }
        }
        const id = next++;
        buckets.set(keyOf(ix, iy), { id, p });
        return id;
    };
}

/**
 * Builds triangle adjacency: Map<triIndex, Array<{ to, edge }>>.
 *
 * Each `edge` is the two-vertex array taken from the *owning* triangle, so callers
 * can rely on object identity when looking for a triangle's remaining vertex.
 *
 * Runs in O(t) via edge hashing rather than the O(t^2) pairwise scan it replaces.
 */
export function buildAdjacency(tris) {
    const idOf = createVertexIndex();
    const map = new Map();
    const byEdge = new Map(); // canonical edge key -> [{ tri, edge }]

    for (let i = 0; i < tris.length; i++) {
        map.set(i, []);
        for (const edge of edgesOfTri(tris[i])) {
            const a = idOf(edge[0]);
            const b = idOf(edge[1]);
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            const bucket = byEdge.get(key);
            if (bucket) bucket.push({ tri: i, edge });
            else byEdge.set(key, [{ tri: i, edge }]);
        }
    }

    for (const shared of byEdge.values()) {
        // A well-formed mesh shares an edge between at most two triangles; link every
        // pair anyway so a degenerate triangulation degrades rather than losing edges.
        for (let i = 0; i < shared.length; i++) {
            for (let j = i + 1; j < shared.length; j++) {
                const a = shared[i];
                const b = shared[j];
                map.get(a.tri).push({ to: b.tri, edge: a.edge });
                map.get(b.tri).push({ to: a.tri, edge: b.edge });
            }
        }
    }

    return map;
}

/**
 * Edge-inclusive point-in-triangle test.
 *
 * A point is inside or on the triangle exactly when the three signed areas share a sign,
 * counting zeros as either. Testing "is any area ~0" instead accepts any point collinear
 * with an edge's *line*, however far outside the triangle it lies — which with holes in
 * play made the middle of a hole report as walkable.
 */
export function pointInTri(p, tri) {
    const [a, b, c] = tri;
    const s1 = triArea2(p, a, b);
    const s2 = triArea2(p, b, c);
    const s3 = triArea2(p, c, a);
    const eps = 1e-6;
    const negative = s1 < -eps || s2 < -eps || s3 < -eps;
    const positive = s1 > eps || s2 > eps || s3 > eps;
    return !(negative && positive);
}

export function findTriIdContaining(p, triangles) {
    for (let i = 0; i < triangles.length; i++) {
        if (pointInTri(p, triangles[i])) return i;
    }
    return null;
}

/**
 * A* over the triangle adjacency graph.
 *
 * `opts.minPortalWidth` refuses to cross a shared edge shorter than that, which is how a
 * clearance request turns into a clean `null` instead of a path threading a gap no body
 * could fit through. It is a local test on one edge, not a guarantee about the corridor.
 */
export function aStarTriangle(startId, goalId, triangles, adj, centroids, opts = {}) {
    if (startId == null || goalId == null) return null;
    const { minPortalWidth = 0 } = opts;
    const C = centroids || triangles.map((t) => centroidTriangle(t));
    const open = new Set([startId]);
    const came = new Map();
    const g = new Map([[startId, 0]]);
    const f = new Map([[startId, V.dist(C[startId], C[goalId])]]);

    const pick = () => {
        let best = null;
        let bv = Infinity;
        for (const n of open) {
            const v = f.get(n) ?? Infinity;
            if (v < bv) { bv = v; best = n; }
        }
        return best;
    };

    while (open.size) {
        const cur = pick();
        if (cur === goalId) {
            const ids = [cur];
            let c = cur;
            while (came.has(c)) {
                c = came.get(c);
                ids.push(c);
            }
            return ids.reverse();
        }
        open.delete(cur);
        for (const e of adj.get(cur) ?? []) {
            if (minPortalWidth > 0 && V.dist(e.edge[0], e.edge[1]) < minPortalWidth) continue;
            const alt = (g.get(cur) ?? Infinity) + V.dist(C[cur], C[e.to]);
            if (alt < (g.get(e.to) ?? Infinity)) {
                came.set(e.to, cur);
                g.set(e.to, alt);
                f.set(e.to, alt + V.dist(C[e.to], C[goalId]));
                open.add(e.to);
            }
        }
    }
    return null;
}

function thirdVertex(tri, edge) {
    // Identity first (triangulation reuses vertex objects); fall back to position for
    // meshes stitched from separately-constructed points.
    return tri.find((p) => p !== edge[0] && p !== edge[1])
        ?? tri.find((p) => !samePt(p, edge[0]) && !samePt(p, edge[1]));
}

function orientedPortal(currTri, sharedEdge) {
    const [a, b] = sharedEdge;
    const q = thirdVertex(currTri, sharedEdge);
    return triArea2(a, b, q) > 0
        ? { left: { x: a.x, y: a.y }, right: { x: b.x, y: b.y } }
        : { left: { x: b.x, y: b.y }, right: { x: a.x, y: a.y } };
}

function sharedEdgeBetween(curr, next) {
    for (const A of edgesOfTri(curr)) {
        for (const B of edgesOfTri(next)) {
            if ((samePt(A[0], B[0]) && samePt(A[1], B[1])) || (samePt(A[0], B[1]) && samePt(A[1], B[0]))) {
                return A;
            }
        }
    }
    return null;
}

/**
 * Builds the portal sequence crossed by a triangle path.
 * Pass `adj` to reuse the shared edges already computed by buildAdjacency.
 */
export function portalsFromTriPath(triPath, triangles, start, end, adj = null) {
    const P = [];
    for (let i = 0; i < triPath.length - 1; i++) {
        const currId = triPath[i];
        const nextId = triPath[i + 1];
        const curr = triangles[currId];
        const shared = adj
            ? (adj.get(currId) ?? []).find((e) => e.to === nextId)?.edge
            : sharedEdgeBetween(curr, triangles[nextId]);
        if (shared) P.push(orientedPortal(curr, shared));
    }
    P.push({ left: { x: end.x, y: end.y }, right: { x: end.x, y: end.y } });
    return P;
}

export function funnel(start, portals) {
    const EPS = 1e-6;
    const out = [{ x: start.x, y: start.y }];
    // Apex advances can land on a point we already emitted (a corner touched by two
    // consecutive portals); skip those so callers never see zero-length segments.
    const push = (p) => {
        const prev = out[out.length - 1];
        if (!prev || !samePt(prev, p)) out.push({ x: p.x, y: p.y });
    };

    let apex = { x: start.x, y: start.y };
    let left = { x: portals[0].left.x, y: portals[0].left.y };
    let right = { x: portals[0].right.x, y: portals[0].right.y };
    let ai = 0, li = 0, ri = 0;

    const veq = (a, b) => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;

    for (let i = 1; i < portals.length; i++) {
        const pL = portals[i].left;
        const pR = portals[i].right;

        if (triArea2(apex, right, pR) <= EPS) {
            if (veq(apex, right) || triArea2(apex, left, pR) > EPS) {
                right = { x: pR.x, y: pR.y };
                ri = i;
            } else {
                // Right side crossed over the left: the left vertex is a corner of the path.
                push(left);
                apex = { x: left.x, y: left.y };
                ai = li;
                left = { x: apex.x, y: apex.y };
                right = { x: apex.x, y: apex.y };
                li = ai; ri = ai; i = ai;
                continue;
            }
        }

        if (triArea2(apex, left, pL) >= -EPS) {
            if (veq(apex, left) || triArea2(apex, right, pL) < -EPS) {
                left = { x: pL.x, y: pL.y };
                li = i;
            } else {
                push(right);
                apex = { x: right.x, y: right.y };
                ai = ri;
                left = { x: apex.x, y: apex.y };
                right = { x: apex.x, y: apex.y };
                li = ai; ri = ai; i = ai;
                continue;
            }
        }
    }

    push(portals[portals.length - 1].left);
    return out;
}

export function computeCentroids(triangles) {
    return triangles.map((t) => centroidTriangle(t));
}
