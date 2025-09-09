// Vector utilities (library version)
export const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, s) => ({ x: a.x * s, y: a.y * s }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  cross: (a, b) => a.x * b.y - a.y * b.x,
  len: (a) => Math.hypot(a.x, a.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  norm: (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; }
};
export const triArea2 = (a, b, c) => V.cross(V.sub(b, a), V.sub(c, a));
export function area(poly){ let s=0; for(let i=0;i<poly.length;i++){ const a=poly[i], b=poly[(i+1)%poly.length]; s += a.x * b.y - b.x * a.y; } return s/2; }
export const isCCW = (poly) => area(poly) > 0;
export function centroidTriangle(t){ return { x:(t[0].x+t[1].x+t[2].x)/3, y:(t[0].y+t[1].y+t[2].y)/3 }; }
