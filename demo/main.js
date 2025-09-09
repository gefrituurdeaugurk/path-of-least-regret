// Demo entry now referencing library in ../lib
import { buildNavMesh, updatePolygon, findPath, V, ErrorCodes } from '../lib/api.js';
import { findTriIdContaining } from '../lib/navmesh.js';
import { polyCentroid, nudgeInside, closestPointOnBoundary } from '../lib/helpers.js';
import { drawGround, drawEdit, drawNavmesh, drawPortals, drawPath, drawActor } from './render.js';

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
    error: document.getElementById('error'),
    hint: document.getElementById('hint')
};

let mode = 'edit';
let poly = []; let closed = false;
let hoverIndex = -1, draggingIndex = -1, hoverEdgeIndex = -1, selectedEdgeIndex = -1;
const SNAP_R = 10, EDGE_SNAP = 8;
let mesh = null; // library mesh object
let triangles = []; // convenience alias
let polySnapshot = null;
const actor = { pos: { x: 220, y: 320 }, path: [], speed: 140, radius: 10 };
let lastPortals = null;
const rnd = (a, b) => Math.random() * (b - a) + a;

function showError(msg) { UI.error.textContent = msg; UI.error.style.display = 'block'; }
function clearError() { UI.error.style.display = 'none'; }
function deepCopy(p) { return p.map(q => ({ x: q.x, y: q.y })); }

function rebuild() {
    if (!closed || poly.length < 3) { mesh = null; triangles = []; return; }
    if (!mesh) {
        const m = buildNavMesh(poly, { validate: true, errorMode: 'code' });
        if (m.ok === false) { showError(m.code); return; }
        mesh = m; triangles = mesh.tris || m.triangles; // support either shape
    } else if (polySnapshot) {
        // naive diff rebuild using updatePolygon
        updatePolygon(mesh, poly);
        triangles = mesh.tris || mesh.triangles;
    } else {
        mesh = buildNavMesh(poly, { validate: true, errorMode: 'code' });
        triangles = mesh.tris || mesh.triangles;
    }
    polySnapshot = deepCopy(poly);
}

function findVertexNear(p) { for (let i = 0; i < poly.length; i++) if (V.dist(p, poly[i]) <= SNAP_R) return i; return -1; }
function distToSegment(p, a, b) { const ab = V.sub(b, a); const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1))); const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t }; return { d: V.dist(p, proj), t, proj }; }
function toCanvas(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) }; }

function moveTo(target) {
    if (!closed || !triangles.length) return;
    const goalInside = findTriIdContaining(target, triangles) != null;
    const goal = goalInside ? target : nudgeInside(closestPointOnBoundary(target, poly), poly, 0.75);
    let startPt = { x: actor.pos.x, y: actor.pos.y };
    const startId = findTriIdContaining(startPt, triangles);
    const prefix = [];
    if (startId == null) {
        const snap = closestPointOnBoundary(startPt, poly);
        const snapIn = nudgeInside(snap, poly, 0.75); prefix.push(snap); startPt = snapIn;
    }
    const smoothEnabled = !!UI.optSmooth?.checked;
    let smoothIterations = parseInt(UI.optSmoothIter?.value||'1',10); if(isNaN(smoothIterations)||smoothIterations<1) smoothIterations=1; if(smoothIterations>5) smoothIterations=5;
    const includeDebug = !!UI.optDebug?.checked;
    const result = findPath(mesh, startPt, goal, { smooth: smoothEnabled, smoothIterations, errorMode: 'code', includeDebug });
    if (result && result.ok !== false) {
        lastPortals = result.portals; actor.path = prefix.concat(result.path.slice(1));
    }
}

canvas.addEventListener('mousemove', e => {
    const p = toCanvas(e);
    if (mode === 'edit') {
        if (draggingIndex >= 0) { poly[draggingIndex] = p; if (closed) rebuild(); }
        else {
            hoverIndex = findVertexNear(p);
            if (hoverIndex < 0 && poly.length > 1) {
                hoverEdgeIndex = -1; let best = EDGE_SNAP + 1;
                for (let i = 0; i < poly.length - (closed ? 0 : 1); i++) {
                    const d = distToSegment(p, poly[i], poly[(i + 1) % poly.length]).d;
                    if (d < best) { best = d; hoverEdgeIndex = i; }
                }
                if (best > EDGE_SNAP) hoverEdgeIndex = -1;
            } else hoverEdgeIndex = -1;
        }
    }
});
canvas.addEventListener('mousedown', e => { if (mode !== 'edit') return; const p = toCanvas(e); const idx = findVertexNear(p); if (idx >= 0) { draggingIndex = idx; selectedEdgeIndex = -1; return; } if (closed && hoverEdgeIndex >= 0) selectedEdgeIndex = hoverEdgeIndex; });
window.addEventListener('mouseup', () => { if (draggingIndex >= 0) draggingIndex = -1; });
canvas.addEventListener('click', e => {
    const p = toCanvas(e);
    if (mode === 'edit') {
        clearError(); if (draggingIndex >= 0) return; const near = findVertexNear(p);
        if (!closed) { if (poly.length >= 3 && near === 0) { closed = true; rebuild(); return; } poly.push(p); selectedEdgeIndex = -1; hoverEdgeIndex = -1; return; }
        if (closed && hoverEdgeIndex >= 0) { selectedEdgeIndex = hoverEdgeIndex; return; }
    } else if (mode === 'play') {
        if (!closed || !triangles.length) { showError('Close shape first.'); return; }
        moveTo(p);
    }
});
window.addEventListener('keydown', e => {
    if (mode !== 'edit') return;
    if (e.key === 'Backspace') {
        e.preventDefault(); selectedEdgeIndex = -1;
        if (hoverIndex >= 0) { poly.splice(hoverIndex, 1); hoverIndex = -1; } else poly.pop();
        if (poly.length < 3) { closed = false; triangles = []; mesh = null; } else if (closed) rebuild();
        return;
    }
    if (e.key === '=' || e.key === '+') {
        if (selectedEdgeIndex >= 0 && poly.length >= 2) { const i = selectedEdgeIndex, a = poly[i], b = poly[(i + 1) % poly.length]; poly.splice(i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); if (closed) rebuild(); }
    }
});

UI.resetBtn.addEventListener('click', () => { poly = []; closed = false; triangles = []; mesh = null; polySnapshot = null; clearError(); draggingIndex = -1; hoverIndex = -1; hoverEdgeIndex = -1; selectedEdgeIndex = -1; });
UI.editBtn.addEventListener('click', () => { mode = 'edit'; clearError(); hoverEdgeIndex = -1; selectedEdgeIndex = -1; });
UI.playBtn.addEventListener('click', () => { if (!closed) { showError('Close polygon first'); return; } if (!triangles.length) { rebuild(); if (!triangles.length) { showError('Triangulation failed'); return; } } mode = 'play'; clearError(); });
UI.randomBtn.addEventListener('click', () => { if (mode !== 'play') { showError('Random works in Play'); return; } const t = triangles[Math.floor(Math.random() * triangles.length)]; const c = polyCentroid(t); moveTo({ x: c.x + rnd(-80, 80), y: c.y + rnd(-60, 60) }); });

function update(dt) { if (mode !== 'play' || !actor.path.length) return; const tgt = actor.path[0]; const dir = V.sub(tgt, actor.pos); const d = V.len(dir); const step = actor.speed * dt; if (d <= step) { actor.pos = tgt; actor.path.shift(); } else { actor.pos = V.add(actor.pos, V.mul(V.norm(dir), step)); } }
function render() { ctx.clearRect(0, 0, canvas.width, canvas.height); drawGround(ctx, canvas); if (mode === 'edit') drawEdit(ctx, poly, closed, hoverEdgeIndex, selectedEdgeIndex, hoverIndex, UI); drawNavmesh(ctx, UI.showMesh.checked, triangles); drawPath(ctx, actor, UI.showWaypoints.checked); drawPortals(ctx, UI.showPortals.checked && UI.optDebug?.checked, lastPortals); drawActor(ctx, actor); }
function tick(t) { const now = t * 0.001; const dt = Math.min(1 / 30, now - (tick._last || now)); tick._last = now; update(dt); render(); requestAnimationFrame(tick); } requestAnimationFrame(tick);
