import type { Point, Triangle } from './api.js';

/**
 * Ear-clipping triangulation of a simple (non self-intersecting) polygon.
 * Input winding is normalised internally; output triangles are counter-clockwise.
 * Returns an empty array for fewer than 3 vertices.
 */
export function triangulate(simplePoly: Point[]): Triangle[];
