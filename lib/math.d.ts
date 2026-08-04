import type { Point, Triangle } from './api.js';

export type { Point, Triangle };

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

/** Twice the signed area of triangle abc; positive when counter-clockwise. */
export function triArea2(a: Point, b: Point, c: Point): number;

/** Signed area of a polygon; positive when counter-clockwise. */
export function area(poly: Point[]): number;

export function isCCW(poly: Point[]): boolean;

export function centroidTriangle(t: Triangle): Point;
