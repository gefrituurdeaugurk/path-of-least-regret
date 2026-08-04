import test from 'node:test';
import assert from 'node:assert/strict';
import api, {
    buildNavMesh,
    findPath,
    pathfind,
    updatePolygon,
    ErrorCodes,
    V
} from '../lib/api.js';
import {
    SQUARE,
    L_SHAPE,
    BOWTIE,
    assertPointsClose,
    strictlyInside,
    pathLength
} from './helpers.mjs';

const CODE = { errorMode: 'code' };

test('buildNavMesh returns triangles, adjacency and centroids', () => {
    const mesh = buildNavMesh(L_SHAPE);
    assert.equal(mesh.tris.length, L_SHAPE.length - 2);
    assert.equal(mesh.adj.size, mesh.tris.length);
    assert.equal(mesh.centroids.length, mesh.tris.length);
    assert.equal(mesh.debug, undefined);
});

test('buildNavMesh copies the polygon so later caller mutation cannot corrupt the mesh', () => {
    const poly = SQUARE.map((p) => ({ ...p }));
    const mesh = buildNavMesh(poly);
    const before = JSON.stringify(mesh.polygon);
    poly[0].x = -999;
    assert.equal(JSON.stringify(mesh.polygon), before);
    for (const p of mesh.polygon) assert.ok(!poly.includes(p));
});

test('buildNavMesh normalises winding', () => {
    const cw = buildNavMesh([...SQUARE].reverse());
    const ccw = buildNavMesh(SQUARE);
    assert.equal(cw.tris.length, ccw.tris.length);
});

test('includeDebug attaches the debug field', () => {
    const mesh = buildNavMesh(SQUARE, { includeDebug: true });
    assert.equal(mesh.debug.tris, mesh.tris);
    assert.equal(mesh.debug.adj, mesh.adj);
});

test('an invalid polygon throws by default instead of building a bad mesh', () => {
    // Regression: validation errors were computed and then discarded unless
    // errorMode was 'code', so a bowtie silently produced a garbage mesh.
    assert.throws(() => buildNavMesh(BOWTIE), (err) => {
        assert.equal(err.code, ErrorCodes.SELF_INTERSECTION);
        assert.ok(Array.isArray(err.errors) && err.errors.length > 0);
        return true;
    });
    assert.throws(() => buildNavMesh([{ x: 0, y: 0 }]), (err) => {
        assert.equal(err.code, ErrorCodes.NOT_ENOUGH_VERTICES);
        return true;
    });
});

test('errorMode "code" returns a failure object rather than throwing', () => {
    const res = buildNavMesh(BOWTIE, CODE);
    assert.equal(res.ok, false);
    assert.equal(res.code, ErrorCodes.SELF_INTERSECTION);
    assert.ok(res.errors.length > 0);
});

test('validate:false skips validation', () => {
    const mesh = buildNavMesh(BOWTIE, { validate: false });
    assert.ok(Array.isArray(mesh.tris));
});

test('findPath across an L-shape bends around the inner corner', () => {
    const mesh = buildNavMesh(L_SHAPE);
    const start = { x: 350, y: 50 };
    const end = { x: 50, y: 350 };
    const res = findPath(mesh, start, end);

    assert.equal(res.ok, true);
    assertPointsClose(res.path[0], start, 'start is preserved exactly');
    assertPointsClose(res.path.at(-1), end, 'end is preserved exactly');
    assert.ok(res.path.length > 2, 'a corner is required');
    // The route must be longer than a straight line, which would cut through the wall.
    assert.ok(pathLength(res.path) > V.dist(start, end));
    for (const p of res.path) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
});

test('findPath returns no duplicate consecutive waypoints', () => {
    const mesh = buildNavMesh(L_SHAPE);
    const res = findPath(mesh, { x: 350, y: 50 }, { x: 50, y: 350 });
    for (let i = 1; i < res.path.length; i++) {
        assert.ok(V.dist(res.path[i], res.path[i - 1]) > 1e-9, `duplicate at index ${i}`);
    }
});

test('endpoints well inside the polygon are not moved by snapNudge', () => {
    // Regression: the nudge was applied unconditionally, shifting endpoints the
    // caller had deliberately placed in open space.
    const mesh = buildNavMesh(L_SHAPE);
    const start = { x: 350, y: 50 };
    const end = { x: 50, y: 350 };
    const res = findPath(mesh, start, end, { snapNudge: 5 });
    assertPointsClose(res.path[0], start);
    assertPointsClose(res.path.at(-1), end);
});

test('an endpoint on the boundary is nudged inside', () => {
    const mesh = buildNavMesh(SQUARE);
    const onEdge = { x: 50, y: 0 };
    const res = findPath(mesh, onEdge, { x: 50, y: 90 }, { snapNudge: 2 });
    assert.equal(res.ok, true);
    assert.ok(strictlyInside(res.path[0], SQUARE), 'boundary start pulled inside');
});

test('start and end in the same triangle give a direct two-point path', () => {
    const mesh = buildNavMesh(SQUARE);
    const start = { x: 10, y: 10 };
    const end = { x: 20, y: 20 };
    const res = findPath(mesh, start, end);
    assert.equal(res.ok, true);
    assert.deepEqual(res.path, [{ x: 10, y: 10 }, { x: 20, y: 20 }]);
    assert.deepEqual(res.portals, []);
    assert.equal(res.triPath.length, 1);
});

test('a same-triangle path does not alias the caller points', () => {
    const mesh = buildNavMesh(SQUARE);
    const start = { x: 10, y: 10 };
    const res = findPath(mesh, start, { x: 20, y: 20 });
    assert.notEqual(res.path[0], start);
});

test('a point outside the polygon is rejected', () => {
    const mesh = buildNavMesh(SQUARE);
    assert.throws(() => findPath(mesh, { x: -50, y: -50 }, { x: 50, y: 50 }), (err) => {
        assert.equal(err.code, ErrorCodes.OUTSIDE_POLY);
        assert.equal(err.where, 'start');
        return true;
    });

    const res = findPath(mesh, { x: 50, y: 50 }, { x: 500, y: 500 }, CODE);
    assert.equal(res.ok, false);
    assert.equal(res.code, ErrorCodes.OUTSIDE_POLY);
    assert.equal(res.where, 'end');
});

test('smoothing adds waypoints while keeping the endpoints', () => {
    const mesh = buildNavMesh(L_SHAPE);
    const start = { x: 350, y: 50 };
    const end = { x: 50, y: 350 };
    const plain = findPath(mesh, start, end);
    const smoothed = findPath(mesh, start, end, { smooth: true });

    assert.ok(smoothed.path.length > plain.path.length);
    assertPointsClose(smoothed.path[0], start);
    assertPointsClose(smoothed.path.at(-1), end);
});

test('smooth accepts a numeric iteration count and clamps it', () => {
    const mesh = buildNavMesh(L_SHAPE);
    const start = { x: 350, y: 50 };
    const end = { x: 50, y: 350 };
    const one = findPath(mesh, start, end, { smooth: 1 });
    const three = findPath(mesh, start, end, { smooth: 3 });
    const huge = findPath(mesh, start, end, { smooth: 500 });
    const five = findPath(mesh, start, end, { smooth: 5 });

    assert.ok(three.path.length > one.path.length);
    assert.equal(huge.path.length, five.path.length, 'iterations clamp at 5');
    assert.deepEqual(
        findPath(mesh, start, end, { smooth: true, smoothIterations: 3 }).path,
        three.path,
        'smooth:3 matches smoothIterations:3'
    );
});

test('smoothing a two-point path is a no-op', () => {
    const mesh = buildNavMesh(SQUARE);
    const res = findPath(mesh, { x: 10, y: 10 }, { x: 20, y: 20 }, { smooth: 3 });
    assert.equal(res.path.length, 2);
});

test('pathfind is buildNavMesh + findPath', () => {
    const direct = findPath(buildNavMesh(L_SHAPE), { x: 350, y: 50 }, { x: 50, y: 350 });
    const oneShot = pathfind(L_SHAPE, { x: 350, y: 50 }, { x: 50, y: 350 });
    assert.deepEqual(oneShot.path, direct.path);
});

test('pathfind surfaces validation failures', () => {
    const res = pathfind(BOWTIE, { x: 10, y: 10 }, { x: 20, y: 20 }, CODE);
    assert.equal(res.ok, false);
    assert.equal(res.code, ErrorCodes.SELF_INTERSECTION);
});

test('updatePolygon rebuilds only when the polygon changed', () => {
    const mesh = buildNavMesh(SQUARE);
    const unchanged = updatePolygon(mesh, SQUARE.map((p) => ({ ...p })));
    assert.equal(unchanged.changed, false);

    const bigger = SQUARE.map((p) => ({ x: p.x * 2, y: p.y * 2 }));
    const changed = updatePolygon(mesh, bigger);
    assert.equal(changed.changed, true);
    assert.equal(changed.mesh, mesh, 'the mesh is updated in place');
    assert.equal(mesh.polygon.length, bigger.length);
    assert.ok(findPath(mesh, { x: 10, y: 10 }, { x: 190, y: 190 }).ok);
});

test('updatePolygon detects a vertex count change', () => {
    const mesh = buildNavMesh(SQUARE);
    const res = updatePolygon(mesh, L_SHAPE);
    assert.equal(res.changed, true);
    assert.equal(mesh.tris.length, L_SHAPE.length - 2);
});

test('a rejected update leaves the mesh intact', () => {
    // Regression: the failure object was merged into the live mesh, leaving the
    // caller holding a half-overwritten object.
    const mesh = buildNavMesh(SQUARE);
    const snapshot = JSON.stringify(mesh.polygon);
    const triCount = mesh.tris.length;

    const res = updatePolygon(mesh, BOWTIE, CODE);
    assert.equal(res.changed, false);
    assert.equal(res.error.code, ErrorCodes.SELF_INTERSECTION);
    assert.equal(mesh.ok, undefined, 'no failure fields leaked onto the mesh');
    assert.equal(mesh.code, undefined);
    assert.equal(JSON.stringify(mesh.polygon), snapshot);
    assert.equal(mesh.tris.length, triCount);
    assert.ok(findPath(mesh, { x: 10, y: 10 }, { x: 90, y: 90 }).ok);
});

test('updatePolygon clears a stale debug field', () => {
    const mesh = buildNavMesh(SQUARE, { includeDebug: true });
    assert.ok(mesh.debug);
    updatePolygon(mesh, L_SHAPE);
    assert.equal(mesh.debug, undefined);
});

test('the default export mirrors the named exports', () => {
    assert.equal(api.buildNavMesh, buildNavMesh);
    assert.equal(api.findPath, findPath);
    assert.equal(api.pathfind, pathfind);
    assert.equal(api.updatePolygon, updatePolygon);
    assert.equal(api.math.V, V);
    for (const k of ['polyCentroid', 'nudgeInside', 'closestPointOnBoundary']) {
        assert.equal(typeof api.helpers[k], 'function');
    }
    for (const k of ['triArea2', 'area', 'isCCW', 'centroidTriangle']) {
        assert.equal(typeof api.math[k], 'function');
    }
});

test('ErrorCodes includes the validation codes', () => {
    for (const code of [
        'OUTSIDE_POLY',
        'NO_PATH',
        'NOT_ENOUGH_VERTICES',
        'DUPLICATE_ADJACENT_VERTEX',
        'SELF_INTERSECTION'
    ]) {
        assert.equal(ErrorCodes[code], code);
    }
});
