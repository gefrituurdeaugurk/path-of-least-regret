#!/usr/bin/env node
// Build script: bundle ESM source in lib/api.js to a CommonJS file for require() consumers.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'dist', 'cjs');
fs.mkdirSync(outDir, { recursive: true });

esbuild.build({
  entryPoints: [path.join(__dirname, '..', 'lib', 'api.js')],
  outfile: path.join(outDir, 'index.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  banner: { js: '// Generated CommonJS bundle for path-of-least-regret' }
}).then(() => {
  console.log('Built CommonJS bundle -> dist/cjs/index.cjs');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
