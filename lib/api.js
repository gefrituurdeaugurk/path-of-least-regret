// Public API (ESM)
import { V, triArea2, area, isCCW, centroidTriangle } from './math.js';
import { triangulate } from './triangulate.js';
import {
    buildAdjacency,
    findTriIdContaining,
    aStarTriangle,
    portalsFromTriPath,
    funnel,
    computeCentroids,
    pointInTri
} from './navmesh.js';
import { polyCentroid, nudgeInside, closestPointOnBoundary } from './helpers.js';
import { validatePolygon, ValidationErrorCodes } from './validate.js';
import {
    DIRECTION_SETS,
    bearingOf,
    facingFromVector,
    facingFromPoints,
    createFacingTracker
} from './facing.js';
import { HorizonErrorCodes, createHorizonLayer, createHorizonSet } from './horizon.js';
import { EASINGS, pathLength, pointAtDistance, createMover } from './movement.js';

export const ErrorCodes = {
    OUTSIDE_POLY: 'OUTSIDE_POLY',
    NO_PATH: 'NO_PATH',
    ...ValidationErrorCodes,
    ...HorizonErrorCodes
};

const MAX_SMOOTH_ITERATIONS = 5;

function fail(code, errorMode, message, extra = {}) {
    if (errorMode === 'code') return { ok: false, code, ...extra };
    throw Object.assign(new Error(message), { code, ...extra });
}

/** `smooth` accepts a boolean or an iteration count; `smoothIterations` is the explicit form. */
function resolveIterations(smooth, smoothIterations) {
    const raw = typeof smooth === 'number' ? smooth : smoothIterations;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, MAX_SMOOTH_ITERATIONS);
}

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
    const { validate = true, includeDebug = false, errorMode = 'throw' } = opts;

    const errors = validate ? validatePolygon(polygon) : [];
    if (errors.length) {
        // Previously these were computed and then dropped unless errorMode was 'code',
        // so an invalid polygon silently produced a garbage mesh.
        return fail(errors[0].code, errorMode, errors[0].message, { errors });
    }

    // Copy the points as well as the array: triangulation and adjacency rely on vertex
    // identity, so a caller mutating their own point objects must not corrupt the mesh.
    const cleaned = polygon.map((p) => ({ x: p.x, y: p.y }));
    if (!isCCW(cleaned)) cleaned.reverse();

    const tris = triangulate(cleaned);
    const adj = buildAdjacency(tris);
    const centroids = computeCentroids(tris);

    return {
        polygon: cleaned,
        tris,
        adj,
        centroids,
        ...(includeDebug ? { debug: { tris, adj } } : {})
    };
}

/** True when `p` sits further than `margin` from every polygon edge. */
function isWellInside(p, polygon, margin) {
    if (margin <= 0) return true;
    const q = closestPointOnBoundary(p, polygon);
    return V.dist(p, q) > margin;
}

function findPath(mesh, start, end, opts = {}) {
    const {
        smooth = false,
        smoothIterations = 1,
        snapNudge = 0.5,
        errorMode = 'throw'
    } = opts;

    const startId = findTriIdContaining(start, mesh.tris);
    const endId = findTriIdContaining(end, mesh.tris);
    if (startId == null || endId == null) {
        return fail(ErrorCodes.OUTSIDE_POLY, errorMode, 'Point outside polygon', {
            where: startId == null ? 'start' : 'end'
        });
    }

    let path;
    let triPath;
    let portals;

    if (startId === endId) {
        path = [{ x: start.x, y: start.y }, { x: end.x, y: end.y }];
        triPath = [startId];
        portals = [];
    } else {
        triPath = aStarTriangle(startId, endId, mesh.tris, mesh.adj, mesh.centroids);
        if (!triPath || !triPath.length) {
            return fail(ErrorCodes.NO_PATH, errorMode, 'No path');
        }
        portals = portalsFromTriPath(triPath, mesh.tris, start, end, mesh.adj);
        path = funnel(start, portals);
    }

    // Only pull an endpoint inward when it actually sits on (or near) the boundary.
    // Nudging unconditionally moved endpoints the caller had placed well inside.
    if (snapNudge > 0 && path.length) {
        const lastIdx = path.length - 1;
        if (!isWellInside(path[0], mesh.polygon, snapNudge)) {
            path[0] = nudgeInside(path[0], mesh.polygon, snapNudge);
        }
        if (!isWellInside(path[lastIdx], mesh.polygon, snapNudge)) {
            path[lastIdx] = nudgeInside(path[lastIdx], mesh.polygon, snapNudge);
        }
    }

    if (smooth) path = smoothPathChaikin(path, resolveIterations(smooth, smoothIterations));

    return { ok: true, path, triPath, portals };
}

function updatePolygon(meshRef, newPoly, opts = {}) {
    const old = meshRef.polygon;
    let changed = old.length !== newPoly.length;
    if (!changed) {
        for (let i = 0; i < old.length; i++) {
            const a = old[i], b = newPoly[i];
            if (a.x !== b.x || a.y !== b.y) { changed = true; break; }
        }
    }
    if (!changed) return { changed: false, mesh: meshRef };

    const rebuilt = buildNavMesh(newPoly, opts);
    // In 'code' mode a rejected polygon comes back as { ok:false, ... }; merging that
    // into the live mesh used to leave the caller holding a half-overwritten object.
    if (rebuilt.ok === false) return { changed: false, mesh: meshRef, error: rebuilt };

    delete meshRef.debug;
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
    HorizonErrorCodes,
    helpers: { polyCentroid, nudgeInside, closestPointOnBoundary },
    math: { V, triArea2, area, isCCW, centroidTriangle },
    facing: { DIRECTION_SETS, bearingOf, facingFromVector, facingFromPoints, createFacingTracker },
    horizon: { createHorizonLayer, createHorizonSet },
    movement: { EASINGS, pathLength, pointAtDistance, createMover }
};

// Note: ErrorCodes is already exported above; re-exporting it here would be a duplicate.
export {
    V,
    buildNavMesh,
    findPath,
    pathfind,
    updatePolygon,
    ValidationErrorCodes,
    polyCentroid,
    nudgeInside,
    closestPointOnBoundary,
    pointInTri,
    triArea2,
    area,
    isCCW,
    centroidTriangle,
    DIRECTION_SETS,
    bearingOf,
    facingFromVector,
    facingFromPoints,
    createFacingTracker,
    HorizonErrorCodes,
    createHorizonLayer,
    createHorizonSet,
    EASINGS,
    pathLength,
    pointAtDistance,
    createMover
};
