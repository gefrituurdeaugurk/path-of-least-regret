import {
    DIRECTION_SETS,
    bearingOf,
    facingFromVector,
    facingFromPoints,
    createFacingTracker
} from './facing.js';
import { HorizonErrorCodes, createHorizonLayer, createHorizonSet } from './horizon.js';
import type { HorizonErrorCode } from './horizon.js';
import { EASINGS, pathLength, pointAtDistance, createMover } from './movement.js';

export interface Point { x: number; y: number; }

/** A triangle is a 3-tuple of vertices, wound counter-clockwise. */
export type Triangle = [Point, Point, Point];

/** An edge shared by two triangles, as a 2-tuple of the owning triangle's vertices. */
export type Edge = [Point, Point];

/** A portal is the shared edge of two adjacent triangles, oriented relative to travel direction. */
export interface Portal { left: Point; right: Point; }

/** Adjacency is keyed by triangle index; `edge` belongs to the source triangle. */
export type Adjacency = Map<number, Array<{ to: number; edge: Edge }>>;

export interface Mesh {
    polygon: Point[];
    tris: Triangle[];
    adj: Adjacency;
    centroids: Point[];
    debug?: { tris: Triangle[]; adj: Adjacency };
}

export type ErrorCode =
    | 'OUTSIDE_POLY'
    | 'NO_PATH'
    | 'NOT_ENOUGH_VERTICES'
    | 'DUPLICATE_ADJACENT_VERTEX'
    | 'SELF_INTERSECTION'
    | HorizonErrorCode;

export interface ValidationError { code: ErrorCode; message: string; }

export interface Failure {
    ok: false;
    code: ErrorCode;
    /** Present for OUTSIDE_POLY. */
    where?: 'start' | 'end';
    /** Present for validation failures. */
    errors?: ValidationError[];
}

export interface BuildOptions {
    /** Validate the polygon before triangulating. Default `true`. */
    validate?: boolean;
    /** Attach a `debug` field to the returned mesh. Default `false`. */
    includeDebug?: boolean;
    /** `'throw'` (default) raises an Error carrying `code`; `'code'` returns a `Failure`. */
    errorMode?: 'throw' | 'code';
}

export interface PathOptions extends BuildOptions {
    /** `true` for one Chaikin iteration, or a number of iterations (clamped to 1..5). */
    smooth?: boolean | number;
    /** Explicit iteration count, used when `smooth` is a boolean. Clamped to 1..5. */
    smoothIterations?: number;
    /**
     * Inward offset applied to an endpoint that sits within this distance of the
     * polygon boundary. Endpoints further inside are left untouched. Default `0.5`.
     */
    snapNudge?: number;
}

export interface PathResult {
    ok: true;
    /** Waypoints from start to end, with no duplicate consecutive points. */
    path: Point[];
    /** Triangle indices traversed. */
    triPath: number[];
    /** Portals crossed, in order. Empty when start and end share a triangle. */
    portals: Portal[];
}

export const ErrorCodes: {
    OUTSIDE_POLY: 'OUTSIDE_POLY';
    NO_PATH: 'NO_PATH';
    NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES';
    DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX';
    SELF_INTERSECTION: 'SELF_INTERSECTION';
    NO_LAYERS: 'NO_LAYERS';
    NOT_ENOUGH_HORIZONS: 'NOT_ENOUGH_HORIZONS';
    INVALID_HORIZON: 'INVALID_HORIZON';
    UNKNOWN_LAYER: 'UNKNOWN_LAYER';
};

export const ValidationErrorCodes: {
    NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES';
    DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX';
    SELF_INTERSECTION: 'SELF_INTERSECTION';
};

/**
 * Triangulates `polygon` and builds the navmesh. The polygon is copied, so later
 * mutation of the caller's points does not affect the mesh.
 *
 * Throws on an invalid polygon unless `errorMode: 'code'`.
 */
export function buildNavMesh(polygon: Point[], opts?: BuildOptions): Mesh | Failure;

/** Finds a smoothed path across `mesh`. Throws unless `errorMode: 'code'`. */
export function findPath(mesh: Mesh, start: Point, end: Point, opts?: PathOptions): PathResult | Failure;

/** Convenience wrapper: builds a mesh and paths through it in one call. */
export function pathfind(polygon: Point[], start: Point, end: Point, opts?: PathOptions): PathResult | Failure;

/**
 * Rebuilds `mesh` in place when `newPoly` differs from its current polygon.
 * On a validation failure in `'code'` mode the mesh is left untouched and the
 * failure is returned as `error`.
 */
export function updatePolygon(
    mesh: Mesh,
    newPoly: Point[],
    opts?: BuildOptions
): { changed: boolean; mesh: Mesh; error?: Failure };

/** Tests whether a point lies inside a triangle (edge-inclusive). */
export function pointInTri(p: Point, tri: Triangle): boolean;

export function polyCentroid(poly: Point[]): Point;
export function nudgeInside(p: Point, poly: Point[], d?: number): Point;
export function closestPointOnBoundary(p: Point, poly: Point[]): Point;

export const V: {
    add(a: Point, b: Point): Point;
    sub(a: Point, b: Point): Point;
    /** Scalar multiply. */
    mul(a: Point, s: number): Point;
    dot(a: Point, b: Point): number;
    cross(a: Point, b: Point): number;
    len(a: Point): number;
    dist(a: Point, b: Point): number;
    norm(a: Point): Point;
};

export function triArea2(a: Point, b: Point, c: Point): number;
export function area(poly: Point[]): number;
export function isCCW(poly: Point[]): boolean;
export function centroidTriangle(t: Triangle): Point;

export {
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
export type { Facing, FacingOptions, FacingTracker, FacingTrackerOptions } from './facing.js';
export type {
    Horizon,
    HorizonErrorCode,
    HorizonFailure,
    HorizonLayer,
    HorizonOptions,
    HorizonSet,
    HorizontalHorizon,
    NormalisedHorizon,
    TiltedHorizon
} from './horizon.js';
export type { EasingFn, Mover, MoverOptions, MoverStep, PathInput } from './movement.js';

declare const api: {
    buildNavMesh: typeof buildNavMesh;
    findPath: typeof findPath;
    pathfind: typeof pathfind;
    updatePolygon: typeof updatePolygon;
    ErrorCodes: typeof ErrorCodes;
    ValidationErrorCodes: typeof ValidationErrorCodes;
    HorizonErrorCodes: typeof HorizonErrorCodes;
    helpers: {
        polyCentroid: typeof polyCentroid;
        nudgeInside: typeof nudgeInside;
        closestPointOnBoundary: typeof closestPointOnBoundary;
    };
    math: {
        V: typeof V;
        triArea2: typeof triArea2;
        area: typeof area;
        isCCW: typeof isCCW;
        centroidTriangle: typeof centroidTriangle;
    };
    facing: {
        DIRECTION_SETS: typeof DIRECTION_SETS;
        bearingOf: typeof bearingOf;
        facingFromVector: typeof facingFromVector;
        facingFromPoints: typeof facingFromPoints;
        createFacingTracker: typeof createFacingTracker;
    };
    horizon: {
        createHorizonLayer: typeof createHorizonLayer;
        createHorizonSet: typeof createHorizonSet;
    };
    movement: {
        EASINGS: typeof EASINGS;
        pathLength: typeof pathLength;
        pointAtDistance: typeof pointAtDistance;
        createMover: typeof createMover;
    };
};

export default api;
