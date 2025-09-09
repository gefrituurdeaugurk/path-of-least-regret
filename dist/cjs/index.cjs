// Generated CommonJS bundle for path-of-least-regret
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/api.js
var api_exports = {};
__export(api_exports, {
  ErrorCodes: () => ErrorCodes,
  V: () => V,
  ValidationErrorCodes: () => ValidationErrorCodes,
  buildNavMesh: () => buildNavMesh,
  closestPointOnBoundary: () => closestPointOnBoundary,
  default: () => api_default,
  findPath: () => findPath,
  nudgeInside: () => nudgeInside,
  pathfind: () => pathfind,
  polyCentroid: () => polyCentroid,
  updatePolygon: () => updatePolygon
});
module.exports = __toCommonJS(api_exports);

// lib/math.js
var V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, s) => ({ x: a.x * s, y: a.y * s }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  cross: (a, b) => a.x * b.y - a.y * b.x,
  len: (a) => Math.hypot(a.x, a.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  norm: (a) => {
    const l = Math.hypot(a.x, a.y) || 1;
    return { x: a.x / l, y: a.y / l };
  }
};
var triArea2 = (a, b, c) => V.cross(V.sub(b, a), V.sub(c, a));
function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
var isCCW = (poly) => area(poly) > 0;
function centroidTriangle(t) {
  return { x: (t[0].x + t[1].x + t[2].x) / 3, y: (t[0].y + t[1].y + t[2].y) / 3 };
}

// lib/triangulate.js
function triangulate(simplePoly) {
  const n = simplePoly.length;
  if (n < 3) return [];
  const verts = simplePoly.slice();
  if (!isCCW(verts)) verts.reverse();
  const result = [];
  const Vlist = verts.slice();
  function insideTri(p, a, b, c) {
    const b1 = triArea2(p, a, b) < 0, b2 = triArea2(p, b, c) < 0, b3 = triArea2(p, c, a) < 0;
    return b1 === b2 && b2 === b3;
  }
  let guard = 0;
  while (Vlist.length > 3 && guard++ < 1e4) {
    let ear = false;
    for (let i = 0; i < Vlist.length; i++) {
      const a = Vlist[(i - 1 + Vlist.length) % Vlist.length], b = Vlist[i], c = Vlist[(i + 1) % Vlist.length];
      if (triArea2(a, b, c) <= 0) continue;
      let contains = false;
      for (let j = 0; j < Vlist.length; j++) {
        const p = Vlist[j];
        if (p === a || p === b || p === c) continue;
        if (insideTri(p, a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      result.push([a, b, c]);
      Vlist.splice(i, 1);
      ear = true;
      break;
    }
    if (!ear) break;
  }
  if (Vlist.length === 3) result.push([Vlist[0], Vlist[1], Vlist[2]]);
  return result;
}

// lib/navmesh.js
function buildAdjacency(tris) {
  const map = /* @__PURE__ */ new Map();
  tris.forEach((t, i) => map.set(i, []));
  const samePt2 = (p, q) => p === q || Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;
  const sameEdge = (e1, e2) => samePt2(e1[0], e2[0]) && samePt2(e1[1], e2[1]) || samePt2(e1[0], e2[1]) && samePt2(e1[1], e2[0]);
  const edgesOf = (t) => [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
  for (let i = 0; i < tris.length; i++) {
    for (let j = i + 1; j < tris.length; j++) {
      const ea = edgesOf(tris[i]), eb = edgesOf(tris[j]);
      for (const A of ea) {
        for (const B of eb) {
          if (sameEdge(A, B)) {
            map.get(i).push({ to: j, edge: A });
            map.get(j).push({ to: i, edge: B });
          }
        }
      }
    }
  }
  return map;
}
function pointInTri(p, tri) {
  const [a, b, c] = tri;
  const s1 = triArea2(p, a, b), s2 = triArea2(p, b, c), s3 = triArea2(p, c, a);
  const eps = 1e-6;
  const b1 = s1 < -eps, b2 = s2 < -eps, b3 = s3 < -eps;
  const z1 = Math.abs(s1) <= eps, z2 = Math.abs(s2) <= eps, z3 = Math.abs(s3) <= eps;
  return b1 === b2 && b2 === b3 || z1 || z2 || z3;
}
function findTriIdContaining(p, triangles) {
  for (let i = 0; i < triangles.length; i++) if (pointInTri(p, triangles[i])) return i;
  return null;
}
function aStarTriangle(startId, goalId, triangles, adj, centroids) {
  if (startId == null || goalId == null) return null;
  const C = centroids || triangles.map((t) => centroidTriangle(t));
  const open = /* @__PURE__ */ new Set([startId]);
  const came = /* @__PURE__ */ new Map();
  const g = /* @__PURE__ */ new Map([[startId, 0]]);
  const f = /* @__PURE__ */ new Map([[startId, V.dist(C[startId], C[goalId])]]);
  const pick = () => {
    let best = null, bv = Infinity;
    for (const n of open) {
      const v = f.get(n) ?? Infinity;
      if (v < bv) {
        bv = v;
        best = n;
      }
    }
    return best;
  };
  while (open.size) {
    const cur = pick();
    if (cur === goalId) {
      const ids = [cur];
      let c = cur;
      while (came.has(c)) {
        c = came.get(c);
        ids.push(c);
      }
      return ids.reverse();
    }
    open.delete(cur);
    for (const e of adj.get(cur)) {
      const alt = (g.get(cur) ?? Infinity) + V.dist(C[cur], C[e.to]);
      if (alt < (g.get(e.to) ?? Infinity)) {
        came.set(e.to, cur);
        g.set(e.to, alt);
        f.set(e.to, alt + V.dist(C[e.to], C[goalId]));
        open.add(e.to);
      }
    }
  }
  return null;
}
var samePt = (p, q) => p === q || Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;
function thirdVertex(tri, edge) {
  return tri.find((p) => p !== edge[0] && p !== edge[1]);
}
function edgesOfTri(t) {
  return [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
}
function orientedPortal(currTri, sharedEdge) {
  const a = sharedEdge[0], b = sharedEdge[1], q = thirdVertex(currTri, sharedEdge);
  return triArea2(a, b, q) > 0 ? { left: { x: a.x, y: a.y }, right: { x: b.x, y: b.y } } : { left: { x: b.x, y: b.y }, right: { x: a.x, y: a.y } };
}
function portalsFromTriPath(triPath, triangles, start, end) {
  const P = [];
  for (let i = 0; i < triPath.length - 1; i++) {
    const curr = triangles[triPath[i]], next = triangles[triPath[i + 1]];
    const ea = edgesOfTri(curr), eb = edgesOfTri(next);
    let shared = null;
    outer: for (const A of ea) {
      for (const B of eb) {
        if (A[0] === B[0] && A[1] === B[1] || A[0] === B[1] && A[1] === B[0] || samePt(A[0], B[0]) && samePt(A[1], B[1]) || samePt(A[0], B[1]) && samePt(A[1], B[0])) {
          shared = A;
          break outer;
        }
      }
    }
    if (shared) P.push(orientedPortal(curr, shared));
  }
  P.push({ left: { x: end.x, y: end.y }, right: { x: end.x, y: end.y } });
  return P;
}
function funnel(start, portals) {
  const EPS = 1e-6;
  const out = [{ x: start.x, y: start.y }];
  let apex = { x: start.x, y: start.y };
  let left = { x: portals[0].left.x, y: portals[0].left.y };
  let right = { x: portals[0].right.x, y: portals[0].right.y };
  let ai = 0, li = 0, ri = 0;
  function area2(a, b, c) {
    return triArea2(a, b, c);
  }
  function veq(a, b) {
    return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
  }
  for (let i = 1; i < portals.length; i++) {
    const pL = portals[i].left, pR = portals[i].right;
    if (area2(apex, right, pR) <= EPS) {
      if (veq(apex, right) || area2(apex, left, pR) > EPS) {
        right = { x: pR.x, y: pR.y };
        ri = i;
      } else {
        out.push({ x: left.x, y: left.y });
        apex = { x: left.x, y: left.y };
        ai = li;
        left = { x: apex.x, y: apex.y };
        right = { x: apex.x, y: apex.y };
        li = ai;
        ri = ai;
        i = ai;
        continue;
      }
    }
    if (area2(apex, left, pL) >= -EPS) {
      if (veq(apex, left) || area2(apex, right, pL) < -EPS) {
        left = { x: pL.x, y: pL.y };
        li = i;
      } else {
        out.push({ x: right.x, y: right.y });
        apex = { x: right.x, y: right.y };
        ai = ri;
        left = { x: apex.x, y: apex.y };
        right = { x: apex.x, y: apex.y };
        li = ai;
        ri = ai;
        i = ai;
        continue;
      }
    }
  }
  const last = portals[portals.length - 1].left;
  if (!out.length || !samePt(out[out.length - 1], last)) out.push({ x: last.x, y: last.y });
  return out;
}
function computeCentroids(triangles) {
  return triangles.map((t) => centroidTriangle(t));
}

// lib/helpers.js
function polyCentroid(poly) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const w = p.x * q.y - q.x * p.y;
    A += w;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  A = A * 0.5 || 1;
  return { x: cx / (6 * A), y: cy / (6 * A) };
}
function nudgeInside(p, poly, d = 0.5) {
  const c = polyCentroid(poly);
  const vx = c.x - p.x, vy = c.y - p.y;
  const L = Math.hypot(vx, vy) || 1;
  return { x: p.x + vx / L * d, y: p.y + vy / L * d };
}
function closestPointOnSegment(p, a, b) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}
function closestPointOnBoundary(p, poly) {
  if (!poly || poly.length < 2) return p;
  let best = null, bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const q = closestPointOnSegment(p, a, b);
    const d = V.dist(p, q);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best || p;
}

// lib/validate.js
var ValidationErrorCodes = {
  NOT_ENOUGH_VERTICES: "NOT_ENOUGH_VERTICES",
  DUPLICATE_ADJACENT_VERTEX: "DUPLICATE_ADJACENT_VERTEX",
  SELF_INTERSECTION: "SELF_INTERSECTION"
};
function validatePolygon(poly) {
  const errors = [];
  if (!Array.isArray(poly) || poly.length < 3) {
    errors.push({ code: ValidationErrorCodes.NOT_ENOUGH_VERTICES, message: "Polygon must have at least 3 vertices" });
    return errors;
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (a.x === b.x && a.y === b.y) {
      errors.push({ code: ValidationErrorCodes.DUPLICATE_ADJACENT_VERTEX, message: `Duplicate adjacent vertex at index ${i}` });
      break;
    }
  }
  function segInt(a, b, c, d) {
    function orient(p, q, r) {
      return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    }
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) return false;
    return o1 * o2 < 0 && o3 * o4 < 0;
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    for (let j = i + 1; j < poly.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      const c = poly[j], d = poly[(j + 1) % poly.length];
      if (i === 0 && j === poly.length - 1) continue;
      if (segInt(a, b, c, d)) {
        errors.push({ code: ValidationErrorCodes.SELF_INTERSECTION, message: `Self intersection between edges ${i}-${i + 1} and ${j}-${j + 1}` });
        i = poly.length;
        break;
      }
    }
  }
  return errors;
}

// lib/api.js
var ErrorCodes = {
  OUTSIDE_POLY: "OUTSIDE_POLY",
  NO_PATH: "NO_PATH",
  ...ValidationErrorCodes
};
function smoothPathChaikin(path, iterations = 1) {
  if (!path || path.length < 3) return path;
  let pts = path.slice();
  for (let k = 0; k < iterations; k++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}
function buildNavMesh(polygon, opts = {}) {
  const { validate = true, includeDebug = false } = opts;
  const errors = validate ? validatePolygon(polygon) : [];
  if (errors.length && opts.errorMode === "code") {
    return { ok: false, code: errors[0].code, errors };
  }
  const cleaned = polygon.slice();
  if (!isCCW(cleaned)) cleaned.reverse();
  const tris = triangulate(cleaned);
  const adj = buildAdjacency(tris);
  const triCentroids = computeCentroids(tris);
  return { polygon: cleaned, tris, adj, centroids: triCentroids, ...includeDebug ? { debug: { tris, adj } } : {} };
}
function findPath(mesh, start, end, opts = {}) {
  const { smooth = false, smoothIterations = 1, snapNudge = 0.5, errorMode = "throw" } = opts;
  const inPolyStart = findTriIdContaining(start, mesh.tris);
  const inPolyEnd = findTriIdContaining(end, mesh.tris);
  if (inPolyStart == null || inPolyEnd == null) {
    const code = ErrorCodes.OUTSIDE_POLY;
    if (errorMode === "code") return { ok: false, code };
    throw Object.assign(new Error("Point outside polygon"), { code });
  }
  if (inPolyStart === inPolyEnd) {
    const path2 = [start, end];
    return { ok: true, path: smooth ? smoothPathChaikin(path2, smoothIterations) : path2 };
  }
  const triPath = aStarTriangle(inPolyStart, inPolyEnd, mesh.tris, mesh.adj, mesh.centroids);
  if (!triPath || !triPath.length) {
    const code = ErrorCodes.NO_PATH;
    if (errorMode === "code") return { ok: false, code };
    throw Object.assign(new Error("No path"), { code });
  }
  const portals = portalsFromTriPath(triPath, mesh.tris, start, end);
  let path = funnel(start, portals);
  if (snapNudge && path.length) {
    path[0] = nudgeInside(path[0], mesh.polygon, snapNudge);
    path[path.length - 1] = nudgeInside(path[path.length - 1], mesh.polygon, snapNudge);
  }
  if (smooth) path = smoothPathChaikin(path, smoothIterations);
  return { ok: true, path, triPath, portals };
}
function updatePolygon(meshRef, newPoly, opts = {}) {
  const old = meshRef.polygon;
  let changed = old.length !== newPoly.length;
  if (!changed) {
    for (let i = 0; i < old.length; i++) {
      const a = old[i], b = newPoly[i];
      if (a.x !== b.x || a.y !== b.y) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return { changed: false, mesh: meshRef };
  const rebuilt = buildNavMesh(newPoly, opts);
  Object.assign(meshRef, rebuilt);
  return { changed: true, mesh: meshRef };
}
function pathfind(polygon, start, end, opts = {}) {
  const mesh = buildNavMesh(polygon, opts);
  if (mesh.ok === false) return mesh;
  return findPath(mesh, start, end, opts);
}
var api_default = {
  buildNavMesh,
  findPath,
  pathfind,
  updatePolygon,
  ErrorCodes,
  ValidationErrorCodes,
  helpers: { polyCentroid, nudgeInside, closestPointOnBoundary },
  math: { V, triArea2, area, isCCW, centroidTriangle }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ErrorCodes,
  V,
  ValidationErrorCodes,
  buildNavMesh,
  closestPointOnBoundary,
  findPath,
  nudgeInside,
  pathfind,
  polyCentroid,
  updatePolygon
});
//# sourceMappingURL=index.cjs.map
