import type { Point } from './api.js';

/** The usual sprite-sheet direction counts, clockwise from North. */
export const DIRECTION_SETS: {
    readonly 4: readonly string[];
    readonly 8: readonly string[];
    readonly 16: readonly string[];
};

export interface FacingOptions {
    /** How many directions the character has. Default `8`. Ignored when `names` is given. */
    directions?: 4 | 8 | 16;
    /** Custom direction names, clockwise from `offset`. Overrides `directions`. */
    names?: readonly string[];
    /** Bearing of the first direction in the set, in degrees. Default `0` (North). */
    offset?: number;
    /** Set for a Y-up world; screen space (Y-down) is the default. */
    yUp?: boolean;
    /** Vectors shorter than this count as standing still. Default `1e-9`. */
    epsilon?: number;
}

export interface FacingTrackerOptions extends FacingOptions {
    /** Degrees the current sector is widened by before the direction is allowed to change. */
    hysteresis?: number;
}

export interface Facing {
    /** Index into the direction set. */
    index: number;
    name: string;
    /** Exact bearing of the movement vector, in degrees. */
    angle: number;
    /** Bearing of the snapped direction's centre, in degrees. */
    bearing: number;
}

/** Compass bearing of a vector in degrees: 0 = North, 90 = East, clockwise. */
export function bearingOf(v: Point, yUp?: boolean): number;

/** Snaps a movement vector to a direction. Returns `null` when the vector is negligible. */
export function facingFromVector(v: Point, opts?: FacingOptions): Facing | null;

/** Direction of travel from `from` to `to`. */
export function facingFromPoints(from: Point, to: Point, opts?: FacingOptions): Facing | null;

export interface FacingTracker {
    /** Feeds a movement vector; returns the current facing, holding it on idle input. */
    update(v: Point): Facing | null;
    updateFromPoints(from: Point, to: Point): Facing | null;
    reset(): void;
    readonly current: Facing | null;
    readonly names: readonly string[];
}

/** A `facingFromVector` that remembers its last answer and resists flicker. */
export function createFacingTracker(opts?: FacingTrackerOptions): FacingTracker;
