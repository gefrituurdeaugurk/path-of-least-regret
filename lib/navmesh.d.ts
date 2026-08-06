import type { Point, Triangle, Adjacency, Portal } from './api.js';

export type { Adjacency, Portal };

/** Builds triangle adjacency by edge hashing. Each `edge` belongs to the source triangle. */
export function buildAdjacency(tris: Triangle[]): Adjacency;

/** Edge-inclusive point-in-triangle test. */
export function pointInTri(p: Point, tri: Triangle): boolean;

/** Index of the first triangle containing `p`, or `null`. */
export function findTriIdContaining(p: Point, triangles: Triangle[]): number | null;

/** A* over the triangle adjacency graph. Returns triangle indices, or `null` if unreachable. */
export function aStarTriangle(
    startId: number | null,
    goalId: number | null,
    triangles: Triangle[],
    adj: Adjacency,
    centroids?: Point[],
    opts?: {
        /** Refuse to cross a shared edge shorter than this. Default `0`. */
        minPortalWidth?: number;
    }
): number[] | null;

/** Portals crossed along a triangle path. Pass `adj` to reuse precomputed shared edges. */
export function portalsFromTriPath(
    triPath: number[],
    triangles: Triangle[],
    start: Point,
    end: Point,
    adj?: Adjacency | null
): Portal[];

/** Simple stupid funnel algorithm. Returns waypoints with no duplicate consecutive points. */
export function funnel(start: Point, portals: Portal[]): Point[];

export function computeCentroids(triangles: Triangle[]): Point[];
