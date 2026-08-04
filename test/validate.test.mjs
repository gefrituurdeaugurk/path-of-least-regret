import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolygon, ValidationErrorCodes } from '../lib/validate.js';
import { SQUARE, L_SHAPE, BOWTIE } from './helpers.mjs';

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
