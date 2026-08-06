// Public API (ESM)
import { V, triArea2, area, isCCW, centroidTriangle } from './math.js';
import { triangulateRegion } from './triangulate.js';
import {
    buildAdjacency,
    findTriIdContaining,
    aStarTriangle,
    portalsFromTriPath,
    funnel,
    computeCentroids,
    pointInTri
} from './navmesh.js';
import { polyCentroid, nudgeInside, closestPointOnBoundary, pointInPolygon } from './helpers.js';
import {
    normaliseRegion,
    regionsEqual,
    pointInRegion,
    closestPointOnRegionBoundary,
    distanceToRegionBoundary,
    nudgeIntoRegion,
    pushCornerClear
} from './region.js';
import { validatePolygon, validateRegion, ValidationErrorCodes } from './validate.js';
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
    TRIANGULATION_FAILED: 'TRIANGULATION_FAILED',
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

/**
 * The region a mesh covers. Falls back to the outline alone for a mesh that predates
 * hole support, so a cached 0.2.0 mesh keeps working.
 */
const meshRegion = (mesh) => mesh.region ?? { outline: mesh.polygon, holes: mesh.holes ?? [] };

function buildNavMesh(input, opts = {}) {
    const { validate = true, includeDebug = false, errorMode = 'throw' } = opts;

    const errors = validate ? validateRegion(input) : [];
    if (errors.length) {
        // Previously these were computed and then dropped unless errorMode was 'code',
        // so an invalid polygon silently produced a garbage mesh.
        return fail(errors[0].code, errorMode, errors[0].message, { errors });
    }

    // Copy the points as well as the array: triangulation and adjacency rely on vertex
    // identity, so a caller mutating their own point objects must not corrupt the mesh.
    const region = normaliseRegion(input);

    const result = triangulateRegion(region);
    if (result.ok === false) {
        return fail(ErrorCodes.TRIANGULATION_FAILED, errorMode, result.message);
    }

    const tris = result.tris;
    const adj = buildAdjacency(tris);
    const centroids = computeCentroids(tris);

    return {
        polygon: region.outline,
        holes: region.holes,
        region,
        tris,
        adj,
        centroids,
        ...(includeDebug ? { debug: { tris, adj } } : {})
    };
}

/** True when `p` sits on walkable floor: inside the outline and outside every hole. */
function isWalkable(mesh, p) {
    return findTriIdContaining(p, mesh.tris) != null;
}

/**
 * Moves `p` onto walkable floor if it is not there already, `inset` clear of the nearest
 * wall. A point inside a hole lands beside the hole rather than across the room.
 */
function clampToWalkable(mesh, p, opts = {}) {
    const { inset = 0.5 } = opts;
    const region = meshRegion(mesh);
    if (isWalkable(mesh, p) && distanceToRegionBoundary(p, region) >= inset) {
        return { x: p.x, y: p.y };
    }
    return nudgeIntoRegion(closestPointOnRegionBoundary(p, region), region, inset);
}

/** True when `p` sits further than `margin` from every wall, hole edges included. */
function isWellInside(p, region, margin) {
    if (margin <= 0) return true;
    return distanceToRegionBoundary(p, region) > margin;
}

function findPath(mesh, start, end, opts = {}) {
    const {
        smooth = false,
        smoothIterations = 1,
        snapNudge = 0.5,
        clearance = 0,
        includeClearance = false,
        errorMode = 'throw'
    } = opts;

    const region = meshRegion(mesh);
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
        triPath = aStarTriangle(startId, endId, mesh.tris, mesh.adj, mesh.centroids, {
            minPortalWidth: clearance > 0 ? clearance * 2 : 0
        });
        if (!triPath || !triPath.length) {
            return fail(ErrorCodes.NO_PATH, errorMode, 'No path');
        }
        portals = portalsFromTriPath(triPath, mesh.tris, start, end, mesh.adj);
        path = funnel(start, portals);
    }

    // Only pull an endpoint inward when it actually sits on (or near) the boundary.
    // Nudging unconditionally moved endpoints the caller had placed well inside.
    // The start keeps to `snapNudge` however wide the clearance: it is where the actor
    // already stands, and jumping it off the wall would look like a teleport.
    if (path.length) {
        const lastIdx = path.length - 1;
        const endInset = Math.max(snapNudge, clearance);
        if (snapNudge > 0 && !isWellInside(path[0], region, snapNudge)) {
            path[0] = nudgeIntoRegion(path[0], region, snapNudge);
        }
        if (endInset > 0 && !isWellInside(path[lastIdx], region, endInset)) {
            path[lastIdx] = nudgeIntoRegion(path[lastIdx], region, endInset);
        }
    }

    // The funnel turns at the ring vertices it wraps around, so those are exactly the
    // waypoints that need moving off the wall. Anything the floor will not take is left
    // where it was rather than pushed somewhere unwalkable.
    if (clearance > 0) {
        for (let i = 1; i < path.length - 1; i++) {
            const moved = pushCornerClear(path[i], region, clearance)
                ?? nudgeIntoRegion(path[i], region, clearance - distanceToRegionBoundary(path[i], region));
            if (findTriIdContaining(moved, mesh.tris) != null) path[i] = moved;
        }
    }

    if (smooth) path = smoothPathChaikin(path, resolveIterations(smooth, smoothIterations));

    const result = { ok: true, path, triPath, portals };
    if (includeClearance) {
        result.clearances = path.map((p) => distanceToRegionBoundary(p, region));
    }
    return result;
}

function updatePolygon(meshRef, newRegion, opts = {}) {
    // Compare after normalising: a mesh stores its holes clockwise whatever winding they
    // were authored in, so comparing raw input against storage would rebuild every time.
    // A bare array replaces the whole region, holes included, so that passing the same
    // value to `updatePolygon` and to `buildNavMesh` gives the same mesh.
    if (regionsEqual(meshRegion(meshRef), normaliseRegion(newRegion))) {
        return { changed: false, mesh: meshRef };
    }

    const rebuilt = buildNavMesh(newRegion, opts);
    // In 'code' mode a rejected polygon comes back as { ok:false, ... }; merging that
    // into the live mesh used to leave the caller holding a half-overwritten object.
    if (rebuilt.ok === false) return { changed: false, mesh: meshRef, error: rebuilt };

    delete meshRef.debug;
    Object.assign(meshRef, rebuilt);
    return { changed: true, mesh: meshRef };
}

function pathfind(region, start, end, opts = {}) {
    const mesh = buildNavMesh(region, opts);
    if (mesh.ok === false) return mesh; // validation error in code mode
    return findPath(mesh, start, end, opts);
}

export default {
    buildNavMesh,
    findPath,
    pathfind,
    updatePolygon,
    isWalkable,
    clampToWalkable,
    ErrorCodes,
    ValidationErrorCodes,
    HorizonErrorCodes,
    helpers: {
        polyCentroid,
        nudgeInside,
        closestPointOnBoundary,
        pointInPolygon,
        pointInRegion,
        closestPointOnRegionBoundary,
        distanceToRegionBoundary,
        nudgeIntoRegion
    },
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
    isWalkable,
    clampToWalkable,
    ValidationErrorCodes,
    validatePolygon,
    validateRegion,
    polyCentroid,
    nudgeInside,
    closestPointOnBoundary,
    pointInPolygon,
    pointInRegion,
    closestPointOnRegionBoundary,
    distanceToRegionBoundary,
    nudgeIntoRegion,
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
