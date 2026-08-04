import test from 'node:test';
import assert from 'node:assert/strict';
import {
    polyCentroid,
    pointInPolygon,
    nudgeInside,
    closestPointOnSegment,
    closestPointOnBoundary
} from '../lib/helpers.js';
import { V } from '../lib/math.js';
import { SQUARE, L_SHAPE, assertPointsClose, strictlyInside } from './helpers.mjs';

test('polyCentroid of a square is its centre, regardless of winding', () => {
    assertPointsClose(polyCentroid(SQUARE), { x: 50, y: 50 });
    assertPointsClose(polyCentroid([...SQUARE].reverse()), { x: 50, y: 50 });
});

test('closestPointOnSegment clamps to the endpoints', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    assertPointsClose(closestPointOnSegment({ x: 5, y: 5 }, a, b), { x: 5, y: 0 });
    assertPointsClose(closestPointOnSegment({ x: -5, y: 1 }, a, b), a);
    assertPointsClose(closestPointOnSegment({ x: 50, y: 1 }, a, b), b);
});

test('closestPointOnSegment handles a zero-length segment', () => {
    const a = { x: 3, y: 4 };
    assertPointsClose(closestPointOnSegment({ x: 9, y: 9 }, a, { ...a }), a);
});

test('closestPointOnBoundary projects onto the nearest edge', () => {
    assertPointsClose(closestPointOnBoundary({ x: 50, y: -20 }, SQUARE), { x: 50, y: 0 });
    assertPointsClose(closestPointOnBoundary({ x: 120, y: 50 }, SQUARE), { x: 100, y: 50 });
});

test('closestPointOnBoundary degrades gracefully on unusable input', () => {
    const p = { x: 1, y: 2 };
    assertPointsClose(closestPointOnBoundary(p, []), p);
    assertPointsClose(closestPointOnBoundary(p, null), p);
});

test('nudgeInside moves a boundary point into the polygon', () => {
    const onEdge = { x: 50, y: 0 };
    const moved = nudgeInside(onEdge, SQUARE, 2);
    assert.ok(strictlyInside(moved, SQUARE), 'nudged point should be inside');
    assert.ok(Math.abs(V.dist(onEdge, moved) - 2) < 1e-9, 'moves exactly the requested distance');
});

test('nudgeInside on a convex polygon always lands inside', () => {
    for (const corner of SQUARE) {
        assert.ok(strictlyInside(nudgeInside(corner, SQUARE, 1), SQUARE));
    }
});

test('pointInPolygon is strict about the boundary', () => {
    assert.ok(pointInPolygon({ x: 50, y: 50 }, SQUARE));
    assert.ok(!pointInPolygon({ x: 150, y: 50 }, SQUARE));
    assert.ok(!pointInPolygon({ x: 50, y: 0 }, SQUARE), 'edge points are not inside');
    assert.ok(!pointInPolygon({ x: 0, y: 0 }, []), 'degenerate polygons contain nothing');
    // The notch of the L is outside it, even though it is inside the bounding box.
    assert.ok(!pointInPolygon({ x: 300, y: 300 }, L_SHAPE));
    assert.ok(pointInPolygon({ x: 50, y: 300 }, L_SHAPE));
});

test('nudgeInside works on a concave polygon whose centroid is outside it', () => {
    // Regression: the nudge used to step toward the centroid, which for an L-shaped
    // room sits in the notch — so boundary points were pushed out of the polygon.
    assert.ok(!strictlyInside(polyCentroid(L_SHAPE), L_SHAPE), 'centroid is in the notch');

    for (const onEdge of [
        { x: 200, y: 0 },    // outer edge of the horizontal arm
        { x: 400, y: 50 },   // far end of the horizontal arm
        { x: 50, y: 400 },   // far end of the vertical arm
        { x: 200, y: 100 }   // the wall facing the notch
    ]) {
        const moved = nudgeInside(onEdge, L_SHAPE, 2);
        assert.ok(strictlyInside(moved, L_SHAPE), `${JSON.stringify(onEdge)} -> ${JSON.stringify(moved)}`);
    }
});

test('nudgeInside handles clockwise winding', () => {
    const cw = [...L_SHAPE].reverse();
    const moved = nudgeInside({ x: 200, y: 100 }, cw, 2);
    assert.ok(strictlyInside(moved, cw));
});

test('nudgeInside is a no-op for a non-positive distance or unusable polygon', () => {
    const p = { x: 5, y: 5 };
    assertPointsClose(nudgeInside(p, SQUARE, 0), p);
    assertPointsClose(nudgeInside(p, [], 2), p);
});
