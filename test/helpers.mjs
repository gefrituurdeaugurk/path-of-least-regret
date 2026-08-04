// Shared fixtures and assertions for the test suites.
import assert from 'node:assert/strict';

/** Square, counter-clockwise in a Y-down (canvas) coordinate system. */
export const SQUARE = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 }
];

/** L-shaped room: the only route between the two arms bends around the inner corner. */
export const L_SHAPE = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 400 },
    { x: 0, y: 400 }
];

/** Self-intersecting bowtie. */
export const BOWTIE = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
    { x: 0, y: 100 }
];

export const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

export function assertPointsClose(actual, expected, msg) {
    assert.ok(
        close(actual.x, expected.x) && close(actual.y, expected.y),
        msg ?? `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`
    );
}

/** Even-odd ray cast; strict, so boundary points are not counted as inside. */
export function strictlyInside(p, poly) {
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

export const pathLength = (path) =>
    path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
