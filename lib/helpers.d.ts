import type { Point } from './api.js';

/** Area-weighted centroid of a polygon. */
export function polyCentroid(poly: Point[]): Point;

/** Strict interior test: false for points on the outline. */
export function pointInPolygon(p: Point, poly: Point[], eps?: number): boolean;

/**
 * Moves `p` a distance `d` into the polygon, along the inward normal of the nearest
 * edge (falling back to the centroid direction if that does not land inside).
 */
export function nudgeInside(p: Point, poly: Point[], d?: number): Point;

export function closestPointOnSegment(p: Point, a: Point, b: Point): Point;

/** Nearest point on the polygon outline to `p`. */
export function closestPointOnBoundary(p: Point, poly: Point[]): Point;
