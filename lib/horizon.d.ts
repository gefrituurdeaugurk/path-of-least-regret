import type { Point } from './api.js';

export const HorizonErrorCodes: {
    NO_LAYERS: 'NO_LAYERS';
    NOT_ENOUGH_HORIZONS: 'NOT_ENOUGH_HORIZONS';
    INVALID_HORIZON: 'INVALID_HORIZON';
    UNKNOWN_LAYER: 'UNKNOWN_LAYER';
};

export type HorizonErrorCode = 'NO_LAYERS' | 'NOT_ENOUGH_HORIZONS' | 'INVALID_HORIZON' | 'UNKNOWN_LAYER';

export interface HorizonFailure {
    ok: false;
    code: HorizonErrorCode;
    /** Index of the offending horizon, for `INVALID_HORIZON`. */
    index?: number;
    /** Layer id, for `UNKNOWN_LAYER` and for a layer that failed to build. */
    layer?: string;
}

/** A horizontal horizon: only its y matters. */
export interface HorizontalHorizon { y: number; scale: number; }

/** A tilted horizon, defined by two points with differing x. */
export interface TiltedHorizon { a: Point; b: Point; scale: number; }

export type Horizon = HorizontalHorizon | TiltedHorizon;

/** A horizon as stored on a built layer. */
export type NormalisedHorizon =
    | { tilted: false; y: number; scale: number }
    | { tilted: true; a: Point; b: Point; scale: number };

export interface HorizonOptions {
    /** `'throw'` (default) raises an Error carrying `code`; `'code'` returns a `HorizonFailure`. */
    errorMode?: 'throw' | 'code';
}

export interface HorizonLayer {
    horizons: NormalisedHorizon[];
    /** Scale at a point, interpolated between the bracketing horizons and clamped beyond them. */
    scaleAt(point: Point): number;
    minScale: number;
    maxScale: number;
}

/** Builds a scale ramp from two or more horizons, given in any order. */
export function createHorizonLayer(horizons: Horizon[], opts?: HorizonOptions): HorizonLayer | HorizonFailure;

export interface HorizonSet {
    ids: string[];
    /** The named layer, or the active one when `id` is omitted. */
    layer(id?: string): HorizonLayer | null;
    /** Switches the active layer. */
    use(id: string): HorizonLayer | HorizonFailure;
    /** Scale at a point on `id`, or on the active layer when `id` is omitted. */
    scaleAt(point: Point, id?: string): number | HorizonFailure;
    readonly active: string;
}

/** A named collection of layers with one active at a time. */
export function createHorizonSet(
    layers: Record<string, Horizon[] | HorizonLayer>,
    opts?: HorizonOptions
): HorizonSet | HorizonFailure;
