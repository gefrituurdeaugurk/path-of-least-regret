Path Of Least Regret — NavMesh Pathfinding
==========================================

Lightweight 2D polygon navmesh pathfinding: ear-clipping triangulation, A* across triangle
adjacency, and a robust funnel (string pulling) that produces a smooth path — the kind of
movement you see in 2D point-'n-click adventure games.

No runtime dependencies. Ships ESM, CommonJS and TypeScript definitions.

Install
-------

```bash
npm install path-of-least-regret
```

Quick start
-----------

```js
import { pathfind } from 'path-of-least-regret';

// A simple (non self-intersecting) polygon. Either winding works.
const room = [
  { x: 0,   y: 0   },
  { x: 400, y: 0   },
  { x: 400, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 400 },
  { x: 0,   y: 400 }
];

const result = pathfind(room, { x: 350, y: 50 }, { x: 50, y: 350 });
console.log(result.path); // [{x:350,y:50}, {x:100,y:100}, {x:50,y:350}]
```

Reuse the mesh when the polygon is static and you path through it repeatedly:

```js
import { buildNavMesh, findPath } from 'path-of-least-regret';

const mesh = buildNavMesh(room);
const a = findPath(mesh, { x: 350, y: 50 }, { x: 50, y: 350 });
const b = findPath(mesh, { x: 10, y: 10 },  { x: 50, y: 350 }, { smooth: 2 });
```

CommonJS and script-tag usage:

```js
const { pathfind } = require('path-of-least-regret');
```

```html
<script type="module" src="node_modules/path-of-least-regret/lib/umd.js"></script>
<script>
  const result = window.NavMeshPF.pathfind(room, start, end);
</script>
```

API
---

buildNavMesh(polygon, opts?) → Mesh
-----------------------------------

Validates and triangulates `polygon`, then builds the triangle adjacency graph.

The polygon is deep-copied, so mutating your own point objects afterwards cannot corrupt
the mesh. Winding is normalised internally.

Returns `{ polygon, tris, adj, centroids }`:

| Field | Type | Meaning |
| --- | --- | --- |
| `polygon` | `Point[]` | the normalised (CCW) copy of your polygon |
| `tris` | `Triangle[]` | triangles, each a `[Point, Point, Point]` tuple |
| `adj` | `Map<number, {to, edge}[]>` | adjacency keyed by triangle index |
| `centroids` | `Point[]` | cached triangle centroids, used by the A* heuristic |

With `includeDebug: true` a `debug: { tris, adj }` field is added.

findPath(mesh, start, end, opts?) → PathResult
----------------------------------------------

Returns `{ ok: true, path, triPath, portals }`:

| Field | Type | Meaning |
| --- | --- | --- |
| `path` | `Point[]` | waypoints from `start` to `end`, no duplicate consecutive points |
| `triPath` | `number[]` | triangle indices traversed |
| `portals` | `Portal[]` | `{ left, right }` pairs crossed, useful for visualisation |

`triPath` and `portals` are always returned; there is no need to opt in.

pathfind(polygon, start, end, opts?) → PathResult
--------------------------------------------------

Convenience wrapper: builds a mesh and paths through it in one call. Accepts every option
of both. Rebuilds the mesh on every call, so prefer `buildNavMesh` + `findPath` in a loop.

updatePolygon(mesh, newPoly, opts?) → { changed, mesh, error? }
-----------------------------------------------------------------

Rebuilds `mesh` **in place** only when `newPoly` differs from its current polygon — useful
when a polygon editor fires on every mouse move. If the new polygon is rejected in
`errorMode: 'code'`, the mesh is left untouched and the failure comes back as `error`.

Options
-------

| Option | Type | Default | Applies to |
| --- | --- | --- | --- |
| `validate` | `boolean` | `true` | `buildNavMesh`, `pathfind` |
| `includeDebug` | `boolean` | `false` | `buildNavMesh`, `pathfind` |
| `errorMode` | `'throw' \| 'code'` | `'throw'` | all |
| `smooth` | `boolean \| number` | `false` | `findPath`, `pathfind` |
| `smoothIterations` | `number` | `1` | `findPath`, `pathfind` |
| `snapNudge` | `number` | `0.5` | `findPath`, `pathfind` |

- **`smooth`** — `true` runs one Chaikin iteration; a number runs that many (clamped to
  1..5). `smoothIterations` is the explicit form used when `smooth` is a boolean.
  Smoothing rounds corners, so a smoothed path may clip the inside of a tight bend.
- **`snapNudge`** — an endpoint lying within this distance of the outline is pulled that
  far inward, along the inward normal of the nearest edge. Endpoints further inside are
  left exactly where you put them. Set to `0` to disable.

Errors
------

By default a failure throws an `Error` carrying a `code` (and `errors` for validation
failures). With `errorMode: 'code'` the same information is returned as
`{ ok: false, code, ... }` instead.

| Code | Cause |
| --- | --- |
| `NOT_ENOUGH_VERTICES` | fewer than 3 vertices |
| `DUPLICATE_ADJACENT_VERTEX` | a zero-length edge |
| `SELF_INTERSECTION` | the polygon crosses itself |
| `OUTSIDE_POLY` | `start` or `end` is outside the mesh (see `where`) |
| `NO_PATH` | no route exists between the two triangles |

```js
const res = pathfind(room, start, end, { errorMode: 'code' });
if (!res.ok) console.warn(res.code, res.where);
```

Set `validate: false` to skip validation when you know the polygon is well formed;
triangulating a self-intersecting polygon produces a meaningless mesh rather than an error.

Subpath exports
---------------

The internals are importable directly if you want the pieces rather than the API:

```js
import { V, triArea2 }     from 'path-of-least-regret/math';
import { triangulate }     from 'path-of-least-regret/triangulate';
import { funnel }          from 'path-of-least-regret/navmesh';
import { nudgeInside }     from 'path-of-least-regret/helpers';
import { validatePolygon } from 'path-of-least-regret/validate';
```

Each subpath resolves for `import` and `require` alike and carries its own `.d.ts`.

Coordinate system
-----------------

Pixels in a canvas-style Y-down layout. Flip Y if your world is Y-up; nothing in the
library assumes a particular scale.

Repository layout
-----------------

```text
lib/                – the library (no UI)
 math.js            – vector & geometry primitives
 triangulate.js     – ear-clipping polygon triangulation
 navmesh.js         – adjacency, A*, portals, funnel, centroids
 helpers.js         – centroid, point-in-polygon, nudgeInside, closest point
 validate.js        – polygon validation
 api.js             – public API surface
 *.d.ts             – TypeScript definitions
 umd.js             – attaches the API to window.NavMeshPF

demo/               – browser demo (editing + visualisation)
 main.js            – state, interaction, animation loop
 render.js          – canvas rendering

scripts/build.cjs   – bundles lib/ to CommonJS in dist/cjs/
test/               – node:test suites
index.html          – loads demo/main.js
```

Running the demo
----------------

Open `index.html` in a modern browser. If your browser blocks module scripts loaded from
`file://`, serve the directory instead:

```bash
npx serve .
```

**Edit mode** — click to add vertices; click the first vertex to close the polygon (3+
points); drag vertices to move them; click an edge to select it, then press `=` to split
it; `Backspace` removes the hovered vertex (or the last one added).

**Play mode** — available once the polygon is closed. Click inside to set a target, or
outside to snap to the boundary. *Random target* picks a point near a random triangle.

The demo uses only the public API in `lib/`, so it doubles as a worked integration example.
Rendering stays isolated in `demo/render.js`.

Development
-----------

```bash
npm install
npm test          # node:test suites against lib/
npm run typecheck # tsc against the .d.ts files
npm run build     # bundle lib/ -> dist/cjs/
npm run test:dist # build, then verify the published export map
```

`dist/` is generated and not committed; `prepublishOnly` rebuilds and re-verifies it.

License
-------

MIT — see the LICENSE file.
