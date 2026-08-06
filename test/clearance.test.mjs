import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavMesh, findPath, isWalkable, distanceToRegionBoundary } from '../lib/api.js';
import { L_SHAPE, DONUT, ROOM, close } from './helpers.mjs';

const CODE = { errorMode: 'code' };

/** A dumbbell: two rooms joined by a neck ten units tall. */
const NECK = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 45 }, { x: 200, y: 45 },
    { x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 200, y: 100 },
    { x: 200, y: 55 }, { x: 100, y: 55 }, { x: 100, y: 100 }, { x: 0, y: 100 }
];

const build = (region) => {
    const mesh = buildNavMesh(region, CODE);
    assert.notEqual(mesh.ok, false);
    return mesh;
};

/** Closest approach of the whole path to any wall, sampled along each segment. */
function minClearance(path, region) {
    let best = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
        for (let s = 0; s <= 40; s++) {
            const t = s / 40;
            const p = {
                x: path[i].x + (path[i + 1].x - path[i].x) * t,
                y: path[i].y + (path[i + 1].y - path[i].y) * t
            };
            best = Math.min(best, distanceToRegionBoundary(p, region));
        }
    }
    return best;
}

test('clearance keeps the path off an inner corner', () => {
    const mesh = build(L_SHAPE);
    const start = { x: 50, y: 350 };
    const end = { x: 350, y: 50 };

    const hugging = findPath(mesh, start, end, CODE);
    assert.equal(hugging.ok, true);
    assert.ok(minClearance(hugging.path, mesh.region) < 1, 'the unconstrained path grazes the corner');

    const clear = findPath(mesh, start, end, { ...CODE, clearance: 15 });
    assert.equal(clear.ok, true);
    assert.ok(
        minClearance(clear.path, mesh.region) >= 15 - 1e-6,
        `the constrained path rounds it, closest approach ${minClearance(clear.path, mesh.region)}`
    );
});

test('clearance keeps the path off a hole', () => {
    const mesh = build(DONUT);
    const start = { x: 50, y: 200 };
    const end = { x: 350, y: 200 };

    const hugging = findPath(mesh, start, end, CODE);
    assert.ok(minClearance(hugging.path, mesh.region) < 1);

    const clear = findPath(mesh, start, end, { ...CODE, clearance: 20 });
    assert.equal(clear.ok, true);
    assert.deepEqual(
        clear.path.map((p) => [Math.round(p.x), Math.round(p.y)]),
        [[50, 200], [130, 130], [270, 130], [350, 200]],
        'it turns where the two offset walls meet, not 20 from the desk corner'
    );
    assert.ok(
        minClearance(clear.path, mesh.region) >= 20 - 1e-6,
        'the run past the desk keeps its distance, not just the corners'
    );
    for (const p of clear.path) assert.ok(isWalkable(mesh, p), 'every waypoint is still on the floor');
});

test('a clearance wider than the corridor fails cleanly', () => {
    const mesh = build(NECK);
    const start = { x: 20, y: 50 };
    const end = { x: 280, y: 50 };

    assert.equal(findPath(mesh, start, end, { ...CODE, clearance: 3 }).ok, true, 'a body that fits gets through');

    const tooWide = findPath(mesh, start, end, { ...CODE, clearance: 8 });
    assert.equal(tooWide.ok, false);
    assert.equal(tooWide.code, 'NO_PATH');
});

test('a clearance wider than the whole room fails rather than hanging', () => {
    const mesh = build(DONUT);
    const res = findPath(mesh, { x: 50, y: 200 }, { x: 350, y: 200 }, { ...CODE, clearance: 5000 });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'NO_PATH');
});

test('clearance does not teleport the actor off the wall it is standing against', () => {
    const mesh = build(ROOM);
    const start = { x: 1, y: 200 };
    const res = findPath(mesh, start, { x: 300, y: 200 }, { ...CODE, clearance: 40 });
    assert.equal(res.ok, true);
    assert.ok(close(res.path[0].x, 1) && close(res.path[0].y, 200), 'the start is where the actor is');
});

test('clearance pulls the destination off the wall', () => {
    const mesh = build(ROOM);
    const res = findPath(mesh, { x: 200, y: 200 }, { x: 400, y: 200 }, { ...CODE, clearance: 30 });
    assert.equal(res.ok, true);
    const end = res.path[res.path.length - 1];
    assert.ok(close(distanceToRegionBoundary(end, mesh.region), 30), `ended ${JSON.stringify(end)}`);
});

test('clearance zero is the same as not asking for any', () => {
    const mesh = build(DONUT);
    const start = { x: 30, y: 370 };
    const end = { x: 370, y: 30 };
    assert.deepEqual(
        findPath(mesh, start, end, { ...CODE, clearance: 0 }).path,
        findPath(mesh, start, end, CODE).path
    );
});

test('the same request with clearance gives the same path every time', () => {
    const mesh = build(DONUT);
    const opts = { ...CODE, clearance: 12 };
    const a = findPath(mesh, { x: 30, y: 370 }, { x: 370, y: 30 }, opts);
    const b = findPath(mesh, { x: 30, y: 370 }, { x: 370, y: 30 }, opts);
    assert.deepEqual(a.path, b.path);
});

test('includeClearance reports the room available at each waypoint', () => {
    const mesh = build(DONUT);
    const res = findPath(mesh, { x: 50, y: 200 }, { x: 350, y: 200 }, {
        ...CODE,
        clearance: 20,
        includeClearance: true
    });
    assert.equal(res.clearances.length, res.path.length);
    for (const c of res.clearances) assert.ok(c >= 20 - 1e-6, `waypoint only had ${c}`);
});

test('clearances are omitted unless asked for', () => {
    const mesh = build(ROOM);
    const res = findPath(mesh, { x: 50, y: 50 }, { x: 350, y: 350 }, CODE);
    assert.equal(res.clearances, undefined);
});

test('clearance still works alongside smoothing', () => {
    const mesh = build(DONUT);
    const res = findPath(mesh, { x: 50, y: 200 }, { x: 350, y: 200 }, {
        ...CODE,
        clearance: 20,
        smooth: 2
    });
    assert.equal(res.ok, true);
    for (const p of res.path) assert.ok(isWalkable(mesh, p));
});
