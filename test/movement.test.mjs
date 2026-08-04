import test from 'node:test';
import assert from 'node:assert/strict';
import { createMover, pathLength, pointAtDistance, EASINGS } from '../lib/movement.js';
import { createHorizonLayer } from '../lib/horizon.js';
import { assertPointsClose, close } from './helpers.mjs';

const STRAIGHT = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const CORNER = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

/** Runs a mover to completion in fixed steps, returning the frames it produced. */
function run(mover, dt = 1 / 60, maxFrames = 10000) {
    const frames = [];
    for (let i = 0; i < maxFrames && !mover.done; i++) frames.push(mover.step(dt));
    return frames;
}

test('pathLength sums the segments and ignores degenerate input', () => {
    assert.equal(pathLength(STRAIGHT), 100);
    assert.equal(pathLength(CORNER), 200);
    assert.equal(pathLength([{ x: 5, y: 5 }]), 0);
    assert.equal(pathLength([]), 0);
    assert.equal(pathLength(null), 0);
});

test('pathLength accepts a findPath result directly', () => {
    assert.equal(pathLength({ ok: true, path: CORNER }), 200);
});

test('pointAtDistance walks the path and clamps at both ends', () => {
    assertPointsClose(pointAtDistance(CORNER, 0).point, { x: 0, y: 0 });
    assertPointsClose(pointAtDistance(CORNER, 50).point, { x: 50, y: 0 });
    assertPointsClose(pointAtDistance(CORNER, 150).point, { x: 100, y: 50 });
    assertPointsClose(pointAtDistance(CORNER, -10).point, { x: 0, y: 0 });
    assertPointsClose(pointAtDistance(CORNER, 9999).point, { x: 100, y: 100 });
    assert.equal(pointAtDistance([], 5).point, null);
});

test('pointAtDistance reports the segment it landed on', () => {
    assert.equal(pointAtDistance(CORNER, 50).index, 0);
    assert.equal(pointAtDistance(CORNER, 150).index, 1);
    assert.ok(close(pointAtDistance(CORNER, 150).t, 0.5));
});

test('a mover starts at the first waypoint and covers speed * time', () => {
    const m = createMover(STRAIGHT, { speed: 100 });
    assertPointsClose(m.position, { x: 0, y: 0 });
    assert.equal(m.done, false);

    m.step(0.25);
    assertPointsClose(m.position, { x: 25, y: 0 });
    assert.ok(close(m.progress, 0.25));
});

test('a mover stops exactly on the last waypoint', () => {
    const m = createMover(CORNER, { speed: 100 });
    run(m);
    assertPointsClose(m.position, { x: 100, y: 100 });
    assert.equal(m.done, true);
    assert.equal(m.progress, 1);
    assert.ok(close(m.travelled, m.total));
});

test('a step past the end does not overshoot', () => {
    const m = createMover(STRAIGHT, { speed: 100 });
    const s = m.step(10);
    assertPointsClose(s.position, { x: 100, y: 0 });
    assert.equal(s.done, true);
    assert.deepEqual(m.step(1).velocity, { x: 0, y: 0 });
});

test('velocity points along the current segment at the current speed', () => {
    const m = createMover(CORNER, { speed: 60 });
    const first = m.step(0.5);
    assertPointsClose(first.velocity, { x: 60, y: 0 });

    while (m.travelled < 120) m.step(1 / 60);
    assertPointsClose(m.step(1 / 60).velocity, { x: 0, y: 60 });
});

test('a degenerate path leaves the character where it is', () => {
    const m = createMover([{ x: 7, y: 9 }], { speed: 100 });
    assert.equal(m.done, true);
    assertPointsClose(m.position, { x: 7, y: 9 });
    assert.deepEqual(m.step(1).velocity, { x: 0, y: 0 });

    const empty = createMover([], { speed: 100 });
    assert.equal(empty.done, true);
    assert.equal(empty.position, null);
});

test('easing slows the ends without changing where the path goes', () => {
    const eased = createMover(STRAIGHT, { speed: 100, easeIn: 30, easeOut: 30 });
    const flat = createMover(STRAIGHT, { speed: 100 });

    const first = eased.step(0.05);
    assert.ok(first.speed < flat.step(0.05).speed, 'starts below full speed');

    const frames = run(eased);
    const peak = Math.max(...frames.map((f) => f.speed));
    assert.ok(close(peak, 100, 1e-3), 'reaches full speed in the middle');
    assert.ok(frames[frames.length - 1].speed < 100, 'and slows down again');
    assertPointsClose(eased.position, { x: 100, y: 0 });
});

test('easing never stalls, so the character always arrives', () => {
    const m = createMover(STRAIGHT, { speed: 100, easeIn: 50, easeOut: 50, minSpeedFactor: 0.05 });
    const frames = run(m);
    assert.ok(frames.every((f) => f.speed > 0));
    assert.equal(m.done, true);
});

test('ramps longer than the path are scaled down to fit', () => {
    const m = createMover([{ x: 0, y: 0 }, { x: 10, y: 0 }], {
        speed: 100,
        easeIn: 100,
        easeOut: 100
    });
    run(m);
    assertPointsClose(m.position, { x: 10, y: 0 });
});

test('an eased walk takes longer than a constant-speed one', () => {
    const dt = 1 / 120;
    const plain = createMover(STRAIGHT, { speed: 100 });
    const eased = createMover(STRAIGHT, { speed: 100, easeIn: 40, easeOut: 40 });
    assert.ok(run(eased, dt).length > run(plain, dt).length);
});

test('easing can be named or supplied as a function', () => {
    assert.ok(close(EASINGS.linear(0.5), 0.5));
    assert.ok(close(EASINGS.smoothstep(0.5), 0.5));
    assert.ok(EASINGS.sine(0.5) > 0.5);

    const m = createMover(STRAIGHT, { speed: 100, easeIn: 50, easing: () => 1 });
    assert.ok(close(m.step(0.01).speed, 100), 'a flat curve is full speed everywhere');
    assert.throws(() => createMover(STRAIGHT, { easing: 'bouncy' }), /unknown easing/);
});

test('perspective makes a character in the distance move slower', () => {
    // Half size at the top of the scene, full size at the bottom.
    const horizons = createHorizonLayer([{ y: 0, scale: 0.5 }, { y: 200, scale: 1 }]);

    const far = createMover([{ x: 0, y: 0 }, { x: 500, y: 0 }], { speed: 100, perspective: horizons });
    const near = createMover([{ x: 0, y: 200 }, { x: 500, y: 200 }], { speed: 100, perspective: horizons });

    assert.ok(close(far.step(1).speed, 50));
    assert.ok(close(near.step(1).speed, 100));
    assert.ok(near.travelled > far.travelled);
});

test('perspective accepts a horizon set or a bare function', () => {
    const bySet = createMover(STRAIGHT, { speed: 100, perspective: { scaleAt: () => 0.25 } });
    assert.ok(close(bySet.step(1).speed, 25));

    const byFn = createMover(STRAIGHT, { speed: 100, perspective: () => 2 });
    assert.ok(close(byFn.step(0.1).speed, 200));

    assert.throws(() => createMover(STRAIGHT, { perspective: 42 }), /scaleAt/);
});

test('referenceScale says which scale the speed was quoted at', () => {
    const m = createMover(STRAIGHT, { speed: 100, perspective: () => 0.5, referenceScale: 0.5 });
    assert.ok(close(m.step(0.1).speed, 100));
});

test('a nonsensical perspective scale is ignored rather than freezing the walk', () => {
    const m = createMover(STRAIGHT, { speed: 100, perspective: () => 0 });
    assert.ok(close(m.step(0.1).speed, 100));
});

test('setPath restarts the walk and remaining() shows the road ahead', () => {
    const m = createMover(CORNER, { speed: 100 });
    m.step(0.5);
    assert.deepEqual(m.remaining(), [{ x: 100, y: 0 }, { x: 100, y: 100 }]);

    m.setPath(STRAIGHT);
    assertPointsClose(m.position, { x: 0, y: 0 });
    assert.equal(m.progress, 0);
    assert.equal(m.total, 100);
});

test('stop leaves the character standing where it got to', () => {
    const m = createMover(STRAIGHT, { speed: 100 });
    m.step(0.3);
    m.stop();
    assert.equal(m.done, true);
    assertPointsClose(m.position, { x: 30, y: 0 });
    m.step(1);
    assertPointsClose(m.position, { x: 30, y: 0 });
});

test('setSpeed changes the pace mid-walk', () => {
    const m = createMover([{ x: 0, y: 0 }, { x: 1000, y: 0 }], { speed: 100 });
    m.step(0.1);
    m.setSpeed(400);
    assert.ok(close(m.step(0.1).speed, 400));
    assert.throws(() => m.setSpeed(0), /must be positive/);
    assert.throws(() => createMover(STRAIGHT, { speed: -1 }), /must be positive/);
});
