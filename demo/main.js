
import {
    buildNavMesh,
    updatePolygon,
    findPath,
    V,
    ErrorCodes
} from '../lib/api.js';
import {
    findTriIdContaining
} from '../lib/navmesh.js';
import {
    polyCentroid,
    nudgeInside,
    closestPointOnBoundary
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
    optDebug: document.getElementById('optDebug'),
    randomBtn: document.getElementById('randomBtn'),
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
let closed = false;
let hoverIndex = -1,
    draggingIndex = -1,
    hoverEdgeIndex = -1,
    selectedEdgeIndex = -1;
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
let horizons = createHorizonSet(HORIZON_LAYERS);
let facingTracker = createFacingTracker({ directions: 8, hysteresis: 10 });
let hoverHorizonIndex = -1,
    draggingHorizonIndex = -1;

const activeHorizons = () => HORIZON_LAYERS[horizons.active];
const horizonEditing = () => mode === 'play' && UI.editHorizons.checked;

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

function rebuild() {
    if (!closed || poly.length < 3) {
        mesh = null;
        triangles = [];
        return;
    }
    if (mesh) {
        // Diff-based rebuild: skips the work entirely when nothing moved.
        const res = updatePolygon(mesh, poly, BUILD_OPTS);
        if (res.error) {
            showError(res.error.code);
            return;
        }
    } else {
        const m = buildNavMesh(poly, BUILD_OPTS);
        if (m.ok === false) {
            showError(m.code);
            return;
        }
        mesh = m;
    }
    triangles = mesh.tris;
    clearError();
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

function moveTo(target) {    if (!closed || !triangles.length) return;
    const goalInside = findTriIdContaining(target, triangles) != null;
    const goal = goalInside ? target : nudgeInside(closestPointOnBoundary(target, poly), poly, 0.75);
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
    const result = findPath(mesh, startPt, goal, {
        smooth: smoothEnabled,
        smoothIterations,
        errorMode: 'code'
    });
    if (result.ok === false) {
        showError(result.code === ErrorCodes.OUTSIDE_POLY ? 'Target is outside the shape' : result.code);
        return;
    }
    clearError();
    lastPortals = result.portals;
    mover = createMover([{ ...actor.pos }, ...prefix, ...result.path.slice(1)], moverOptions());
    actor.path = mover.remaining();
}

canvas.addEventListener('mousemove', e => {
    const p = toCanvas(e);
    if (horizonEditing()) {
        if (draggingHorizonIndex >= 0) {
            activeHorizons()[draggingHorizonIndex].y = Math.max(0, Math.min(canvas.height, p.y));
            rebuildHorizons();
        } else {
            hoverHorizonIndex = findHorizonNear(p);
        }
        return;
    }
    hoverHorizonIndex = -1;
    if (mode === 'edit') {
        if (draggingIndex >= 0) {
            poly[draggingIndex] = p;
            if (closed) rebuild();
        } else {
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
    if (horizonEditing()) {
        draggingHorizonIndex = findHorizonNear(toCanvas(e));
        return;
    }
    if (mode !== 'edit') return;
    const p = toCanvas(e);
    const idx = findVertexNear(p);
    if (idx >= 0) {
        draggingIndex = idx;
        selectedEdgeIndex = -1;
        return;
    }
    if (closed && hoverEdgeIndex >= 0) selectedEdgeIndex = hoverEdgeIndex;
});
window.addEventListener('mouseup', () => {
    if (draggingIndex >= 0) draggingIndex = -1;
    if (draggingHorizonIndex >= 0) draggingHorizonIndex = -1;
});
canvas.addEventListener('click', e => {
    if (horizonEditing()) return;
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
});
UI.editBtn.addEventListener('click', () => {
    mode = 'edit';
    clearError();
    hoverEdgeIndex = -1;
    selectedEdgeIndex = -1;
});
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
    mode = 'play';
    clearError();
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
    drawHorizons(ctx, canvas, activeHorizons(), UI.showHorizons.checked, horizonEditing() ? hoverHorizonIndex : -1);
    if (mode === 'edit') drawEdit(ctx, poly, closed, hoverEdgeIndex, selectedEdgeIndex, hoverIndex, UI);
    else UI.hint.textContent = horizonEditing()
        ? 'Drag a dashed horizon line to move it; the actor rescales as you drag.'
        : 'Play: click inside to walk there. The panel shows the facing and scale the helpers report.';
    drawNavmesh(ctx, UI.showMesh.checked, triangles);
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