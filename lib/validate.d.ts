import type { Point, RegionInput, ValidationError, ValidateOptions } from './api.js';

export type { ValidationError, ValidateOptions };

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
 * Returns an empty array when the polygon is usable, otherwise the problems found, each
 * located by vertex index, edge pair and crossing point where that applies.
 *
 * Stops at the first problem of each kind unless `all` is set.
 */
export function validatePolygon(poly: Point[], opts?: ValidateOptions): ValidationError[];

/**
 * Validates an outline and its holes, including how they sit relative to one another.
 * Holes must lie strictly inside the outline and strictly outside each other; touching
 * is rejected with `HOLE_TOUCHES_OUTLINE` rather than supported.
 */
export function validateRegion(region: RegionInput, opts?: ValidateOptions): ValidationError[];
