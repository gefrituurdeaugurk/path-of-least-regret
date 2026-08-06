
import {
    buildNavMesh,
    updatePolygon,
    findPath,
    clampToWalkable,
    V,
    ErrorCodes
} from '../lib/api.js';
import {
    findTriIdContaining
} from '../lib/navmesh.js';
import {
    polyCentroid,
    nudgeInside,
    closestPointOnBoundary,
    pointInPolygon
} from '../lib/helpers.js';
import {
    createFacingTracker
} from '../lib/facing.js';
import {
    createHorizonSet
} from '../lib/horizon.js';
import {
    createMover
} from '../lib/movement.js';
import {
    drawGround,
    drawEdit,
    drawObstacles,
    drawNavmesh,
    drawPortals,
    drawPath,
    drawHorizons,
    drawActor
} from './render.js';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const UI = {
    editBtn: document.getElementById('editBtn'),
    playBtn: document.getElementById('playBtn'),
    resetBtn: document.getElementById('resetBtn'),
    showMesh: document.getElementById('toggleMesh'),
    showPortals: document.getElementById('togglePortals'),
    showWaypoints: document.getElementById('toggleWaypoints'),
    optSmooth: document.getElementById('optSmooth'),
    optSmoothIter: document.getElementById('optSmoothIter'),
    optClearance: document.getElementById('optClearance'),
    optDebug: document.getElementById('optDebug'),
    randomBtn: document.getElementById('randomBtn'),
    obstacleBtn: document.getElementById('obstacleBtn'),
    clearObstaclesBtn: document.getElementById('clearObstaclesBtn'),
    dirCount: document.getElementById('dirCount'),
    dirHysteresis: document.getElementById('dirHysteresis'),
    horizonLayer: document.getElementById('horizonLayer'),
    showHorizons: document.getElementById('toggleHorizons'),
    editHorizons: document.getElementById('editHorizons'),
    moveSpeed: document.getElementById('moveSpeed'),
    moveEase: document.getElementById('moveEase'),
    moveEasing: document.getElementById('moveEasing'),
    perspectiveSpeed: document.getElementById('perspectiveSpeed'),
    actorReadout: document.getElementById('actorReadout'),
    error: document.getElementById('error'),
    hint: document.getElementById('hint')
};

let mode = 'edit';
let poly = [];
let holes = [];
let closed = false;
let hoverIndex = -1,
    draggingIndex = -1,
    hoverEdgeIndex = -1,
    selectedEdgeIndex = -1;
let hoverHoleIndex = -1,
    draggingHoleIndex = -1,
    holeGrabOffset = { x: 0, y: 0 };
const SNAP_R = 10,
    EDGE_SNAP = 8;
let mesh = null; // library mesh object
let triangles = []; // convenience alias
const actor = {
    pos: {
        x: 220,
        y: 320
    },
    path: [],
    speed: 0,
    radius: 10,
    facing: null,
    scale: 1
};
let lastPortals = null;
let mover = null;
const rnd = (a, b) => Math.random() * (b - a) + a;

// Two depth planes: the ground the actor walks on, and a raised one it would switch to
// after disappearing up a staircase. 216 and 576 are 30% and 80% of the canvas height.
const HORIZON_LAYERS = {
    ground: [{ y: 216, scale: 0.5 }, { y: 576, scale: 1.1 }],
    balcony: [{ y: 96, scale: 0.2 }, { y: 320, scale: 0.55 }]
};
const HORIZON_SNAP = 10;
// Two lines closer than this would leave the upper one impossible to grab again.
const HORIZON_MIN_GAP = 24;
let horizons = createHorizonSet(HORIZON_LAYERS);
let facingTracker = createFacingTracker({ directions: 8, hysteresis: 10 });
let hoverHorizonIndex = -1,
    draggingHorizonIndex = -1;
// Set fresh on every mousedown, so a drag that never produced a click cannot poison a later one.
let grabbedHorizon = false;

const activeHorizons = () => HORIZON_LAYERS[horizons.active];
const horizonEditing = () => UI.editHorizons.checked;

function setMode(next) {
    mode = next;
    UI.editBtn.setAttribute('aria-pressed', String(next === 'edit'));
    UI.playBtn.setAttribute('aria-pressed', String(next === 'play'));
    hoverEdgeIndex = -1;
    selectedEdgeIndex = -1;
    draggingIndex = -1;
    draggingHorizonIndex = -1;
    clearError();
}

// createHorizonSet snapshots its input, so a dragged line needs the set rebuilt.
function rebuildHorizons() {
    const active = horizons.active;
    horizons = createHorizonSet(HORIZON_LAYERS);
    horizons.use(active);
}

function rebuildFacing() {
    const directions = Number(UI.dirCount.value) || 8;
    const hysteresis = Number(UI.dirHysteresis.value) || 0;
    facingTracker = createFacingTracker({ directions, hysteresis });
    actor.facing = null;
}

function moverOptions() {
    const ease = Math.max(0, Number(UI.moveEase.value) || 0);
    return {
        speed: Number(UI.moveSpeed.value) || 160,
        easeIn: ease,
        easeOut: ease,
        easing: UI.moveEasing.value,
        // A closure, not the set itself: dragging a horizon replaces `horizons`.
        perspective: UI.perspectiveSpeed.checked ? (p) => horizons.scaleAt(p) : null
    };
}

// Ease and perspective are fixed when a mover is built, so changing them mid-walk means
// starting a fresh mover on what is left of the path.
function refreshMover() {
    if (!mover) return;
    mover = createMover([{ ...actor.pos }, ...mover.remaining()], moverOptions());
}

function showError(msg) {
    UI.error.textContent = msg;
    UI.error.style.display = 'block';
}

function clearError() {
    UI.error.style.display = 'none';
}

const BUILD_OPTS = {
    validate: true,
    errorMode: 'code'
};

/** What the library is asked to mesh: the outline plus whatever is cut out of it. */
const region = () => ({ outline: poly, holes });

function rebuild() {
    if (!closed || poly.length < 3) {
        mesh = null;
        triangles = [];
        return;
    }
    if (mesh) {
        // Diff-based rebuild: skips the work entirely when nothing moved.
        const res = updatePolygon(mesh, region(), BUILD_OPTS);
        if (res.error) {
            showError(describe(res.error));
            return;
        }
    } else {
        const m = buildNavMesh(region(), BUILD_OPTS);
        if (m.ok === false) {
            showError(describe(m));
            return;
        }
        mesh = m;
    }
    triangles = mesh.tris;
    clearError();
}

/** Validation errors know which ring they came from; saying so saves a lot of squinting. */
function describe(err) {
    const where = err.ring === 'hole' ? ` (obstacle ${err.ringIndex + 1})` : '';
    return `${err.code}${where}`;
}

const OBSTACLE_SIZE = 70;

/** Places a square obstacle somewhere it does not break the mesh, or reports why not. */
function addObstacle() {
    if (!closed || !mesh) {
        showError('Close the shape first');
        return;
    }
    const c = polyCentroid(poly);
    const half = OBSTACLE_SIZE / 2;
    const spiral = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const before = holes;
    for (const [dx, dy] of spiral) {
        for (const spread of [1, 2, 3]) {
            const cx = c.x + dx * OBSTACLE_SIZE * 1.6 * spread;
            const cy = c.y + dy * OBSTACLE_SIZE * 1.6 * spread;
            const square = [
                { x: cx - half, y: cy - half },
                { x: cx + half, y: cy - half },
                { x: cx + half, y: cy + half },
                { x: cx - half, y: cy + half }
            ];
            holes = [...before, square];
            const probe = buildNavMesh(region(), BUILD_OPTS);
            if (probe.ok !== false) {
                mesh = probe;
                triangles = mesh.tris;
                clearError();
                return;
            }
        }
    }
    holes = before;
    showError('No room for another obstacle');
}

function findHoleNear(p) {
    // Last drawn is topmost, so search back to front.
    for (let i = holes.length - 1; i >= 0; i--) {
        if (pointInPolygon(p, holes[i])) return i;
    }
    return -1;
}

function moveHole(i, cx, cy) {
    const c = polyCentroid(holes[i]);
    const dx = cx - c.x;
    const dy = cy - c.y;
    holes[i] = holes[i].map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function findVertexNear(p) {
    for (let i = 0; i < poly.length; i++)
        if (V.dist(p, poly[i]) <= SNAP_R) return i;
    return -1;
}

// The demo's horizons are all horizontal, so vertical distance is the whole test.
function findHorizonNear(p) {
    const rows = activeHorizons();
    let best = HORIZON_SNAP + 1,
        index = -1;
    for (let i = 0; i < rows.length; i++) {
        const d = Math.abs(p.y - rows[i].y);
        if (d < best) {
            best = d;
            index = i;
        }
    }
    return best <= HORIZON_SNAP ? index : -1;
}

// Keeps a dragged line inside the canvas and clear of its neighbours, so no two lines can
// end up stacked on top of each other where only the first would ever be grabbable.
function clampHorizonY(index, y) {
    const rows = activeHorizons();
    const current = rows[index].y;
    let lo = 0,
        hi = canvas.height;
    for (let i = 0; i < rows.length; i++) {
        if (i === index) continue;
        if (rows[i].y <= current) lo = Math.max(lo, rows[i].y + HORIZON_MIN_GAP);
        else hi = Math.min(hi, rows[i].y - HORIZON_MIN_GAP);
    }
    return Math.max(lo, Math.min(hi, y));
}

function distToSegment(p, a, b) {
    const ab = V.sub(b, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
    const proj = {
        x: a.x + ab.x * t,
        y: a.y + ab.y * t
    };
    return {
        d: V.dist(p, proj),
        t,
        proj
    };
}

function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height)
    };
}

function moveTo(target) {
    if (!closed || !triangles.length) return;
    // clampToWalkable knows about obstacles, so a click on a crate lands beside it
    // rather than being dragged to the nearest outside wall.
    const goal = clampToWalkable(mesh, target, { inset: 0.75 });
    let startPt = {
        x: actor.pos.x,
        y: actor.pos.y
    };
    const startId = findTriIdContaining(startPt, triangles);
    const prefix = [];
    if (startId == null) {
        const snap = closestPointOnBoundary(startPt, poly);
        const snapIn = nudgeInside(snap, poly, 0.75);
        prefix.push(snap);
        startPt = snapIn;
    }
    const smoothEnabled = !!UI.optSmooth?.checked;
    let smoothIterations = parseInt(UI.optSmoothIter?.value || '1', 10);
    if (isNaN(smoothIterations) || smoothIterations < 1) smoothIterations = 1;
    if (smoothIterations > 5) smoothIterations = 5;
    let clearance = parseFloat(UI.optClearance?.value || '0');
    if (isNaN(clearance) || clearance < 0) clearance = 0;
    const result = findPath(mesh, startPt, goal, {
        smooth: smoothEnabled,
        smoothIterations,
        clearance,
        errorMode: 'code'
    });
    if (result.ok === false) {
        if (result.code === ErrorCodes.OUTSIDE_POLY) showError('Target is outside the shape');
        else if (result.code === ErrorCodes.NO_PATH && clearance > 0) {
            showError(`No route that wide \u2014 try a clearance under ${clearance}`);
        } else showError(result.code);
        return;
    }
    clearError();
    lastPortals = result.portals;
    mover = createMover([{ ...actor.pos }, ...prefix, ...result.path.slice(1)], moverOptions());
    actor.path = mover.remaining();
}

canvas.addEventListener('mousemove', e => {
    const p = toCanvas(e);
    // A mouseup released outside the window never reaches us, so trust the button state.
    if (draggingHorizonIndex >= 0 && e.buttons === 0) draggingHorizonIndex = -1;
    if (horizonEditing()) {
        if (draggingHorizonIndex >= 0) {
            activeHorizons()[draggingHorizonIndex].y = clampHorizonY(draggingHorizonIndex, p.y);
            rebuildHorizons();
            return;
        }
        hoverHorizonIndex = findHorizonNear(p);
        if (hoverHorizonIndex >= 0) {
            hoverIndex = -1;
            hoverEdgeIndex = -1;
            return;
        }
    } else {
        hoverHorizonIndex = -1;
    }
    if (mode === 'edit') {
        if (draggingHoleIndex >= 0 && e.buttons === 0) draggingHoleIndex = -1;
        if (draggingHoleIndex >= 0 && mesh) {
            const kept = holes[draggingHoleIndex];
            moveHole(draggingHoleIndex, p.x - holeGrabOffset.x, p.y - holeGrabOffset.y);
            const res = updatePolygon(mesh, region(), BUILD_OPTS);
            if (res.error) {
                // Dragged through a wall or another obstacle: leave it where it still worked.
                holes[draggingHoleIndex] = kept;
                showError(describe(res.error));
            } else {
                triangles = mesh.tris;
                clearError();
            }
            return;
        }
        if (draggingIndex >= 0) {
            poly[draggingIndex] = p;
            if (closed) rebuild();
        } else {
            hoverHoleIndex = findHoleNear(p);
            hoverIndex = findVertexNear(p);
            if (hoverIndex < 0 && poly.length > 1) {
                hoverEdgeIndex = -1;
                let best = EDGE_SNAP + 1;
                for (let i = 0; i < poly.length - (closed ? 0 : 1); i++) {
                    const d = distToSegment(p, poly[i], poly[(i + 1) % poly.length]).d;
                    if (d < best) {
                        best = d;
                        hoverEdgeIndex = i;
                    }
                }
                if (best > EDGE_SNAP) hoverEdgeIndex = -1;
            } else hoverEdgeIndex = -1;
        }
    }
});
canvas.addEventListener('mousedown', e => {
    draggingHorizonIndex = horizonEditing() ? findHorizonNear(toCanvas(e)) : -1;
    grabbedHorizon = draggingHorizonIndex >= 0;
    if (grabbedHorizon) return;
    if (mode !== 'edit') return;
    const p = toCanvas(e);
    const idx = findVertexNear(p);
    if (idx >= 0) {
        draggingIndex = idx;
        selectedEdgeIndex = -1;
        return;
    }
    const hole = findHoleNear(p);
    if (hole >= 0) {
        draggingHoleIndex = hole;
        const c = polyCentroid(holes[hole]);
        holeGrabOffset = { x: p.x - c.x, y: p.y - c.y };
        selectedEdgeIndex = -1;
        return;
    }
    if (closed && hoverEdgeIndex >= 0) selectedEdgeIndex = hoverEdgeIndex;
});
window.addEventListener('mouseup', () => {
    if (draggingIndex >= 0) draggingIndex = -1;
    if (draggingHoleIndex >= 0) draggingHoleIndex = -1;
    if (draggingHorizonIndex >= 0) draggingHorizonIndex = -1;
});
canvas.addEventListener('contextmenu', e => {
    if (mode !== 'edit') return;
    const hole = findHoleNear(toCanvas(e));
    if (hole < 0) return;
    e.preventDefault();
    holes.splice(hole, 1);
    hoverHoleIndex = -1;
    rebuild();
});
canvas.addEventListener('mouseleave', () => {
    hoverHorizonIndex = -1;
});
canvas.addEventListener('click', e => {
    // The click that closes a horizon drag belongs to the drag, not to the scene.
    if (grabbedHorizon) return;
    const p = toCanvas(e);
    if (mode === 'edit') {
        clearError();
        if (draggingIndex >= 0) return;
        const near = findVertexNear(p);
        if (!closed) {
            if (poly.length >= 3 && near === 0) {
                closed = true;
                rebuild();
                return;
            }
            poly.push(p);
            selectedEdgeIndex = -1;
            hoverEdgeIndex = -1;
            return;
        }
        if (closed && hoverEdgeIndex >= 0) {
            selectedEdgeIndex = hoverEdgeIndex;
            return;
        }
    } else if (mode === 'play') {
        if (!closed || !triangles.length) {
            showError('Close shape first.');
            return;
        }
        moveTo(p);
    }
});
window.addEventListener('keydown', e => {
    if (mode !== 'edit') return;
    if (e.key === 'Backspace') {
        e.preventDefault();
        selectedEdgeIndex = -1;
        if (hoverIndex >= 0) {
            poly.splice(hoverIndex, 1);
            hoverIndex = -1;
        } else poly.pop();
        if (poly.length < 3) {
            closed = false;
            triangles = [];
            mesh = null;
        } else if (closed) rebuild();
        return;
    }
    if (e.key === '=' || e.key === '+') {
        if (selectedEdgeIndex >= 0 && poly.length >= 2) {
            const i = selectedEdgeIndex,
                a = poly[i],
                b = poly[(i + 1) % poly.length];
            poly.splice(i + 1, 0, {
                x: (a.x + b.x) / 2,
                y: (a.y + b.y) / 2
            });
            if (closed) rebuild();
        }
    }
});

UI.resetBtn.addEventListener('click', () => {
    poly = [];
    holes = [];
    closed = false;
    triangles = [];
    mesh = null;
    mover = null;
    actor.path = [];
    clearError();
    draggingIndex = -1;
    hoverIndex = -1;
    hoverEdgeIndex = -1;
    selectedEdgeIndex = -1;
    hoverHoleIndex = -1;
    draggingHoleIndex = -1;
});
UI.obstacleBtn.addEventListener('click', addObstacle);
UI.clearObstaclesBtn.addEventListener('click', () => {
    if (!holes.length) return;
    holes = [];
    hoverHoleIndex = -1;
    draggingHoleIndex = -1;
    rebuild();
});
UI.editBtn.addEventListener('click', () => setMode('edit'));
UI.playBtn.addEventListener('click', () => {
    if (!closed) {
        showError('Close polygon first');
        return;
    }
    if (!triangles.length) {
        rebuild();
        if (!triangles.length) {
            showError('Triangulation failed');
            return;
        }
    }
    setMode('play');
});
UI.randomBtn.addEventListener('click', () => {
    if (mode !== 'play') {
        showError('Random works in Play');
        return;
    }
    const t = triangles[Math.floor(Math.random() * triangles.length)];
    const c = polyCentroid(t);
    moveTo({
        x: c.x + rnd(-80, 80),
        y: c.y + rnd(-60, 60)
    });
});
UI.dirCount.addEventListener('change', rebuildFacing);
UI.dirHysteresis.addEventListener('change', rebuildFacing);
UI.moveSpeed.addEventListener('change', refreshMover);
UI.moveEase.addEventListener('change', refreshMover);
UI.moveEasing.addEventListener('change', refreshMover);
UI.perspectiveSpeed.addEventListener('change', refreshMover);
UI.horizonLayer.addEventListener('change', () => {
    horizons.use(UI.horizonLayer.value);
    hoverHorizonIndex = -1;
    draggingHorizonIndex = -1;
});
UI.editHorizons.addEventListener('change', () => {
    // Nothing to grab if the lines are hidden.
    if (UI.editHorizons.checked) UI.showHorizons.checked = true;
    hoverHorizonIndex = -1;
    draggingHorizonIndex = -1;
});

function update(dt) {
    if (mode === 'play' && mover && !mover.done) {
        const s = mover.step(dt);
        actor.pos = s.position;
        actor.speed = s.speed;
        actor.facing = facingTracker.update(s.velocity);
    } else {
        actor.speed = 0;
    }
    actor.path = mover ? mover.remaining() : [];
    actor.scale = horizons.scaleAt(actor.pos);
}

function updateReadout() {
    const f = actor.facing;
    const facing = f ? `${f.name} (${Math.round(f.angle)}\u00b0)` : '\u2014';
    UI.actorReadout.textContent = `facing ${facing} \u00b7 scale ${actor.scale.toFixed(2)}`
        + ` \u00b7 speed ${Math.round(actor.speed)}/s \u00b7 layer ${horizons.active}`;
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGround(ctx, canvas);
    drawHorizons(ctx, canvas, activeHorizons(), UI.showHorizons.checked || horizonEditing(), horizonEditing() ? hoverHorizonIndex : -1);
    if (mode === 'edit') drawEdit(ctx, poly, closed, hoverEdgeIndex, selectedEdgeIndex, hoverIndex, UI);
    else UI.hint.textContent = horizonEditing()
        ? 'Drag a dashed horizon line to move it; click elsewhere to walk there.'
        : 'Play: click inside to walk there. Clearance keeps the actor off the walls and obstacles.';
    drawNavmesh(ctx, UI.showMesh.checked, triangles);
    drawObstacles(ctx, holes, mode === 'edit' ? hoverHoleIndex : -1);
    drawPath(ctx, actor, UI.showWaypoints.checked);
    drawPortals(ctx, UI.showPortals.checked && UI.optDebug?.checked, lastPortals);
    drawActor(ctx, actor);
    updateReadout();
}

function tick(t) {
    const now = t * 0.001;
    const dt = Math.min(1 / 30, now - (tick._last || now));
    tick._last = now;
    update(dt);
    render();
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);