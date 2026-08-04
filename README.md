Path Of Least Regret — NavMesh Pathfinding
==========================================

Lightweight 2D polygon navmesh pathfinding: ear-clipping triangulation, A* across triangle
adjacency, and a robust funnel (string pulling) that produces a smooth path — the kind of
movement you see in 2D point-'n-click adventure games. Plus the two helpers that make a
character look right on top of it: which of N directions it is facing, and how big it
should be drawn at a given depth.

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

Integrator helpers
------------------

Three helpers that have nothing to do with finding a path, but everything to do with
drawing the character that walks it: which way it faces, how big it is, and how fast it
gets there. All are optional and independently importable.

Facing — which way is the character walking?
--------------------------------------------

```js
import { facingFromVector, createFacingTracker } from 'path-of-least-regret/facing';

facingFromVector({ x: 1, y: -1 });
// { index: 1, name: 'NE', angle: 45, bearing: 45 }
```

Bearings are compass style: `0` is North, `90` is East, increasing clockwise. Screen space
is Y-down, so North is `-y`; pass `yUp: true` for a Y-up world. A vector shorter than
`epsilon` returns `null` — a standing character has no direction to report.

| Field | Meaning |
| --- | --- |
| `index` | index into the direction set, for picking a sprite row |
| `name` | e.g. `'NE'`, or your own label |
| `angle` | exact bearing of the movement vector |
| `bearing` | bearing of the snapped direction's centre |

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `directions` | `4 \| 8 \| 16` | `8` | which `DIRECTION_SETS` preset to use |
| `names` | `string[]` | – | custom labels, clockwise from `offset`; overrides `directions` |
| `offset` | `number` | `0` | bearing of the first direction in the set |
| `yUp` | `boolean` | `false` | set for a Y-up world |
| `epsilon` | `number` | `1e-9` | below this length the character counts as standing still |

`createFacingTracker(opts)` wraps the same maths in an object that remembers its last
answer. Walking along a sector boundary makes a raw snap flicker between two sprites on
consecutive frames, so `hysteresis` widens the current sector by that many degrees before
the direction is allowed to change:

```js
const facing = createFacingTracker({ directions: 8, hysteresis: 10 });

// per frame
facing.update(velocity);       // or facing.updateFromPoints(prevPos, pos)
sprite.row = facing.current.index;
```

Idle input holds the last direction rather than clearing it; `reset()` clears it.
`facingFromPoints(from, to, opts)` and `bearingOf(v, yUp?)` are also exported.

Horizons — how big is the character?
------------------------------------

A *horizon* is a line with a character scale attached. Give a layer two or more and it
interpolates between them:

```js
import { createHorizonLayer } from 'path-of-least-regret/horizon';

// 30% down the scene the character is half size; 80% down it is 110%.
const ground = createHorizonLayer([
  { y: 216, scale: 0.5 },
  { y: 576, scale: 1.1 }
]);

ground.scaleAt({ x: 400, y: 396 }); // 0.8
ground.scaleAt({ x: 400, y: 700 }); // 1.1 — clamped, not extrapolated
```

Horizons may be listed in any order, and three or more form a piecewise ramp. Beyond the
outermost horizon the scale clamps rather than extrapolating, so an actor that wanders past
the far horizon does not shrink to nothing. The layer also exposes `minScale` and
`maxScale`.

Horizontal horizons are the normal case, and only their `y` matters. For a tilted horizon —
an artistic scene whose ground plane is not level — give two points instead:

```js
{ a: { x: 0, y: 100 }, b: { x: 1280, y: 200 }, scale: 0.5 }
```

A scene often needs more than one ramp. Walking down a staircase can put the character on a
different depth plane entirely, and the switch has to be abrupt rather than blended, so
`createHorizonSet` keeps several named layers with one active at a time:

```js
import { createHorizonSet } from 'path-of-least-regret/horizon';

const horizons = createHorizonSet({
  ground:  [{ y: 216, scale: 0.5 }, { y: 576, scale: 1.1 }],
  balcony: [{ y: 96,  scale: 0.2 }, { y: 320, scale: 0.55 }]
});

horizons.scaleAt(actor.pos);           // uses the active layer ('ground')
horizons.use('balcony');               // the actor reappears in the distance
horizons.scaleAt(actor.pos, 'ground'); // sample another layer without switching
```

Which layer applies is your call — nothing is inferred from the actor's position.

Movement — walking the path at a believable pace
------------------------------------------------

`findPath` hands back a list of corners, not a walk. A mover turns that list into a
position you can read once per frame, with a speed that eases in and out:

```js
import { createMover } from 'path-of-least-regret/movement';

const mover = createMover(findPath(mesh, actor.pos, target), {
  speed: 160,      // pixels per second at scale 1
  easeIn: 60,      // pixels spent accelerating away from the start
  easeOut: 80,     // pixels spent slowing down into the target
  easing: 'smoothstep'
});

function frame(dt) {
  const step = mover.step(dt);
  actor.pos = step.position;
  if (step.done) idle();
}
```

`easeIn` and `easeOut` are distances, not durations, so a long walk still spends the same
short stretch getting up to speed. On a path too short to fit both ramps they shrink
proportionally rather than cancelling each other out. `easing` takes `'smoothstep'`,
`'sine'`, `'linear'`, or your own `(t) => number` curve.

A character further away should also *look* slower, and that is the same information the
horizon layers already carry. Hand the mover a horizon layer or set and `speed` becomes
the speed at `referenceScale` (1 by default), scaled by wherever the character stands:

```js
const mover = createMover(path, { speed: 160, perspective: horizons });
// at scale 0.5 the character covers 80 px/s; at scale 1.1 it covers 176 px/s
```

Because the pace depends on where the character *is*, the mover integrates it each frame
rather than solving the walk up front — switching horizon layers mid-walk simply changes
the next step. Any function `(point) => number` works in place of a horizon layer if your
depth cue comes from elsewhere, and `minSpeedFactor` (default `0.1`) floors the combined
easing so a character can never stall short of its target.

Each `step(dt)` returns the state the rest of the frame needs:

```js
const { position, velocity, speed, progress, travelled, done, index } = mover.step(dt);
```

`velocity` is the direction of travel times the current speed, which is exactly what the
facing tracker wants. Beyond `step` a mover offers `setPath(path)` to redirect,
`setSpeed(n)` to change pace mid-walk, `stop()` to drop the rest of the path where the
character stands, and `remaining()` for the waypoints still ahead — useful for drawing the
road not yet taken.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `speed` | `number` | `100` | units per second at `referenceScale` |
| `easeIn` | `number` | `0` | distance spent accelerating from the start |
| `easeOut` | `number` | `0` | distance spent decelerating into the end |
| `easing` | `string \| fn` | `'smoothstep'` | `'smoothstep'`, `'sine'`, `'linear'`, or `(t) => number` |
| `minSpeedFactor` | `number` | `0.1` | floor on the easing factor, so the walk always finishes |
| `perspective` | layer \| set \| fn | `null` | depth cue that scales the speed |
| `referenceScale` | `number` | `1` | the scale `speed` was quoted at |

`pathLength(path)` and `pointAtDistance(path, distance)` are exported too, for laying out
cutscenes or sampling a path without running a mover. Both accept a raw point array or a
`findPath` result.

Putting the three together
--------------------------

The helpers are deliberately independent, but a point-and-click character usually wants
all three. One mover, one tracker, one horizon set, and a loop that reads them:

```js
import {
  buildNavMesh, findPath, createMover, createFacingTracker, createHorizonSet
} from 'path-of-least-regret';

const mesh = buildNavMesh(room);
const horizons = createHorizonSet({
  ground:  [{ y: 216, scale: 0.5 }, { y: 576, scale: 1.1 }],
  balcony: [{ y: 96,  scale: 0.2 }, { y: 320, scale: 0.55 }]
});
const facing = createFacingTracker({ directions: 8, hysteresis: 10 });

const actor = { pos: { x: 220, y: 320 }, sprite: 0, scale: 1 };
let mover = createMover([actor.pos]);   // idle: a one-point path is already done

function onClick(target) {
  const result = findPath(mesh, actor.pos, target, { errorMode: 'code' });
  if (!result.ok) return;               // outside the room, or no route
  mover = createMover([actor.pos, ...result.path.slice(1)], {
    speed: 160, easeIn: 60, easeOut: 80, perspective: horizons
  });
}

function frame(dt) {
  const step = mover.step(dt);
  actor.pos = step.position;

  // Idle input returns the last facing, so the sprite never snaps back to a default.
  actor.sprite = facing.update(step.velocity)?.index ?? actor.sprite;
  actor.scale = horizons.scaleAt(actor.pos);

  draw(sprites[actor.sprite], actor.pos, actor.scale);
}

function enterBalcony() {               // after the staircase cutaway
  horizons.use('balcony');
}
```

The mover's path starts at the actor's own position rather than `result.path[0]` so the
first frame cannot teleport: `findPath` returns the start point it actually used, which
may have been nudged inside the polygon.

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
| `NO_LAYERS` | a horizon set was given no layers |
| `NOT_ENOUGH_HORIZONS` | a horizon layer needs at least two horizons |
| `INVALID_HORIZON` | a horizon has no finite `scale`, no `y` or points, or is vertical (see `index`) |
| `UNKNOWN_LAYER` | no such horizon layer (see `layer`) |

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
import { V, triArea2 }      from 'path-of-least-regret/math';
import { triangulate }      from 'path-of-least-regret/triangulate';
import { funnel }           from 'path-of-least-regret/navmesh';
import { nudgeInside }      from 'path-of-least-regret/helpers';
import { validatePolygon }  from 'path-of-least-regret/validate';
import { facingFromVector } from 'path-of-least-regret/facing';
import { createHorizonSet } from 'path-of-least-regret/horizon';
import { createMover }      from 'path-of-least-regret/movement';
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
 facing.js          – movement vector -> compass direction
 horizon.js         – horizon layers -> character scale
 movement.js        – path -> position, speed, easing, perspective
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

The second row of controls drives the integrator helpers. *Directions* and *Hysteresis*
configure the facing tracker — the actor is labelled with the direction it would use for a
sprite, and the arrow points at the snapped bearing rather than the raw movement vector.
*Horizon layer* switches between two depth planes, and *Drag horizons* lets you move the
dashed horizon lines and watch the actor rescale live.

The third row drives the mover. *Speed* is quoted at scale 1, *Ease in/out* is the distance
spent ramping at each end, and *Perspective speed* feeds the active horizon layer into the
mover so the actor visibly slows down as it walks into the distance. The pill on the right
shows exactly what the three helpers return each frame.

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

PR preview publishes
--------------------

This repository includes a GitHub Actions workflow at `.github/workflows/npm-pr-preview.yml`
that publishes:

- a preview package for each non-draft PR from this repository (fork PRs are skipped)
- a stable package when a `v*` tag is pushed and matches `package.json` version

- Dist-tag format: `pr-<PR_NUMBER>`
- Version format: `<base-version>-pr.<PR_NUMBER>.<GITHUB_RUN_ID>`

Install the latest preview from PR `123` with:

```bash
npm install path-of-least-regret@pr-123
```

License
-------

MIT — see the LICENSE file.
