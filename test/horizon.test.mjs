import test from 'node:test';
import assert from 'node:assert/strict';
import { createHorizonLayer, createHorizonSet, HorizonErrorCodes } from '../lib/horizon.js';
import { close } from './helpers.mjs';

const GROUND = [{ y: 216, scale: 0.5 }, { y: 576, scale: 1.1 }];

test('two horizons interpolate linearly between their scales', () => {
    const layer = createHorizonLayer(GROUND);
    assert.ok(close(layer.scaleAt({ x: 0, y: 216 }), 0.5));
    assert.ok(close(layer.scaleAt({ x: 0, y: 576 }), 1.1));
    assert.ok(close(layer.scaleAt({ x: 0, y: 396 }), 0.8));
    assert.ok(close(layer.scaleAt({ x: 999, y: 396 }), 0.8), 'x is irrelevant for horizontal horizons');
});

test('points beyond the outermost horizon clamp instead of extrapolating', () => {
    const layer = createHorizonLayer(GROUND);
    assert.equal(layer.scaleAt({ x: 0, y: 0 }), 0.5);
    assert.equal(layer.scaleAt({ x: 0, y: -5000 }), 0.5);
    assert.equal(layer.scaleAt({ x: 0, y: 720 }), 1.1);
    assert.equal(layer.minScale, 0.5);
    assert.equal(layer.maxScale, 1.1);
});

test('horizons may be given in any order', () => {
    const a = createHorizonLayer(GROUND);
    const b = createHorizonLayer([...GROUND].reverse());
    for (const y of [0, 216, 300, 396, 576, 700]) {
        assert.ok(close(a.scaleAt({ x: 0, y }), b.scaleAt({ x: 0, y })));
    }
});

test('three or more horizons form a piecewise ramp', () => {
    const layer = createHorizonLayer([
        { y: 0, scale: 0.2 },
        { y: 100, scale: 1 },
        { y: 200, scale: 1.2 }
    ]);
    assert.ok(close(layer.scaleAt({ x: 0, y: 50 }), 0.6));
    assert.ok(close(layer.scaleAt({ x: 0, y: 150 }), 1.1));
});

test('a tilted horizon makes the scale depend on x as well', () => {
    const layer = createHorizonLayer([
        { a: { x: 0, y: 100 }, b: { x: 100, y: 200 }, scale: 0.5 },
        { y: 400, scale: 1 }
    ]);

    assert.ok(close(layer.scaleAt({ x: 0, y: 100 }), 0.5));
    assert.ok(close(layer.scaleAt({ x: 100, y: 200 }), 0.5));
    assert.ok(close(layer.scaleAt({ x: 100, y: 150 }), 0.5), 'above the tilted line, so clamped');
    assert.ok(close(layer.scaleAt({ x: 0, y: 250 }), 0.75));
    assert.ok(close(layer.scaleAt({ x: 100, y: 300 }), 0.75));
});

test('a layer needs at least two horizons', () => {
    assert.throws(() => createHorizonLayer([{ y: 0, scale: 1 }]), /at least 2 horizons/);
    const res = createHorizonLayer([], { errorMode: 'code' });
    assert.equal(res.ok, false);
    assert.equal(res.code, HorizonErrorCodes.NOT_ENOUGH_HORIZONS);
});

test('malformed horizons are rejected with their index', () => {
    const missingY = createHorizonLayer(
        [{ y: 0, scale: 1 }, { scale: 2 }],
        { errorMode: 'code' }
    );
    assert.equal(missingY.code, HorizonErrorCodes.INVALID_HORIZON);
    assert.equal(missingY.index, 1);

    const noScale = createHorizonLayer([{ y: 0 }, { y: 10, scale: 1 }], { errorMode: 'code' });
    assert.equal(noScale.code, HorizonErrorCodes.INVALID_HORIZON);
    assert.equal(noScale.index, 0);

    // A vertical line has no single y per x, so it cannot bracket anything.
    const vertical = createHorizonLayer(
        [{ a: { x: 5, y: 0 }, b: { x: 5, y: 10 }, scale: 1 }, { y: 100, scale: 2 }],
        { errorMode: 'code' }
    );
    assert.equal(vertical.code, HorizonErrorCodes.INVALID_HORIZON);
    assert.throws(
        () => createHorizonLayer([{ a: { x: 5, y: 0 }, b: { x: 5, y: 10 }, scale: 1 }, { y: 100, scale: 2 }]),
        (err) => err.code === HorizonErrorCodes.INVALID_HORIZON
    );
});

test('the layer copies its horizons, so later mutation cannot corrupt it', () => {
    const input = [{ y: 100, scale: 0.5 }, { y: 300, scale: 1 }];
    const layer = createHorizonLayer(input);
    input[0].y = -9999;
    assert.ok(close(layer.scaleAt({ x: 0, y: 200 }), 0.75));
});

test('a set starts on its first layer and switches on demand', () => {
    const set = createHorizonSet({
        ground: GROUND,
        balcony: [{ y: 120, scale: 0.25 }, { y: 400, scale: 0.6 }]
    });

    assert.deepEqual(set.ids, ['ground', 'balcony']);
    assert.equal(set.active, 'ground');
    assert.ok(close(set.scaleAt({ x: 0, y: 396 }), 0.8));

    set.use('balcony');
    assert.equal(set.active, 'balcony');
    assert.ok(close(set.scaleAt({ x: 0, y: 260 }), 0.425));

    // An explicit id samples another layer without disturbing the active one.
    assert.ok(close(set.scaleAt({ x: 0, y: 396 }, 'ground'), 0.8));
    assert.equal(set.active, 'balcony');
});

test('a set accepts prebuilt layers as well as raw horizons', () => {
    const built = createHorizonLayer(GROUND);
    const set = createHorizonSet({ ground: built });
    assert.equal(set.layer('ground'), built);
    assert.equal(set.layer(), built);
});

test('unknown and missing layers are reported', () => {
    const set = createHorizonSet({ ground: GROUND });
    assert.equal(set.layer('nope'), null);
    assert.throws(() => set.use('nope'), /No horizon layer named "nope"/);

    const coded = createHorizonSet({ ground: GROUND }, { errorMode: 'code' });
    const res = coded.use('nope');
    assert.equal(res.ok, false);
    assert.equal(res.code, HorizonErrorCodes.UNKNOWN_LAYER);
    assert.equal(res.layer, 'nope');

    const empty = createHorizonSet({}, { errorMode: 'code' });
    assert.equal(empty.code, HorizonErrorCodes.NO_LAYERS);
    assert.throws(() => createHorizonSet({}), /at least one layer/);
});

test('a set surfaces a failing layer with its id', () => {
    const res = createHorizonSet({ ground: GROUND, broken: [{ y: 0, scale: 1 }] }, { errorMode: 'code' });
    assert.equal(res.ok, false);
    assert.equal(res.code, HorizonErrorCodes.NOT_ENOUGH_HORIZONS);
    assert.equal(res.layer, 'broken');
});
