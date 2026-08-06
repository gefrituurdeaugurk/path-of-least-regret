import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolygon, validateRegion, ValidationErrorCodes } from '../lib/validate.js';
import { SQUARE, L_SHAPE, BOWTIE, ROOM, DESK, close } from './helpers.mjs';

const codes = (poly) => validatePolygon(poly).map((e) => e.code);

test('valid polygons produce no errors', () => {
    assert.deepEqual(codes(SQUARE), []);
    assert.deepEqual(codes(L_SHAPE), []);
    assert.deepEqual(codes([...L_SHAPE].reverse()), [], 'winding is not a validation concern');
});

test('too few vertices', () => {
    for (const poly of [[], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }], null]) {
        assert.deepEqual(codes(poly), [ValidationErrorCodes.NOT_ENOUGH_VERTICES]);
    }
});

test('duplicate adjacent vertices are reported', () => {
    const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    assert.ok(codes(poly).includes(ValidationErrorCodes.DUPLICATE_ADJACENT_VERTEX));
});

test('a closing duplicate vertex is reported', () => {
    // Last vertex repeats the first: the wrap-around edge is zero length.
    const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
    assert.ok(codes(poly).includes(ValidationErrorCodes.DUPLICATE_ADJACENT_VERTEX));
});

test('self intersection is reported', () => {
    assert.ok(codes(BOWTIE).includes(ValidationErrorCodes.SELF_INTERSECTION));
});

test('errors carry a human-readable message', () => {
    for (const err of validatePolygon(BOWTIE)) {
        assert.equal(typeof err.message, 'string');
        assert.ok(err.message.length > 0);
    }
});

test('a self intersection says which edges cross and where', () => {
    const [err] = validatePolygon(BOWTIE);
    assert.equal(err.code, ValidationErrorCodes.SELF_INTERSECTION);
    assert.deepEqual(err.edges, [0, 2], 'edge 0 crosses edge 2');
    assert.equal(err.index, 0, 'index points at the first of the two');
    assert.ok(close(err.at.x, 50) && close(err.at.y, 50), `crossed at ${JSON.stringify(err.at)}`);
});

test('a duplicate vertex says which one and where', () => {
    const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const [err] = validatePolygon(poly);
    assert.equal(err.code, ValidationErrorCodes.DUPLICATE_ADJACENT_VERTEX);
    assert.equal(err.index, 1, 'the vertex whose next is identical');
    assert.deepEqual(err.at, { x: 10, y: 0 });
});

test('plain polygon errors are attributed to the outline', () => {
    for (const err of validatePolygon(BOWTIE)) {
        assert.equal(err.ring, 'outline');
        assert.equal(err.ringIndex, undefined);
    }
});

test('by default validation reports one fault of each kind, all: true collects them', () => {
    // Two duplicated vertices and more than one crossing, so there is plenty to find.
    const messy = [
        { x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 100 },
        { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 0, y: 100 }
    ];
    const first = validatePolygon(messy);
    assert.deepEqual(
        first.map((e) => e.code),
        [ValidationErrorCodes.DUPLICATE_ADJACENT_VERTEX, ValidationErrorCodes.SELF_INTERSECTION],
        'the default stops after the first of each'
    );
    assert.ok(validatePolygon(messy, { all: true }).length > first.length, 'all: true keeps looking');
});

test('too few vertices short-circuits even with all: true', () => {
    assert.deepEqual(
        validatePolygon([{ x: 0, y: 0 }], { all: true }).map((e) => e.code),
        [ValidationErrorCodes.NOT_ENOUGH_VERTICES],
        'there is nothing further to say about two points'
    );
});

test('a region reports which ring is broken', () => {
    const region = { outline: ROOM, holes: [BOWTIE] };
    const [err] = validateRegion(region);
    assert.equal(err.code, ValidationErrorCodes.SELF_INTERSECTION);
    assert.equal(err.ring, 'hole');
    assert.equal(err.ringIndex, 0);
});

test('a sound region validates clean', () => {
    assert.deepEqual(validateRegion({ outline: ROOM, holes: [DESK] }), []);
    assert.deepEqual(validateRegion(ROOM), [], 'a bare array is a region with no holes');
    assert.deepEqual(
        validateRegion({ outline: ROOM }),
        [],
        'holes may be left out entirely'
    );
});

test('region errors name the hole that caused them', () => {
    const far = DESK.map((p) => ({ x: p.x + 1000, y: p.y }));
    const [err] = validateRegion({ outline: ROOM, holes: [DESK, far] });
    assert.equal(err.code, ValidationErrorCodes.HOLE_OUTSIDE_OUTLINE);
    assert.equal(err.ring, 'hole');
    assert.equal(err.ringIndex, 1, 'the second hole, not the first');
});
