import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DIRECTION_SETS,
    bearingOf,
    facingFromVector,
    facingFromPoints,
    createFacingTracker
} from '../lib/facing.js';
import { close } from './helpers.mjs';

const nameOf = (v, opts) => facingFromVector(v, opts)?.name;

/** Unit vector at a compass bearing, in screen space. */
const vecAt = (deg) => {
    const r = (deg * Math.PI) / 180;
    return { x: Math.sin(r), y: -Math.cos(r) };
};

test('bearingOf treats -y as North in screen space', () => {
    assert.ok(close(bearingOf({ x: 0, y: -1 }), 0));
    assert.ok(close(bearingOf({ x: 1, y: 0 }), 90));
    assert.ok(close(bearingOf({ x: 0, y: 1 }), 180));
    assert.ok(close(bearingOf({ x: -1, y: 0 }), 270));
});

test('the 8-way set covers every diagonal in a Y-down canvas', () => {
    assert.equal(nameOf({ x: 0, y: -1 }), 'N');
    assert.equal(nameOf({ x: 1, y: -1 }), 'NE');
    assert.equal(nameOf({ x: 1, y: 0 }), 'E');
    assert.equal(nameOf({ x: 1, y: 1 }), 'SE');
    assert.equal(nameOf({ x: 0, y: 1 }), 'S');
    assert.equal(nameOf({ x: -1, y: 1 }), 'SW');
    assert.equal(nameOf({ x: -1, y: 0 }), 'W');
    assert.equal(nameOf({ x: -1, y: -1 }), 'NW');
});

test('facingFromVector reports the raw angle and the snapped bearing', () => {
    const f = facingFromVector({ x: 1, y: -1 });
    assert.equal(f.index, 1);
    assert.equal(f.name, 'NE');
    assert.ok(close(f.angle, 45));
    assert.ok(close(f.bearing, 45));

    const off = facingFromVector({ x: 1, y: -0.2 });
    assert.equal(off.name, 'E');
    assert.ok(off.angle > 45 && off.angle < 90, 'angle stays exact');
    assert.ok(close(off.bearing, 90), 'bearing snaps to the sector centre');
});

test('the direction count changes the granularity', () => {
    assert.equal(nameOf({ x: 1, y: -0.2 }, { directions: 4 }), 'E');
    assert.equal(nameOf({ x: 1, y: -0.2 }, { directions: 8 }), 'E');
    assert.equal(nameOf({ x: 1, y: -0.2 }, { directions: 16 }), 'ENE');
    assert.equal(nameOf({ x: 0.4, y: -1 }, { directions: 16 }), 'NNE');
    assert.equal(DIRECTION_SETS[16].length, 16);
});

test('custom names and an offset rotate the set', () => {
    const opts = { names: ['right', 'down', 'left', 'up'], offset: 90 };
    assert.equal(nameOf({ x: 1, y: 0 }, opts), 'right');
    assert.equal(nameOf({ x: 0, y: 1 }, opts), 'down');
    assert.equal(nameOf({ x: -1, y: 0 }, opts), 'left');
    assert.equal(nameOf({ x: 0, y: -1 }, opts), 'up');
});

test('yUp flips the vertical axis', () => {
    assert.equal(nameOf({ x: 0, y: 1 }, { yUp: true }), 'N');
    assert.equal(nameOf({ x: 0, y: -1 }, { yUp: true }), 'S');
    assert.equal(nameOf({ x: 1, y: 0 }, { yUp: true }), 'E');
});

test('a standing character has no direction', () => {
    assert.equal(facingFromVector({ x: 0, y: 0 }), null);
    assert.equal(facingFromVector({ x: 1e-12, y: 0 }), null);
    assert.equal(facingFromVector(null), null);
    assert.equal(facingFromVector({ x: 0.4, y: 0 }, { epsilon: 1 }), null);
});

test('facingFromPoints uses the direction of travel', () => {
    assert.equal(facingFromPoints({ x: 10, y: 10 }, { x: 10, y: 0 }).name, 'N');
    assert.equal(facingFromPoints({ x: 10, y: 0 }, { x: 10, y: 10 }).name, 'S');
});

test('a bad configuration is a programmer error, so it throws', () => {
    assert.throws(() => facingFromVector({ x: 1, y: 0 }, { directions: 5 }), /unsupported direction count/);
    assert.throws(() => facingFromVector({ x: 1, y: 0 }, { names: ['N'] }), /at least 2/);
    assert.throws(() => createFacingTracker({ directions: 3 }), /unsupported direction count/);
});

test('the tracker holds its direction inside the hysteresis band', () => {
    const t = createFacingTracker({ directions: 8, hysteresis: 10 });

    assert.equal(t.update({ x: 0, y: -1 }).name, 'N');
    // 30 degrees is past the 22.5 boundary but inside the 32.5 widened sector.
    assert.equal(t.update(vecAt(30)).name, 'N');
    assert.equal(t.update(vecAt(40)).name, 'NE');
});

test('without hysteresis the tracker matches the pure function', () => {
    const t = createFacingTracker({ directions: 8 });
    const v = vecAt(30);
    assert.equal(t.update({ x: 0, y: -1 }).name, 'N');
    assert.equal(t.update(v).name, facingFromVector(v).name);
});

test('the tracker keeps the last direction while idle and clears on reset', () => {
    const t = createFacingTracker();
    assert.equal(t.current, null);
    assert.equal(t.update({ x: 0, y: 0 }), null);

    t.update({ x: -1, y: 0 });
    assert.equal(t.current.name, 'W');
    assert.equal(t.update({ x: 0, y: 0 }).name, 'W', 'standing still holds the facing');

    t.reset();
    assert.equal(t.current, null);
});

test('the tracker reports the live angle even when the sector is held', () => {
    const t = createFacingTracker({ directions: 4, hysteresis: 20 });
    t.update({ x: 0, y: -1 });
    const held = t.update(vecAt(60));
    assert.equal(held.name, 'N');
    assert.ok(close(held.angle, 60), 'angle tracks the movement, bearing does not');
    assert.ok(close(held.bearing, 0));
});

test('updateFromPoints mirrors update', () => {
    const t = createFacingTracker();
    assert.equal(t.updateFromPoints({ x: 0, y: 0 }, { x: 5, y: 5 }).name, 'SE');
    assert.equal(t.names.length, 8);
});
