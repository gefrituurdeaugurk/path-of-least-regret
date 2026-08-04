# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres (lightly) to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-08-04

Correctness and packaging release. Several fixes change observable behaviour; the
"Changed" entries below are the ones to read before upgrading.

### Fixed

- **Broken CommonJS subpath exports.** Every subpath's `require` condition resolved to the
  `api.js` bundle, so `require('path-of-least-regret/triangulate').triangulate`,
  `.../navmesh`'s `funnel`, `.../validate`'s `validatePolygon` and most of `.../math` were
  all `undefined`. Each subpath now has its own CJS bundle.
- **Invalid polygons were accepted silently.** `buildNavMesh` computed validation errors
  and then discarded them unless `errorMode: 'code'` was set, so a self-intersecting
  polygon produced a garbage mesh with no signal.
- **Duplicate waypoints.** The funnel emitted the same point twice when consecutive apex
  advances landed on one corner, yielding zero-length path segments.
- **Endpoints were moved unnecessarily.** `snapNudge` was applied to both endpoints
  unconditionally, displacing points the caller had deliberately placed in open space.
- **`nudgeInside` pushed points out of concave polygons.** It stepped toward the polygon
  centroid, which for an L-shaped room lies outside the polygon.
- **A rejected `updatePolygon` corrupted the mesh.** The failure object was merged into the
  live mesh, leaving the caller holding a half-overwritten object.
- **Meshes aliased caller-owned points.** `buildNavMesh` shallow-copied the vertex array,
  so mutating your own point objects silently corrupted an existing mesh.
- **`sideEffects: false` could drop `lib/umd.js`**, whose only purpose is to attach
  `window.NavMeshPF`. It is now listed as side-effectful.
- **`api.d.ts` did not describe the library.** `Triangle` was `{a,b,c}` rather than a
  tuple, `adj` was `number[][]` rather than a `Map`, `V.scale` did not exist (it is `mul`),
  and `norm`, the default export, `Portal` and the `helpers`/`math` namespaces were missing.
- **README documented an API that never shipped** — a four-argument `findPath`, a
  `{ waypoints, trianglePath }` result, `errorMode: 'null'`, and the error codes
  `START_OUTSIDE` / `GOAL_OUTSIDE` / `NO_TRI_PATH`.

### Changed

- `buildNavMesh` now defaults to `errorMode: 'throw'` and reports validation failures
  instead of ignoring them. Pass `validate: false` for the previous permissive behaviour.
- `snapNudge` only applies to an endpoint within that distance of the outline, and moves it
  along the inward normal of the nearest edge rather than toward the centroid.
- `findPath` returns `portals: []` and a single-element `triPath` when start and end share
  a triangle, instead of omitting them.
- `updatePolygon` returns `{ changed: false, error }` on a rejected polygon and clears a
  stale `debug` field on rebuild.
- `buildAdjacency` builds adjacency by edge hashing — O(t) rather than the previous O(t²)
  pairwise scan — and stores each shared edge as the owning triangle's own vertices.
- `package.json` is tracked in git again; it had been listed in `.gitignore`, so the
  published manifest existed only on npm.
- `dist/` is no longer committed. `prepublishOnly` builds and verifies it.

### Added

- `pointInPolygon(p, poly, eps?)` in `helpers` — a strict interior test that is
  well-defined for points lying on the outline.
- `smooth` accepts a number as an iteration count (`{ smooth: 3 }`), matching what the
  README always claimed. Iterations are clamped to 1..5.
- `triArea2`, `area`, `isCCW`, `centroidTriangle` and `pointInTri` as named exports of the
  main entry point.
- `.d.ts` files for every subpath export, plus an `npm run typecheck` script.
- A `node:test` suite (69 tests) covering math, triangulation, adjacency, A*, the funnel,
  validation, helpers, the public API, the built CJS bundles and the demo's imports.
- `portalsFromTriPath` accepts an optional adjacency map to reuse already-computed edges.
- GitHub Actions CI across Node 18/20/22/24.

### Dependencies

- esbuild `^0.21.5` → `^0.28.1` (dev only; the package has no runtime dependencies).
- Declared `engines: { node: ">=18" }`; the CJS build target moved from `node16` to `node18`.

## [0.1.0] - 2025-09-09

### Added

- Initial public API: `buildNavMesh`, `findPath`, `pathfind`, `updatePolygon`, vector helpers `V`, error & validation codes.
- Triangulation (ear clipping), triangle adjacency, A* over triangle graph, robust funnel path extraction.
- Optional path smoothing (Chaikin-like) with iterations control.
- Polygon validation (basic: vertex count, duplicate adjacent, self-intersection check) with error codes.
- Centroid caching for A* heuristic performance.
- Diff-style polygon update (`updatePolygon`) to avoid unnecessary rebuilds.
- ESM distribution (`lib/`), TypeScript definitions (`lib/api.d.ts`), UMD global (`lib/umd.js`).
- Demo application (`demo/`) with interactive polygon editor and path visualization.
- Smoothing & debug UI toggles in the demo.
- CommonJS build output (bundled via esbuild) at `dist/cjs/index.cjs` plus dual package `exports` field.

### Notes

- CommonJS consumers should be able to `require('path-of-least-regret')`; ESM is the canonical form.
