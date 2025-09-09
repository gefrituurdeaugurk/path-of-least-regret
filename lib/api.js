// Public API (ESM)
import { V, triArea2, area, isCCW, centroidTriangle } from './math.js';
import { triangulate } from './triangulate.js';
import { buildAdjacency, findTriIdContaining, aStarTriangle, portalsFromTriPath, funnel, computeCentroids } from './navmesh.js';
import { polyCentroid, nudgeInside, closestPointOnBoundary } from './helpers.js';
import { validatePolygon, ValidationErrorCodes } from './validate.js';

export const ErrorCodes = {
    OUTSIDE_POLY: 'OUTSIDE_POLY',
    NO_PATH: 'NO_PATH',
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
    if (errors.length && opts.errorMode === 'code') {
        return { ok: false, code: errors[0].code, errors };
    }
    const cleaned = polygon.slice();
    if (!isCCW(cleaned)) cleaned.reverse();
    const tris = triangulate(cleaned);
    const adj = buildAdjacency(tris);
    const triCentroids = computeCentroids(tris);
    return { polygon: cleaned, tris, adj, centroids: triCentroids, ...(includeDebug ? { debug: { tris, adj } } : {}) };
}

function findPath(mesh, start, end, opts = {}) {
    const { smooth = false, smoothIterations = 1, snapNudge = 0.5, errorMode = 'throw' } = opts;
    const inPolyStart = findTriIdContaining(start, mesh.tris);
    const inPolyEnd = findTriIdContaining(end, mesh.tris);
    if (inPolyStart == null || inPolyEnd == null) {
        const code = ErrorCodes.OUTSIDE_POLY;
        if (errorMode === 'code') return { ok: false, code };
        throw Object.assign(new Error('Point outside polygon'), { code });
    }
    if (inPolyStart === inPolyEnd) {
        const path = [start, end];
        return { ok: true, path: smooth ? smoothPathChaikin(path, smoothIterations) : path };
    }
    // Correct order: (startId, goalId, triangles, adjacency, centroids)
    const triPath = aStarTriangle(inPolyStart, inPolyEnd, mesh.tris, mesh.adj, mesh.centroids);
    if (!triPath || !triPath.length) {
        const code = ErrorCodes.NO_PATH;
        if (errorMode === 'code') return { ok: false, code };
        throw Object.assign(new Error('No path'), { code });
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
    // basic diff: if length or any coordinate differs, rebuild
    const old = meshRef.polygon;
    let changed = old.length !== newPoly.length;
    if (!changed) {
        for (let i = 0; i < old.length; i++) { const a = old[i], b = newPoly[i]; if (a.x !== b.x || a.y !== b.y) { changed = true; break; } }
    }
    if (!changed) return { changed: false, mesh: meshRef };
    const rebuilt = buildNavMesh(newPoly, opts);
    Object.assign(meshRef, rebuilt);
    return { changed: true, mesh: meshRef };
}

function pathfind(polygon, start, end, opts = {}) {
    const mesh = buildNavMesh(polygon, opts);
    if (mesh.ok === false) return mesh; // validation error in code mode
    return findPath(mesh, start, end, opts);
}

export default {
    buildNavMesh,
    findPath,
    pathfind,
    updatePolygon,
    ErrorCodes,
    ValidationErrorCodes,
    helpers: { polyCentroid, nudgeInside, closestPointOnBoundary },
    math: { V, triArea2, area, isCCW, centroidTriangle }
};

// Note: ErrorCodes already exported above; re-exporting again can trigger duplicate export errors in some browsers.
export { V, buildNavMesh, findPath, pathfind, updatePolygon, ValidationErrorCodes, polyCentroid, nudgeInside, closestPointOnBoundary };
