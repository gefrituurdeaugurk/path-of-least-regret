import {
    V
} from '../lib/math.js';

export function drawGround(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#18202b');
    g.addColorStop(0.55, '#0f141c');
    g.addColorStop(1, '#090c11');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}
export function drawEdit(ctx, poly, closed, hoverEdgeIndex, selectedEdgeIndex, hoverIndex, UI) {
    if (!poly.length) {
        UI.hint.textContent = 'Edit: click to add points. Close by clicking first point.';
        return;
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = closed ? '#7aa7ff' : '#4d6ea6';
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    if (closed) ctx.closePath();
    ctx.stroke();
    if (hoverEdgeIndex >= 0 && poly.length >= 2) {
        const a = poly[hoverEdgeIndex],
            b = poly[(hoverEdgeIndex + 1) % poly.length];
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#6be58a';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    if (selectedEdgeIndex >= 0 && poly.length >= 2) {
        const a = poly[selectedEdgeIndex],
            b = poly[(selectedEdgeIndex + 1) % poly.length];
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#2bd96b';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 6 : 5, 0, Math.PI * 2);
        let col = '#c0d6ff';
        if (i === 0) col = '#8bf';
        if (i === hoverIndex) col = '#2bd96b';
        ctx.fillStyle = col;
        ctx.fill();
    }
    UI.hint.textContent = closed ? 'Closed. Drag vertices to tweak. Click edges to select; press = to split.' : (poly.length < 3 ? 'Add at least 3 points, then click the first point to close.' : 'Click the first point to close. Backspace removes a point. Drag points.');
}
export function drawNavmesh(ctx, show, triangles) {
    if (!show || !triangles.length) return;
    ctx.lineWidth = 1.5;
    for (const t of triangles) {
        ctx.beginPath();
        ctx.moveTo(t[0].x, t[0].y);
        ctx.lineTo(t[1].x, t[1].y);
        ctx.lineTo(t[2].x, t[2].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(94,151,255,0.08)';
        ctx.strokeStyle = 'rgba(139,197,255,0.6)';
        ctx.fill();
        ctx.stroke();
    }
}

function dot(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f7b267';
    ctx.fill();
}
export function drawPortals(ctx, show, portals) {
    if (!show || !portals) return;
    for (const pr of portals) {
        ctx.beginPath();
        ctx.moveTo(pr.left.x, pr.left.y);
        ctx.lineTo(pr.right.x, pr.right.y);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#f7b267';
        ctx.stroke();
        dot(ctx, pr.left.x, pr.left.y, 3);
        dot(ctx, pr.right.x, pr.right.y, 3);
    }
}
export function drawPath(ctx, actor, showWaypoints) {
    if (!actor.path.length) return;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#79e0a3';
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.moveTo(actor.pos.x, actor.pos.y);
    for (const p of actor.path) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (showWaypoints) {
        for (const p of actor.path) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#79e0a3';
            ctx.fill();
        }
    }
}
export function drawActor(ctx, actor) {
    const s = 0.6 + (actor.pos.y / 720) * 0.6;
    const r = actor.radius * s;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(actor.pos.x, actor.pos.y + 10 * s, r * 1.2, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(actor.pos.x, actor.pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#a6d1ff';
    ctx.fill();
    if (actor.path.length) {
        const dir = V.norm(V.sub(actor.path[0], actor.pos));
        const eye = V.add(actor.pos, V.mul(dir, r * 0.6));
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#0b223a';
        ctx.fill();
    }
}