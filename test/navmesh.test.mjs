import test from 'node:test';
import assert from 'node:assert/strict';
import { triangulate } from '../lib/triangulate.js';
import {
    buildAdjacency,
    pointInTri,
    findTriIdContaining,
    aStarTriangle,
    portalsFromTriPath,
    funnel,
    computeCentroids
} from '../lib/navmesh.js';
import { SQUARE, L_SHAPE, assertPointsClose } from './helpers.mjs';

const TRI = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];

test('pointInTri covers interior, edges and exterior', () => {
    assert.ok(pointInTri({ x: 1, y: 1 }, TRI));
    assert.ok(pointInTri({ x: 5, y: 0 }, TRI), 'edge points count as inside');
    assert.ok(pointInTri({ x: 0, y: 0 }, TRI), 'vertices count as inside');
    assert.ok(!pointInTri({ x: 9, y: 9 }, TRI));
    assert.ok(!pointInTri({ x: -1, y: 5 }, TRI));
});

test('findTriIdContaining returns null outside the mesh', () => {
    const tris = triangulate(SQUARE);
    assert.notEqual(findTriIdContaining({ x: 50, y: 50 }, tris), null);
    assert.equal(findTriIdContaining({ x: 500, y: 500 }, tris), null);
});

test('adjacency is symmetric and each interior edge joins exactly two triangles', () => {
    const tris = triangulate(L_SHAPE);
    const adj = buildAdjacency(tris);

    assert.equal(adj.size, tris.length, 'every triangle has an entry');

    for (const [from, links] of adj) {
        for (const { to } of links) {
            assert.notEqual(to, from, 'a triangle is not adjacent to itself');
            const back = adj.get(to).filter((e) => e.to === from);
            assert.equal(back.length, 1, `${to} should link back to ${from} exactly once`);
        }
        // An interior edge is shared by 2 triangles, so a triangle has at most 3 neighbours.
        assert.ok(links.length <= 3, 'at most three neighbours per triangle');
    }
});

test('adjacency edges belong to the triangle that owns them', () => {
    // portalsFromTriPath finds a triangle's third vertex by identity, so the stored
    // edge must come from the source triangle rather than its neighbour.
    const tris = triangulate(L_SHAPE);
    const adj = buildAdjacency(tris);
    for (const [from, links] of adj) {
        for (const { edge } of links) {
            assert.ok(tris[from].includes(edge[0]) && tris[from].includes(edge[1]));
        }
    }
});

test('the triangle graph of a simple polygon is fully connected', () => {
    const tris = triangulate(L_SHAPE);
    const adj = buildAdjacency(tris);
    const centroids = computeCentroids(tris);
    for (let i = 0; i < tris.length; i++) {
        const path = aStarTriangle(0, i, tris, adj, centroids);
        assert.ok(path, `triangle ${i} should be reachable`);
        assert.equal(path[0], 0);
        assert.equal(path.at(-1), i);
    }
});

test('aStarTriangle handles null endpoints and same-triangle queries', () => {
    const tris = triangulate(SQUARE);
    const adj = buildAdjacency(tris);
    assert.equal(aStarTriangle(null, 0, tris, adj), null);
    assert.equal(aStarTriangle(0, null, tris, adj), null);
    assert.deepEqual(aStarTriangle(0, 0, tris, adj), [0]);
});

test('aStarTriangle returns null for a disconnected graph', () => {
    const tris = triangulate(SQUARE);
    const adj = new Map([[0, []], [1, []]]);
    assert.equal(aStarTriangle(0, 1, tris, adj, computeCentroids(tris)), null);
});

test('portals are consecutive and end at the goal', () => {
    const tris = triangulate(L_SHAPE);
    const adj = buildAdjacency(tris);
    const start = { x: 350, y: 50 };
    const end = { x: 50, y: 350 };
    const triPath = aStarTriangle(
        findTriIdContaining(start, tris),
        findTriIdContaining(end, tris),
        tris,
        adj,
        computeCentroids(tris)
    );
    const portals = portalsFromTriPath(triPath, tris, start, end, adj);

    assert.equal(portals.length, triPath.length, 'one portal per crossing, plus the goal');
    assertPointsClose(portals.at(-1).left, end);
    assertPointsClose(portals.at(-1).right, end);
});

test('portalsFromTriPath agrees with and without an adjacency map', () => {
    const tris = triangulate(L_SHAPE);
    const adj = buildAdjacency(tris);
    const start = { x: 350, y: 50 };
    const end = { x: 50, y: 350 };
    const triPath = aStarTriangle(
        findTriIdContaining(start, tris),
        findTriIdContaining(end, tris),
        tris,
        adj,
        computeCentroids(tris)
    );
    assert.deepEqual(
        portalsFromTriPath(triPath, tris, start, end, adj),
        portalsFromTriPath(triPath, tris, start, end)
    );
});

test('funnel across a straight corridor produces just the endpoints', () => {
    const start = { x: 0, y: 5 };
    const end = { x: 30, y: 5 };
    const portals = [
        { left: { x: 10, y: 10 }, right: { x: 10, y: 0 } },
        { left: { x: 20, y: 10 }, right: { x: 20, y: 0 } },
        { left: end, right: end }
    ];
    const path = funnel(start, portals);
    assert.equal(path.length, 2, 'no intermediate corners on a straight run');
    assertPointsClose(path[0], start);
    assertPointsClose(path.at(-1), end);
});

test('funnel never emits duplicate consecutive waypoints', () => {
    const tris = triangulate(L_SHAPE);
    const adj = buildAdjacency(tris);
    const centroids = computeCentroids(tris);
    const start = { x: 350, y: 50 };
    const end = { x: 50, y: 350 };
    const triPath = aStarTriangle(
        findTriIdContaining(start, tris),
        findTriIdContaining(end, tris),
        tris,
        adj,
        centroids
    );
    const path = funnel(start, portalsFromTriPath(triPath, tris, start, end, adj));

    for (let i = 1; i < path.length; i++) {
        const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        assert.ok(d > 1e-9, `duplicate waypoint at index ${i}: ${JSON.stringify(path[i])}`);
    }
});

test('computeCentroids returns one centroid per triangle', () => {
    const tris = triangulate(L_SHAPE);
    assert.equal(computeCentroids(tris).length, tris.length);
});
