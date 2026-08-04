// The demo needs a browser to run, but it can still be parsed and link-checked:
// esbuild resolves every import and fails on an unresolved specifier or syntax error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import esbuild from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const entry of ['demo/main.js', 'demo/render.js', 'lib/umd.js']) {
    test(`${entry} parses and resolves its imports`, async () => {
        const result = await esbuild.build({
            entryPoints: [path.join(root, entry)],
            bundle: true,
            write: false,
            format: 'esm',
            platform: 'browser',
            logLevel: 'silent'
        });
        assert.equal(result.errors.length, 0);
    });
}

test('the demo imports only names the library actually exports', async () => {
    // A typo'd import would bundle to `undefined` rather than failing, so check
    // the demo's specifiers against the real module surfaces.
    const main = await import(`file://${path.join(root, 'demo/main.js')}`).catch((err) => err);
    // Importing main.js touches the DOM, so it is expected to throw a ReferenceError
    // rather than a module resolution error.
    assert.ok(main instanceof Error, 'demo/main.js needs a DOM');
    assert.ok(
        !/does not provide an export|Cannot find module/.test(main.message),
        `unexpected module error: ${main.message}`
    );
});
