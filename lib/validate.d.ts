import type { Point, ValidationError } from './api.js';

export const ValidationErrorCodes: {
    NOT_ENOUGH_VERTICES: 'NOT_ENOUGH_VERTICES';
    DUPLICATE_ADJACENT_VERTEX: 'DUPLICATE_ADJACENT_VERTEX';
    SELF_INTERSECTION: 'SELF_INTERSECTION';
};

/** Returns an empty array when the polygon is usable, otherwise the problems found. */
export function validatePolygon(poly: Point[]): ValidationError[];
