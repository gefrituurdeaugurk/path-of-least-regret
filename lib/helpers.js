import { V } from './math.js';
export function polyCentroid(poly){ let A=0,cx=0,cy=0; for(let i=0;i<poly.length;i++){ const p=poly[i], q=poly[(i+1)%poly.length]; const w=p.x*q.y - q.x*p.y; A+=w; cx += (p.x+q.x)*w; cy += (p.y+q.y)*w; } A=A*0.5||1; return { x: cx/(6*A), y: cy/(6*A)}; }
export function nudgeInside(p, poly, d=0.5){ const c=polyCentroid(poly); const vx=c.x-p.x, vy=c.y-p.y; const L=Math.hypot(vx,vy)||1; return { x: p.x + (vx/L)*d, y: p.y + (vy/L)*d }; }
export function closestPointOnSegment(p,a,b){ const ab={x:b.x-a.x,y:b.y-a.y}; const t=Math.max(0,Math.min(1, ((p.x-a.x)*ab.x + (p.y-a.y)*ab.y)/(ab.x*ab.x + ab.y*ab.y || 1))); return { x:a.x+ab.x*t, y:a.y+ab.y*t }; }
export function closestPointOnBoundary(p, poly){ if(!poly||poly.length<2) return p; let best=null, bd=Infinity; for(let i=0;i<poly.length;i++){ const a=poly[i], b=poly[(i+1)%poly.length]; const q=closestPointOnSegment(p,a,b); const d=V.dist(p,q); if(d<bd){ bd=d; best=q; } } return best||p; }
