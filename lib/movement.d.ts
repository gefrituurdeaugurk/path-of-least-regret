import type { Point, PathResult } from './api.js';
import type { HorizonLayer, HorizonSet } from './horizon.js';

export type EasingFn = (t: number) => number;

/** Ramp shapes applied to the ease-in and ease-out factors. */
export const EASINGS: {
    linear: EasingFn;
    smoothstep: EasingFn;
    sine: EasingFn;
};

export type PathInput = Point[] | PathResult;

/** Total arc length of a waypoint list. */
export function pathLength(path: PathInput): number;

/** The point `distance` along the path, clamped to its ends. */
export function pointAtDistance(
    path: PathInput,
    distance: number
): { point: Point | null; index: number; t: number };

export interface MoverOptions {
    /** Units per second at `referenceScale`. Default `100`. */
    speed?: number;
    /** Distance over which the character accelerates from a standstill. Default `0`. */
    easeIn?: number;
    /** Distance over which it slows down before arriving. Default `0`. */
    easeOut?: number;
    /** Ramp shape, by name or as a function of `0..1`. Default `'smoothstep'`. */
    easing?: keyof typeof EASINGS | EasingFn;
    /** Floor on the eased speed, so the character always arrives. Default `0.1`. */
    minSpeedFactor?: number;
    /** Scales speed by the character's depth: something small in the distance moves slowly. */
    perspective?: HorizonLayer | HorizonSet | ((p: Point) => number) | null;
    /** The scale at which `speed` is exact. Default `1`. */
    referenceScale?: number;
}

export interface MoverStep {
    position: Point | null;
    /** Units per second along the path; feed straight to a facing tracker. */
    velocity: Point;
    speed: number;
    /** `0..1` along the path. */
    progress: number;
    travelled: number;
    done: boolean;
    /** Index of the waypoint the current segment starts at. */
    index: number;
}

export interface Mover {
    /** Advances by `dt` seconds. */
    step(dt: number): MoverStep;
    /** Replaces the path and restarts from its first waypoint. */
    setPath(path: PathInput): void;
    setSpeed(n: number): void;
    /** Drops the rest of the path, leaving the character where it stands. */
    stop(): void;
    /** Waypoints not yet reached, for drawing the road ahead. */
    remaining(): Point[];
    readonly position: Point | null;
    readonly done: boolean;
    readonly progress: number;
    readonly travelled: number;
    readonly total: number;
    readonly speed: number;
    readonly waypoints: Point[];
}

/** Walks a character along a path at a controlled speed. */
export function createMover(path: PathInput, opts?: MoverOptions): Mover;
