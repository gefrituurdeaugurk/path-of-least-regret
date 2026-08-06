import test from 'node:test';
import assert from 'node:assert/strict';
import { triangulate, triangulateRegion } from '../lib/triangulate.js';
import { triArea2, area } from '../lib/math.js';
import { SQUARE, L_SHAPE, BOWTIE, ROOM, DESK, close } from './helpers.mjs';

const triangleArea = (t) => Math.abs(triArea2(t[0], t[1], t[2])) / 2;
const totalArea = (tris) => tris.reduce((s, t) => s + triangleArea(t), 0);

test('degenerate input yields no triangles', () => {
    assert.deepEqual(triangulate([]), []);
    assert.deepEqual(triangulate([{ x: 0, y: 0 }, { x: 1, y: 1 }]), []);
});

test('a triangle triangulates to itself', () => {
    const tris = triangulate([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]);
    assert.equal(tris.length, 1);
});

test('an n-gon yields n-2 triangles covering its area', () => {
    for (const poly of [SQUARE, L_SHAPE]) {
        const tris = triangulate(poly);
        assert.equal(tris.length, poly.length - 2, `${poly.length}-gon`);
        assert.ok(close(totalArea(tris), Math.abs(area(poly)), 1e-6));
    }
});

test('output triangles are counter-clockwise regardless of input winding', () => {
    for (const poly of [L_SHAPE, [...L_SHAPE].reverse()]) {
        for (const t of triangulate(poly)) {
            assert.ok(triArea2(t[0], t[1], t[2]) > 0, 'triangle should be CCW');
        }
    }
});

test('triangulation reuses the input vertex objects', () => {
    // Adjacency and portal extraction rely on vertex identity.
    const tris = triangulate(SQUARE);
    for (const t of tris) {
        for (const p of t) assert.ok(SQUARE.includes(p));
    }
});

test('a concave polygon is not triangulated across its notch', () => {
    const tris = triangulate(L_SHAPE);
    // Every triangle must lie inside the L, so none may contain the excluded corner.
    const outside = { x: 300, y: 300 };
    for (const t of tris) {
        const s1 = triArea2(outside, t[0], t[1]);
        const s2 = triArea2(outside, t[1], t[2]);
        const s3 = triArea2(outside, t[2], t[0]);
        const inside = s1 > 0 && s2 > 0 && s3 > 0;
        assert.ok(!inside, 'no triangle should cover the notch');
    }
});

test('triangulateRegion reports success rather than guessing', () => {
    const res = triangulateRegion(L_SHAPE);
    assert.equal(res.ok, true);
    assert.equal(res.tris.length, L_SHAPE.length - 2);
});

test('triangulateRegion accepts a bare array or a region', () => {
    const bare = triangulateRegion(SQUARE);
    const wrapped = triangulateRegion({ outline: SQUARE, holes: [] });
    assert.equal(bare.ok, true);
    assert.equal(wrapped.ok, true);
    assert.equal(bare.tris.length, wrapped.tris.length);
});

test('a hole is cut out of the covered area, not paved over', () => {
    const res = triangulateRegion({ outline: ROOM, holes: [DESK] });
    assert.equal(res.ok, true);
    assert.ok(
        close(totalArea(res.tris), Math.abs(area(ROOM)) - Math.abs(area(DESK)), 1e-6),
        'the desk is missing from the floor'
    );
    const middleOfDesk = { x: 200, y: 200 };
    for (const t of res.tris) {
        const s1 = triArea2(middleOfDesk, t[0], t[1]);
        const s2 = triArea2(middleOfDesk, t[1], t[2]);
        const s3 = triArea2(middleOfDesk, t[2], t[0]);
        assert.ok(!(s1 > 0 && s2 > 0 && s3 > 0), 'no triangle covers the desk');
    }
});

test('several holes are all cut out', () => {
    const holes = [
        DESK,
        [{ x: 20, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 60 }],
        [{ x: 320, y: 320 }, { x: 380, y: 320 }, { x: 380, y: 380 }, { x: 320, y: 380 }]
    ];
    const res = triangulateRegion({ outline: ROOM, holes });
    assert.equal(res.ok, true);
    const expected = Math.abs(area(ROOM)) - holes.reduce((s, h) => s + Math.abs(area(h)), 0);
    assert.ok(close(totalArea(res.tris), expected, 1e-6));
});

test('a region it cannot cover fails with a message instead of half a mesh', () => {
    // Four points on a line: there is no ear to clip and no area to cover.
    const flat = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }];
    const res = triangulateRegion(flat);
    assert.equal(res.ok, false);
    assert.equal(typeof res.message, 'string');
    assert.ok(res.message.length > 0);
});

test('a hole that cannot be bridged to the outline fails', () => {
    const res = triangulateRegion({
        outline: SQUARE,
        holes: [[{ x: -10, y: -10 }, { x: 110, y: -10 }, { x: 110, y: 110 }, { x: -10, y: 110 }]]
    });
    assert.equal(res.ok, false);
    assert.ok(res.message.length > 0);
});

test('triangulateRegion does not police self-intersection', () => {
    // Ear clipping happily consumes a bowtie; catching that is validateRegion's job,
    // and buildNavMesh runs it first. Documented here so the division of labour is clear.
    assert.equal(triangulateRegion(BOWTIE).ok, true);
});

test('too few vertices is an empty mesh, not a failure', () => {
    assert.deepEqual(triangulateRegion([]), { ok: true, tris: [] });
});
