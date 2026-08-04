#!/usr/bin/env node
// Build script: bundle the ESM sources in lib/ to CommonJS files for require() consumers.
//
// One bundle per public subpath. The `exports` map used to point every subpath's `require`
// condition at a single api.js bundle, so `require('path-of-least-regret/triangulate')`
// resolved to the API surface and `.triangulate` came back undefined. Each entry point now
// gets its own bundle so the CJS and ESM surfaces match.
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist', 'cjs');

// entry in lib/ -> output basename in dist/cjs/. Keep in sync with `exports` in package.json.
const ENTRIES = {
  'api.js': 'index.cjs',
  'math.js': 'math.cjs',
  'triangulate.js': 'triangulate.cjs',
  'navmesh.js': 'navmesh.cjs',
  'helpers.js': 'helpers.cjs',
  'validate.js': 'validate.cjs',
  'facing.js': 'facing.cjs',
  'horizon.js': 'horizon.cjs',
  'movement.js': 'movement.cjs'
};

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  await Promise.all(
    Object.entries(ENTRIES).map(([entry, outfile]) =>
      esbuild.build({
        entryPoints: [path.join(root, 'lib', entry)],
        outfile: path.join(outDir, outfile),
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node18',
        sourcemap: true,
        banner: { js: '// Generated CommonJS bundle for path-of-least-regret' }
      })
    )
  );

  console.log(`Built ${Object.keys(ENTRIES).length} CommonJS bundles -> dist/cjs/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
