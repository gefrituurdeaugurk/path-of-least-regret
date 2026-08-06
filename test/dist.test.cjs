// Verifies the published surface: that every `exports` subpath resolves for both
// `import` and `require`, and that the CJS bundles actually carry the right symbols.
// Run against a fresh build via `npm run test:dist`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

/** Symbols each subpath must expose, in both module systems. */
const SURFACE = {
    '.': [
        'buildNavMesh', 'findPath', 'pathfind', 'updatePolygon', 'ErrorCodes', 'V',
        'facingFromVector', 'createFacingTracker', 'createHorizonLayer', 'createHorizonSet',
        'createMover', 'isWalkable', 'clampToWalkable', 'pointInRegion',
        'closestPointOnRegionBoundary', 'distanceToRegionBoundary', 'nudgeIntoRegion',
        'validateRegion'
    ],
    './math': ['V', 'triArea2', 'area', 'isCCW', 'centroidTriangle'],
    './triangulate': ['triangulate', 'triangulateRegion'],
    './navmesh': ['buildAdjacency', 'findTriIdContaining', 'aStarTriangle', 'portalsFromTriPath', 'funnel'],
    './helpers': ['polyCentroid', 'nudgeInside', 'closestPointOnBoundary', 'pointInPolygon'],
    './validate': ['validatePolygon', 'validateRegion', 'ValidationErrorCodes'],
    './facing': ['DIRECTION_SETS', 'bearingOf', 'facingFromVector', 'facingFromPoints', 'createFacingTracker'],
    './horizon': ['HorizonErrorCodes', 'createHorizonLayer', 'createHorizonSet'],
    './movement': ['EASINGS', 'pathLength', 'pointAtDistance', 'createMover']
};

test('every declared subpath points at files that exist', () => {
    for (const [subpath, conditions] of Object.entries(pkg.exports)) {
        const targets = typeof conditions === 'string' ? [conditions] : Object.values(conditions);
        for (const target of targets) {
            assert.ok(
                fs.existsSync(path.join(root, target)),
                `${subpath} -> ${target} is missing (run npm run build)`
            );
        }
    }
});

test('require() of each subpath exposes its symbols', () => {
    // Regression: every subpath's `require` condition used to resolve to the api.js
    // bundle, so require('path-of-least-regret/triangulate').triangulate was undefined.
    for (const [subpath, symbols] of Object.entries(SURFACE)) {
        const target = pkg.exports[subpath].require;
        const mod = require(path.join(root, target));
        for (const name of symbols) {
            assert.ok(mod[name] != null, `require('${subpath}').${name} is missing`);
        }
    }
});

test('import of each subpath exposes the same symbols', async () => {
    for (const [subpath, symbols] of Object.entries(SURFACE)) {
        const target = pkg.exports[subpath].import;
        const mod = await import(`file://${path.join(root, target)}`);
        for (const name of symbols) {
            assert.ok(mod[name] != null, `import '${subpath}' -> ${name} is missing`);
        }
    }
});

test('the CJS build pathfinds identically to the ESM source', async () => {
    const cjs = require(path.join(root, pkg.exports['.'].require));
    const esm = await import(`file://${path.join(root, pkg.exports['.'].import)}`);

    const poly = [
        { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 100 },
        { x: 100, y: 100 }, { x: 100, y: 400 }, { x: 0, y: 400 }
    ];
    const start = { x: 350, y: 50 };
    const end = { x: 50, y: 350 };

    const a = cjs.pathfind(poly, start, end, { smooth: 2 });
    const b = esm.pathfind(poly, start, end, { smooth: 2 });
    assert.equal(a.ok, true);
    assert.deepEqual(a.path, b.path);
});

test('the CJS build reports errors the same way', () => {
    const cjs = require(path.join(root, pkg.exports['.'].require));
    const bowtie = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    const res = cjs.pathfind(bowtie, { x: 10, y: 10 }, { x: 20, y: 20 }, { errorMode: 'code' });
    assert.equal(res.ok, false);
    assert.equal(res.code, cjs.ErrorCodes.SELF_INTERSECTION);
});

test('the CJS default export is reachable through interop', () => {
    const cjs = require(path.join(root, pkg.exports['.'].require));
    assert.equal(typeof cjs.default.pathfind, 'function');
    assert.equal(typeof cjs.default.helpers.nudgeInside, 'function');
    assert.equal(typeof cjs.default.math.triArea2, 'function');
});

test('types are declared for every code subpath', () => {
    for (const [subpath, conditions] of Object.entries(pkg.exports)) {
        if (typeof conditions === 'string' || !conditions.import) continue;
        assert.ok(conditions.types, `${subpath} has no types condition`);
        assert.ok(fs.existsSync(path.join(root, conditions.types)), `${subpath} types file missing`);
    }
});

test('sideEffects marks umd.js, which exists purely for its side effect', () => {
    // A blanket `sideEffects: false` lets bundlers drop the window.NavMeshPF attach.
    assert.ok(pkg.sideEffects.includes('./lib/umd.js'));
});

test('files whitelist ships lib and the CJS build', () => {
    for (const entry of ['lib', 'dist/cjs', 'LICENSE', 'README.md']) {
        assert.ok(pkg.files.includes(entry), `${entry} is not in "files"`);
    }
});
