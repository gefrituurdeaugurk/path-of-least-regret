# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres (lightly) to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-08-06

### Added

- **Obstacles (holes).** Every entry point that took a `Point[]` now also takes
  `{ outline, holes }`, so a room can have a desk in the middle of it. A bare array is
  still a region with no holes, so existing calls are unchanged. `buildNavMesh` returns
  `holes` and `region` alongside `polygon`, which still holds the outline. Holes are
  bridged into the outline before ear clipping (Eberly's method), sorted deterministically
  so the same input always produces the same mesh. New error codes `HOLE_OUTSIDE_OUTLINE`,
  `HOLE_INTERSECTS_OUTLINE`, `HOLE_TOUCHES_OUTLINE` and `HOLE_OVERLAP`; a hole that so
  much as touches another ring is rejected rather than silently joined.
- **`isWalkable(mesh, p)` and `clampToWalkable(mesh, p, { inset })`.** With holes in play,
  "inside the outline" and "somewhere the character can stand" stop being the same
  question. `clampToWalkable` pushes a point out of a hole and off the walls in one call.
  `pointInPolygon` is unchanged and still answers only about the single ring you give it.
- **`validateRegion(region, opts?)`**, and validation errors that say *where*. Every error
  now carries `ring` (`'outline' | 'hole'`) and, for holes, `ringIndex`; plus `index`,
  `edges: [i, j]` for a self-intersection, and `at` — the point where it actually goes
  wrong. `ring` and `ringIndex` are separate fields on purpose: hole `0` is a real hole, so
  a single merged field would read as falsy for the first one. Both validators accept
  `{ all: true }` to collect every fault rather than stopping at the first of each kind.
- **`clearance` and `includeClearance` on `findPath` / `pathfind`.** Keeps the path off
  the scenery so a character with a body does not clip it: A* refuses portals narrower than
  `2 × clearance`, each corner the path turns is offset along its interior bisector far
  enough that both walls stay clear, and the destination is pulled inside. The start is
  not moved — an actor already against a wall stays where it is. A route too tight for the
  requested clearance fails as `NO_PATH` rather than returning a clipping path.
  `includeClearance: true` adds a `clearances` array, one measured distance per waypoint.
  The guarantee is local: it constrains the corners and the runs between them, not every
  point on the path, and a path with clearance is no longer the shortest one.
- **`triangulateRegion(region)`** (`path-of-least-regret/triangulate`), which returns
  `{ ok, tris }` or `{ ok: false, message }` instead of silently handing back a partial
  mesh. `buildNavMesh` uses it and reports `TRIANGULATION_FAILED`. `triangulate()` itself
  is unchanged, partial returns and all, because it is a published export.
- The demo gained obstacles — add, drag, right-click to remove — and a clearance control.
  The README gained sections on obstacles, walkability, clearance, validation diagnostics,
  the winding convention, and an explicit list of what this library deliberately does not
  do (no 3D or z-levels, no weighted regions, no serialised meshes).
- **Facing helper** (`path-of-least-regret/facing`). Turns a movement vector into one of 4,
  8 or 16 compass directions so an integrator can pick a sprite row: `facingFromVector`,
  `facingFromPoints`, `bearingOf`, the `DIRECTION_SETS` presets, and `createFacingTracker`,
  which remembers its last answer and applies a hysteresis deadzone so a character walking
  along a sector boundary does not flicker between two sprites.
- **Horizon helper** (`path-of-least-regret/horizon`). `createHorizonLayer` builds a scale
  ramp from two or more horizons — `{ y, scale }`, or `{ a, b, scale }` for a tilted one —
  and interpolates the character scale between them, clamping beyond the outermost.
  `createHorizonSet` holds several named layers with one active at a time, for scenes where
  walking out of view puts the actor on a different depth plane. New error codes
  `NO_LAYERS`, `NOT_ENOUGH_HORIZONS`, `INVALID_HORIZON` and `UNKNOWN_LAYER`.
- **Movement helper** (`path-of-least-regret/movement`). `createMover` turns a path into a
  per-frame position: `speed` in units per second, `easeIn`/`easeOut` ramps measured in
  distance rather than time, a choice of `smoothstep`, `sine`, `linear` or custom easing,
  and an optional `perspective` cue — hand it a horizon layer or set and a character in the
  distance walks slower in proportion to its scale. Each `step(dt)` reports position,
  velocity, speed, progress and completion; `setPath`, `setSpeed`, `stop` and `remaining`
  cover redirecting and drawing. `pathLength` and `pointAtDistance` are exported alongside.
- All three helpers are re-exported from the main entry point and therefore from
  `window.NavMeshPF`, and the demo now uses them: a facing arrow and label on the actor, a
  direction-count and hysteresis selector, draggable horizon lines, and speed, easing and
  perspective-speed controls.
- The README gains an "Integrator helpers" section documenting each helper with worked
  examples, plus a combined game-loop example wiring all three together.

### Fixed

- **`pointInTri` accepted points far outside the triangle.** The edge-inclusive test
  treated a near-zero signed area as "on the edge", which is true of any point collinear
  with an edge's *line*, however distant. Without holes this was mostly invisible; with
  them, the middle of a desk reported as walkable. Now a point must not be on opposite
  sides of two edges. All previously passing tests still pass.
- **`updatePolygon` reported a change every time when holes were involved.** It compared
  the caller's raw geometry against the normalised copy in the mesh, which differ by
  winding. It now normalises both first, which also makes re-submitting the same outline
  wound the other way correctly report `changed: false`.

### Changed

- `ErrorCode` gained five members. Additive for every normal use, but a `switch` over it
  with an exhaustive `never` guard will now fail to compile until the new cases are
  handled.
- `Mesh` gained required `holes` and `region` fields. Anything constructing a `Mesh`
  literal rather than calling `buildNavMesh` will need them; nothing that only consumes
  meshes is affected.

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
