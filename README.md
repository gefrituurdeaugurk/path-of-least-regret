Path Of Least Regret - NavMesh Pathfinding
========================

This library and demo showcases simple polygon editing, triangulation, A* across triangle adjacency, and a robust funnel (string pulling) to produce a smooth path, akin to 2D point 'n click adventure games.

Structure
---------

```text
lib/                – Reusable library (no UI)
 math.js            – Vector & geometry primitives
 triangulate.js     – Ear‑clipping polygon triangulation
 navmesh.js         – Navmesh adjacency, A*, portals, funnel, centroids
 helpers.js         – Misc helpers (centroid, nudgeInside, closest point)
 validate.js        – Polygon validation
 api.js             – Public API surface (ESM exports + named helpers)
 api.d.ts           – TypeScript definitions for the API
 umd.js             – UMD style global attach (window.NavMeshPF)

demo/               – Browser demo UI (editing + visualization)
 main.js            – State management, interaction, animation loop
 render.js          – Canvas rendering routines

index.html          – Loads demo/main.js
styles.css          – UI / layout styles
```

How to run
----------

Just open `index.html` in a modern browser (module script support required). No build step.
However, this does not always work for everyone. In such case, go to the root folder of this project in Terminal and enter: npx serve .

Editing mode
------------

1. Click to add vertices.
2. Click the first vertex to close polygon (needs at least 3 points).
3. Drag vertices to move them.
4. Hover edges and press `=` to split (select edge first by clicking it, it highlights).
5. Backspace deletes the hovered vertex (or last) while in edit mode.

Play mode
---------

After closing the polygon, switch to Play mode; click inside to set a target or outside to snap to boundary. Random target selects a point within a random triangle.

Notes
-----

- All geometry & path logic is decoupled from rendering for easier testing.
- Further improvements could include unit tests, polygon validation (self‑intersection), and optional clipping of the funnel path.

Install (npm)
---------

Using npm:

```bash
npm install path-of-least-regret
```

You can import a lightweight API (no UI / canvas demo) via `lib/api.js`:

Example (ES module):
---------

```js
import { buildNavMesh, findPath, pathfind, V } from './lib/api.js';

// polygon (can be CW or CCW, should be simple / non self-intersecting)
const poly = [
 { x: 100, y: 100 },
 { x: 500, y: 120 },
 { x: 520, y: 340 },
 { x: 180, y: 380 }
];

// One-shot helper:
const result = pathfind(poly, {x:140,y:160}, {x:450,y:300}, { includeDebug: true });
console.log(result.waypoints);      // Array of Vec2
console.log(result.trianglePath);   // (debug) indices
console.log(result.portals);        // (debug) portal sequence

// Or if you will reuse mesh repeatedly:
const mesh = buildNavMesh(poly);
const r1 = findPath(mesh, poly, {x:110,y:150}, {x:470,y:310});
const r2 = findPath(mesh, poly, {x:200,y:170}, {x:300,y:350});
```

API Summary:

- `buildNavMesh(polygon)` -> `{ triangles, adjacency }`
- `findPath(navMesh, polygon, start, goal, opts)` -> `{ waypoints, portals?, trianglePath? }`
- `pathfind(polygon, start, goal, opts)` convenience wrapper (builds mesh each call)
- `V` vector helpers (`add, sub, mul, dist, norm` etc.) exported for convenience

Improvements:

- Validation: pass `{ validate:true }` to `buildNavMesh` or `{ validate:true }` in `pathfind` opts; returns `{ error: 'SELF_INTERSECTION' }` (when `errorMode:'code'`) instead of null.
- Error codes: set `errorMode:'code'` to receive `{error:'START_OUTSIDE'|'GOAL_OUTSIDE'|'NO_TRI_PATH'}`.
- Path smoothing: `smooth:true` (1 iteration) or `smooth:2..5` for increased Chaikin-style smoothing.
- TypeScript: `lib/api.d.ts` provides typings.
- UMD (no module import): include `<script src="lib/umd.js"></script>` then use `window.NavMeshPF.pathfind(...)`.
- Cached triangle centroids for faster A* (no repeated centroid recompute).
- `updatePolygon(navMesh, oldPoly, newPoly)` helper triggers rebuild only when coordinates change.

Demo Note:
The interactive demo (`demo/main.js`) relies only on the public API in `lib/` so the example usage mirrors real integration. Rendering code stays isolated in `demo/`.

Options:
`opts.includeDebug` (boolean) include portals + trianglePath for visualization.
`opts.snapNudge` (number, default 0.75) inward offset when snapping points outside polygon.
 `opts.smooth` (boolean|number) smooth resulting path (true=1 iteration, number=iterations 1..5).
 `opts.errorMode` ('null'|'code') switch null returns to `{error:<code>}` objects.
 `opts.validate` (boolean) perform polygon validation (one-shot pathfind).

Error / Edge Handling:

- Returns `null` if start/goal cannot be placed inside any triangle after snapping.
- No self-intersection detection (provide simple polygons only).
- When `errorMode:'code'`: errors `{error:'OUTSIDE_POLY', where:'start'|'goal'}` or `{error:'NO_PATH'}`.

Coordinate System:
Pixels in canvas-style Y-down layout. You can adapt by flipping Y if needed.

License
-------

See LICENSE file
