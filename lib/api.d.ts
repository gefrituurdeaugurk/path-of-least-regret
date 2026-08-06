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

/** An outline with the parts you walk around cut out of it. */
export interface Region {
    outline: Point[];
    holes?: Point[][];
}

/** Anywhere a region is accepted, a bare array still means "outline, no holes". */
export type RegionInput = Point[] | Region;

/**
 * A region in canonical winding: outline counter-clockwise, every hole clockwise. Under
 * that invariant the left normal of any ring edge points into the walkable area.
 */
export interface NormalisedRegion {
    outline: Point[];
    holes: Point[][];
}

export interface Mesh {
    /** The outline, counter-clockwise. Holes are not part of it. */
    polygon: Point[];
    /** Each hole, clockwise. Empty when the region has none. */
    holes: Point[][];
    /** Outline and holes together — the whole truth about the walkable area. */
    region: NormalisedRegion;
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
    | 'HOLE_OUTSIDE_OUTLINE'
    | 'HOLE_INTERSECTS_OUTLINE'
    | 'HOLE_TOUCHES_OUTLINE'
    | 'HOLE_OVERLAP'
    | 'TRIANGULATION_FAILED'
    | HorizonErrorCode;

export interface ValidationError {
    code: ErrorCode;
    message: string;
    /** Index of the offending vertex, or of the first of the two crossing edges. */
    index?: number;
    /** Which ring the problem is on. */
    ring?: 'outline' | 'hole';
    /** Which hole, when `ring` is `'hole'`. */
    ringIndex?: number;
    /** The two edges that cross, by starting vertex index. */
    edges?: [number, number];
    /** Where the problem is, in region coordinates. */
    at?: Point;
}

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
     * region boundary. Endpoints further inside are left untouched. Default `0.5`.
     */
    snapNudge?: number;
    /**
     * Keep the path this far from every wall, hole edges included — the radius of the
     * body walking it. Portals narrower than `2 * clearance` are refused, so a corridor
     * too tight to fit through fails with `NO_PATH` rather than producing a path that
     * clips it. Approximate by design: it constrains the corners the path turns, not
     * every point along it. Default `0`.
     */
    clearance?: number;
    /** Populate `PathResult.clearances`. Default `false`. */
    includeClearance?: boolean;
}

export interface PathResult {
    ok: true;
    /** Waypoints from start to end, with no duplicate consecutive points. */
    path: Point[];
    /** Triangle indices traversed. */
    triPath: number[];
    /** Portals crossed, in order. Empty when start and end share a triangle. */
    portals: Portal[];
    /**
     * Distance from each waypoint to the nearest wall, when `includeClearance` is set.
     * Use it to decide whether two characters can pass each other at a given point.
     */
    clearances?: number[];
}

export const ErrorCodes: {
    OUTSIDE_POLY: 'OUTSIDE_POLY';
    NO_PATH: 'NO_PATH';
    TRIANGULATION_FAILED: 'TRIANGULATION_FAILED';
    NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES';
    DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX';
    SELF_INTERSECTION: 'SELF_INTERSECTION';
    HOLE_OUTSIDE_OUTLINE: 'HOLE_OUTSIDE_OUTLINE';
    HOLE_INTERSECTS_OUTLINE: 'HOLE_INTERSECTS_OUTLINE';
    HOLE_TOUCHES_OUTLINE: 'HOLE_TOUCHES_OUTLINE';
    HOLE_OVERLAP: 'HOLE_OVERLAP';
    NO_LAYERS: 'NO_LAYERS';
    NOT_ENOUGH_HORIZONS: 'NOT_ENOUGH_HORIZONS';
    INVALID_HORIZON: 'INVALID_HORIZON';
    UNKNOWN_LAYER: 'UNKNOWN_LAYER';
};

export const ValidationErrorCodes: {
    NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES';
    DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX';
    SELF_INTERSECTION: 'SELF_INTERSECTION';
    HOLE_OUTSIDE_OUTLINE: 'HOLE_OUTSIDE_OUTLINE';
    HOLE_INTERSECTS_OUTLINE: 'HOLE_INTERSECTS_OUTLINE';
    HOLE_TOUCHES_OUTLINE: 'HOLE_TOUCHES_OUTLINE';
    HOLE_OVERLAP: 'HOLE_OVERLAP';
};

/**
 * Triangulates `region` and builds the navmesh. Accepts a bare vertex array for a region
 * with no holes. Points are copied, so later mutation of the caller's points does not
 * affect the mesh.
 *
 * Throws on an invalid region unless `errorMode: 'code'`.
 */
export function buildNavMesh(region: RegionInput, opts?: BuildOptions): Mesh | Failure;

/** Finds a smoothed path across `mesh`. Throws unless `errorMode: 'code'`. */
export function findPath(mesh: Mesh, start: Point, end: Point, opts?: PathOptions): PathResult | Failure;

/** Convenience wrapper: builds a mesh and paths through it in one call. */
export function pathfind(region: RegionInput, start: Point, end: Point, opts?: PathOptions): PathResult | Failure;

/**
 * Rebuilds `mesh` in place when `newRegion` differs from the region it currently covers.
 * A bare array replaces the whole region, clearing any holes, so that the same value
 * passed here and to `buildNavMesh` produces the same mesh.
 *
 * On a validation failure in `'code'` mode the mesh is left untouched and the failure is
 * returned as `error`.
 */
export function updatePolygon(
    mesh: Mesh,
    newRegion: RegionInput,
    opts?: BuildOptions
): { changed: boolean; mesh: Mesh; error?: Failure };

/**
 * True when `p` is on walkable floor: inside the outline and outside every hole.
 *
 * This is the mesh question. `pointInPolygon` remains the polygon question and knows
 * nothing about holes, which is what you want for hit-testing a hotspot or a light zone.
 */
export function isWalkable(mesh: Mesh, p: Point): boolean;

/**
 * Moves `p` onto walkable floor if it is not there already, `inset` clear of the nearest
 * wall. A point inside a hole lands beside that hole, not across the room.
 */
export function clampToWalkable(mesh: Mesh, p: Point, opts?: { inset?: number }): Point;

/** Tests whether a point lies inside a triangle (edge-inclusive). */
export function pointInTri(p: Point, tri: Triangle): boolean;

export function polyCentroid(poly: Point[]): Point;
export function nudgeInside(p: Point, poly: Point[], d?: number): Point;
export function closestPointOnBoundary(p: Point, poly: Point[]): Point;
/** Strict interior test against a single polygon. Unaware of holes, by design. */
export function pointInPolygon(p: Point, poly: Point[], eps?: number): boolean;

/** Strict: false on the outline, and false anywhere on or inside a hole. */
export function pointInRegion(p: Point, region: NormalisedRegion, eps?: number): boolean;
/** Nearest point on the outline or on any hole edge, whichever is closer. */
export function closestPointOnRegionBoundary(p: Point, region: NormalisedRegion): Point;
/** Distance to the nearest wall, counting hole edges as walls. */
export function distanceToRegionBoundary(p: Point, region: NormalisedRegion): number;
/** Moves `p` a distance `d` into the walkable area — away from a hole, in off a wall. */
export function nudgeIntoRegion(p: Point, region: NormalisedRegion, d?: number): Point;

export function validatePolygon(poly: Point[], opts?: ValidateOptions): ValidationError[];
export function validateRegion(region: RegionInput, opts?: ValidateOptions): ValidationError[];

export interface ValidateOptions {
    /** Report every problem rather than the first of each kind. Default `false`. */
    all?: boolean;
}

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
    isWalkable: typeof isWalkable;
    clampToWalkable: typeof clampToWalkable;
    ErrorCodes: typeof ErrorCodes;
    ValidationErrorCodes: typeof ValidationErrorCodes;
    HorizonErrorCodes: typeof HorizonErrorCodes;
    helpers: {
        polyCentroid: typeof polyCentroid;
        nudgeInside: typeof nudgeInside;
        closestPointOnBoundary: typeof closestPointOnBoundary;
        pointInPolygon: typeof pointInPolygon;
        pointInRegion: typeof pointInRegion;
        closestPointOnRegionBoundary: typeof closestPointOnRegionBoundary;
        distanceToRegionBoundary: typeof distanceToRegionBoundary;
        nudgeIntoRegion: typeof nudgeIntoRegion;
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
