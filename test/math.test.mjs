import test from 'node:test';
import assert from 'node:assert/strict';
import { V, triArea2, area, isCCW, centroidTriangle } from '../lib/math.js';
import { SQUARE, assertPointsClose, close } from './helpers.mjs';

test('V arithmetic', () => {
    assertPointsClose(V.add({ x: 1, y: 2 }, { x: 3, y: 4 }), { x: 4, y: 6 });
    assertPointsClose(V.sub({ x: 3, y: 4 }, { x: 1, y: 2 }), { x: 2, y: 2 });
    assertPointsClose(V.mul({ x: 2, y: -3 }, 2), { x: 4, y: -6 });
    assert.equal(V.dot({ x: 1, y: 2 }, { x: 3, y: 4 }), 11);
    assert.equal(V.cross({ x: 1, y: 0 }, { x: 0, y: 1 }), 1);
    assert.equal(V.len({ x: 3, y: 4 }), 5);
    assert.equal(V.dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('V.norm returns a unit vector and tolerates the zero vector', () => {
    assertPointsClose(V.norm({ x: 0, y: 5 }), { x: 0, y: 1 });
    assert.ok(close(V.len(V.norm({ x: 3, y: 4 })), 1));
    // A zero-length vector must not produce NaN.
    const z = V.norm({ x: 0, y: 0 });
    assert.ok(Number.isFinite(z.x) && Number.isFinite(z.y));
});

test('triArea2 sign follows winding', () => {
    const ccw = triArea2({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
    const cw = triArea2({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 });
    assert.ok(ccw > 0);
    assert.equal(cw, -ccw);
    // Collinear points enclose no area.
    assert.equal(triArea2({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }), 0);
});

test('area and isCCW', () => {
    assert.equal(Math.abs(area(SQUARE)), 10000);
    assert.equal(isCCW(SQUARE), area(SQUARE) > 0);
    assert.equal(isCCW([...SQUARE].reverse()), !isCCW(SQUARE));
});

test('centroidTriangle averages the vertices', () => {
    assertPointsClose(
        centroidTriangle([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }]),
        { x: 1, y: 1 }
    );
});
