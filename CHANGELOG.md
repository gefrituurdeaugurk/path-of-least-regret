# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres (lightly) to [Semantic Versioning](https://semver.org/).

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
