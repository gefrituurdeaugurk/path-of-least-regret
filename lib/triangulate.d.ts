import type { Point, Triangle, RegionInput } from './api.js';

/**
 * Ear-clipping triangulation of a simple (non self-intersecting) polygon.
 * Input winding is normalised internally; output triangles are counter-clockwise.
 * Returns an empty array for fewer than 3 vertices.
 *
 * Returns whatever it managed to clip if it stalls. Use `triangulateRegion` when a
 * partial result would be mistaken for unwalkable floor.
 */
export function triangulate(simplePoly: Point[]): Triangle[];

/**
 * Triangulates an outline with zero or more holes, bridging each hole into the outline.
 * Accepts a bare array as an outline with no holes. Deterministic: the same region always
 * yields the same triangles, whatever order the holes were given in.
 */
export function triangulateRegion(
    region: RegionInput
): { ok: true; tris: Triangle[] } | { ok: false; message: string };
