import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildNavMesh,
    findPath,
    updatePolygon,
    isWalkable,
    clampToWalkable,
    pointInPolygon,
    pointInRegion,
    nudgeIntoRegion,
    distanceToRegionBoundary,
    validateRegion,
    ErrorCodes
} from '../lib/api.js';
import { ROOM, DESK, DONUT, SQUARE, L_SHAPE, close, pathLength } from './helpers.mjs';

const CODE = { errorMode: 'code' };

const build = (region) => {
    const mesh = buildNavMesh(region, CODE);
    assert.notEqual(mesh.ok, false, `build failed: ${mesh.code ?? ''}`);
    return mesh;
};

const triArea = (t) =>
    Math.abs((t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y)) / 2;

const coverage = (mesh) => mesh.tris.reduce((sum, t) => sum + triArea(t), 0);

/** True when the open segment a-b passes through the interior of `hole`. */
function crossesHole(a, b, hole) {
    for (let i = 0; i < hole.length; i++) {
        const c = hole[i];
        const d = hole[(i + 1) % hole.length];
        const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
        if (o1 * o2 < 0 && o3 * o4 < 0) return true;
    }
    return false;
}

test('a region with holes triangulates to exactly the walkable area', () => {
    const mesh = build(DONUT);
    assert.ok(close(coverage(mesh), 400 * 400 - 100 * 100), `covered ${coverage(mesh)}`);
});

test('the mesh reports its holes alongside the outline', () => {
    const mesh = build(DONUT);
    assert.equal(mesh.polygon.length, 4, 'polygon stays the outline');
    assert.equal(mesh.holes.length, 1);
    assert.equal(mesh.region.outline, mesh.polygon);
    assert.equal(mesh.region.holes, mesh.holes);
});

test('a bare array still builds a mesh with no holes', () => {
    const mesh = build(SQUARE);
    assert.deepEqual(mesh.holes, []);
    assert.deepEqual(mesh.region.holes, []);
});

test('rings are stored in canonical winding whatever the caller passed', () => {
    const area = (ring) => ring.reduce((s, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return s + (p.x * q.y - q.x * p.y);
    }, 0) / 2;
    const mesh = build({ outline: [...ROOM].reverse(), holes: [[...DESK].reverse()] });
    assert.ok(area(mesh.polygon) > 0, 'outline is counter-clockwise');
    assert.ok(area(mesh.holes[0]) < 0, 'holes are clockwise');
});

test('the region is copied, so mutating the caller\'s points cannot corrupt the mesh', () => {
    const holes = [DESK.map((p) => ({ ...p }))];
    const mesh = build({ outline: ROOM.map((p) => ({ ...p })), holes });
    const before = JSON.stringify(mesh.holes);
    holes[0][0].x = -999;
    assert.equal(JSON.stringify(mesh.holes), before);
});

test('a point inside a hole is not walkable', () => {
    const mesh = build(DONUT);
    assert.equal(isWalkable(mesh, { x: 200, y: 200 }), false, 'the middle of the desk');
    assert.equal(isWalkable(mesh, { x: 50, y: 200 }), true, 'the floor beside it');
    assert.equal(isWalkable(mesh, { x: 500, y: 200 }), false, 'outside the room');
});

test('pointInPolygon keeps its old, hole-blind meaning', () => {
    // Hotspots and light zones use the same helper and have no holes; changing it under
    // them would break hit-testing everywhere.
    assert.equal(pointInPolygon({ x: 200, y: 200 }, ROOM), true);
    assert.equal(pointInRegion({ x: 200, y: 200 }, { outline: ROOM, holes: [DESK] }), false);
});

test('a path round a hole does not go through it', () => {
    const mesh = build(DONUT);
    const res = findPath(mesh, { x: 50, y: 200 }, { x: 350, y: 200 }, CODE);
    assert.equal(res.ok, true);
    for (let i = 0; i < res.path.length - 1; i++) {
        assert.ok(!crossesHole(res.path[i], res.path[i + 1], mesh.holes[0]), `segment ${i} cuts the hole`);
    }
    assert.ok(pathLength(res.path) > 300, 'the detour is longer than the straight line');
});

test('the two sides of a hole are both available', () => {
    const mesh = build(DONUT);
    const up = findPath(mesh, { x: 200, y: 50 }, { x: 200, y: 350 }, CODE);
    const down = findPath(mesh, { x: 200, y: 350 }, { x: 200, y: 50 }, CODE);
    assert.equal(up.ok, true);
    assert.equal(down.ok, true);
    assert.ok(close(pathLength(up.path), pathLength(down.path), 1e-6), 'symmetric routes cost the same');
});

test('clamping out of a hole lands beside it, not across the room', () => {
    const mesh = build(DONUT);
    const p = clampToWalkable(mesh, { x: 200, y: 160 }, { inset: 2 });
    assert.ok(isWalkable(mesh, p), 'the clamped point is walkable');
    assert.ok(close(p.x, 200) && close(p.y, 148), `landed at ${JSON.stringify(p)}`);
});

test('clamping from outside the outline comes in off the nearest wall', () => {
    const mesh = build(DONUT);
    const p = clampToWalkable(mesh, { x: -50, y: 200 }, { inset: 2 });
    assert.ok(close(p.x, 2) && close(p.y, 200), `landed at ${JSON.stringify(p)}`);
});

test('clamping leaves a point that is already well inside alone', () => {
    const mesh = build(DONUT);
    const p = clampToWalkable(mesh, { x: 60, y: 60 });
    assert.deepEqual(p, { x: 60, y: 60 });
});

test('nudging off a hole edge moves away from the hole', () => {
    const region = { outline: ROOM, holes: [DESK] };
    const p = nudgeIntoRegion({ x: 200, y: 150 }, region, 5);
    assert.ok(p.y < 150, 'stepped out of the desk, not into it');
    assert.ok(pointInRegion(p, region));
});

test('distance to the boundary counts hole edges as walls', () => {
    const region = { outline: ROOM, holes: [DESK] };
    assert.ok(close(distanceToRegionBoundary({ x: 200, y: 100 }, region), 50), 'nearest wall is the desk');
    assert.ok(close(distanceToRegionBoundary({ x: 20, y: 200 }, region), 20), 'nearest wall is the outline');
});

test('endpoints are clamped off hole edges as well as off the outline', () => {
    const mesh = build(DONUT);
    const res = findPath(mesh, { x: 50, y: 50 }, { x: 200, y: 150 }, { ...CODE, snapNudge: 4 });
    assert.equal(res.ok, true);
    const end = res.path[res.path.length - 1];
    assert.ok(isWalkable(mesh, end));
    assert.ok(end.y < 150, 'the destination was pulled out of the desk, not into it');
});

test('several holes in one room', () => {
    const holes = [
        [{ x: 50, y: 50 }, { x: 110, y: 50 }, { x: 110, y: 110 }, { x: 50, y: 110 }],
        [{ x: 280, y: 280 }, { x: 340, y: 280 }, { x: 340, y: 340 }, { x: 280, y: 340 }],
        DESK
    ];
    const mesh = build({ outline: ROOM, holes });
    assert.ok(close(coverage(mesh), 400 * 400 - 100 * 100 - 60 * 60 * 2));
    for (const hole of mesh.holes) {
        const c = { x: (hole[0].x + hole[2].x) / 2, y: (hole[0].y + hole[2].y) / 2 };
        assert.equal(isWalkable(mesh, c), false);
    }
});

test('a hole in a concave room', () => {
    const holes = [[{ x: 200, y: 20 }, { x: 300, y: 20 }, { x: 300, y: 80 }, { x: 200, y: 80 }]];
    const mesh = build({ outline: L_SHAPE, holes });
    assert.equal(isWalkable(mesh, { x: 250, y: 50 }), false);
    const res = findPath(mesh, { x: 50, y: 350 }, { x: 380, y: 50 }, CODE);
    assert.equal(res.ok, true);
});

test('the same region always yields the same path', () => {
    const a = build(DONUT);
    const b = build({ outline: [...ROOM], holes: [[...DESK]] });
    const start = { x: 30, y: 380 };
    const end = { x: 370, y: 30 };
    assert.deepEqual(a.tris, b.tris);
    assert.deepEqual(findPath(a, start, end, CODE).path, findPath(b, start, end, CODE).path);
});

test('holes are bridged in a fixed order, not the order they were passed in', () => {
    const holes = [
        [{ x: 50, y: 50 }, { x: 110, y: 50 }, { x: 110, y: 110 }, { x: 50, y: 110 }],
        [{ x: 280, y: 280 }, { x: 340, y: 280 }, { x: 340, y: 340 }, { x: 280, y: 340 }]
    ];
    const a = build({ outline: ROOM, holes });
    const b = build({ outline: ROOM, holes: [...holes].reverse() });
    const start = { x: 20, y: 200 };
    const end = { x: 380, y: 200 };
    assert.deepEqual(findPath(a, start, end, CODE).path, findPath(b, start, end, CODE).path);
});

test('updatePolygon adds and removes holes', () => {
    const mesh = build(ROOM);
    assert.deepEqual(mesh.holes, []);

    const added = updatePolygon(mesh, DONUT, CODE);
    assert.equal(added.changed, true);
    assert.equal(mesh.holes.length, 1);
    assert.equal(isWalkable(mesh, { x: 200, y: 200 }), false);

    const again = updatePolygon(mesh, { outline: ROOM, holes: [DESK.map((p) => ({ ...p }))] }, CODE);
    assert.equal(again.changed, false, 'an identical region is not rebuilt');

    const cleared = updatePolygon(mesh, ROOM, CODE);
    assert.equal(cleared.changed, true);
    assert.deepEqual(mesh.holes, [], 'a bare array replaces the whole region');
    assert.equal(isWalkable(mesh, { x: 200, y: 200 }), true);
});

test('updatePolygon leaves the mesh alone when the new region is rejected', () => {
    const mesh = build(DONUT);
    const snapshot = JSON.stringify({ polygon: mesh.polygon, holes: mesh.holes });
    const res = updatePolygon(mesh, { outline: ROOM, holes: [[{ x: -50, y: -50 }, { x: -10, y: -50 }, { x: -10, y: -10 }]] }, CODE);
    assert.equal(res.changed, false);
    assert.equal(res.error.code, ErrorCodes.HOLE_OUTSIDE_OUTLINE);
    assert.equal(JSON.stringify({ polygon: mesh.polygon, holes: mesh.holes }), snapshot);
});

test('a hole outside the outline is rejected', () => {
    const errors = validateRegion({ outline: ROOM, holes: [[{ x: 500, y: 500 }, { x: 560, y: 500 }, { x: 560, y: 560 }]] });
    assert.deepEqual(errors.map((e) => e.code), [ErrorCodes.HOLE_OUTSIDE_OUTLINE]);
    assert.equal(errors[0].ring, 'hole');
    assert.equal(errors[0].ringIndex, 0);
});

test('a hole crossing the outline is rejected', () => {
    const errors = validateRegion({ outline: ROOM, holes: [[{ x: 350, y: 100 }, { x: 450, y: 100 }, { x: 450, y: 200 }, { x: 350, y: 200 }]] });
    assert.deepEqual(errors.map((e) => e.code), [ErrorCodes.HOLE_INTERSECTS_OUTLINE]);
    assert.ok(errors[0].at, 'the crossing point is reported');
});

test('a hole touching the outline is rejected with its own code', () => {
    const touching = [{ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
    const errors = validateRegion({ outline: ROOM, holes: [touching] });
    assert.deepEqual(errors.map((e) => e.code), [ErrorCodes.HOLE_TOUCHES_OUTLINE]);
});

test('overlapping and nested holes are rejected', () => {
    const overlapping = validateRegion({
        outline: ROOM,
        holes: [DESK, [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 }]]
    });
    assert.deepEqual(overlapping.map((e) => e.code), [ErrorCodes.HOLE_OVERLAP]);

    const nested = validateRegion({
        outline: ROOM,
        holes: [DESK, [{ x: 180, y: 180 }, { x: 220, y: 180 }, { x: 220, y: 220 }, { x: 180, y: 220 }]]
    });
    assert.deepEqual(nested.map((e) => e.code), [ErrorCodes.HOLE_OVERLAP]);
});

test('a broken hole is reported against its own ring', () => {
    const errors = validateRegion({ outline: ROOM, holes: [[{ x: 150, y: 150 }, { x: 250, y: 150 }]] });
    assert.equal(errors[0].code, ErrorCodes.NOT_ENOUGH_VERTICES);
    assert.equal(errors[0].ring, 'hole');
    assert.equal(errors[0].ringIndex, 0);
});

test('an invalid region throws by default', () => {
    assert.throws(
        () => buildNavMesh({ outline: ROOM, holes: [[{ x: 500, y: 500 }, { x: 560, y: 500 }, { x: 560, y: 560 }]] }),
        (err) => err.code === ErrorCodes.HOLE_OUTSIDE_OUTLINE
    );
});
