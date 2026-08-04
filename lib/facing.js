// Which way is the character walking? Turns a movement vector into one of N compass
// directions, so an integrator can pick the matching sprite row.
import { V } from './math.js';

/** The usual sprite-sheet direction counts, clockwise from North. */
export const DIRECTION_SETS = Object.freeze({
    4: Object.freeze(['N', 'E', 'S', 'W']),
    8: Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),
    16: Object.freeze([
        'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ])
});

const DEG = 180 / Math.PI;

/** Wraps to [0, 360). */
const wrap360 = (deg) => ((deg % 360) + 360) % 360;

/** Signed shortest angular difference a - b, in (-180, 180]. */
const angleDelta = (a, b) => {
    const d = wrap360(a - b);
    return d > 180 ? d - 360 : d;
};

function resolveNames(opts) {
    if (Array.isArray(opts.names)) {
        if (opts.names.length < 2) throw new Error('facing: `names` needs at least 2 entries');
        return opts.names;
    }
    const n = opts.directions ?? 8;
    const set = DIRECTION_SETS[n];
    if (!set) throw new Error(`facing: unsupported direction count ${n}; pass \`names\` instead`);
    return set;
}

/**
 * Compass bearing of a vector in degrees: 0 = North, 90 = East, clockwise.
 *
 * Screen space is Y-down, so North is -y and the x/y arguments to atan2 are swapped
 * relative to the usual maths convention. `yUp: true` flips it back for world-space
 * coordinates.
 */
export function bearingOf(v, yUp = false) {
    return wrap360(Math.atan2(v.x, yUp ? v.y : -v.y) * DEG);
}

/**
 * Snaps a movement vector to a direction in the set.
 *
 * Returns `null` for a vector shorter than `epsilon` — a standing character has no
 * movement direction to report, and the caller usually wants to keep the last one
 * rather than be handed an arbitrary answer.
 */
export function facingFromVector(v, opts = {}) {
    const { offset = 0, yUp = false, epsilon = 1e-9 } = opts;
    if (!v || !(V.len(v) > epsilon)) return null;

    const names = resolveNames(opts);
    const sector = 360 / names.length;
    const angle = bearingOf(v, yUp);
    const index = Math.round(wrap360(angle - offset) / sector) % names.length;

    return { index, name: names[index], angle, bearing: wrap360(offset + index * sector) };
}

/** `facingFromVector` for a pair of points; the direction of travel from `from` to `to`. */
export function facingFromPoints(from, to, opts = {}) {
    return facingFromVector(V.sub(to, from), opts);
}

/**
 * A `facingFromVector` that remembers its last answer.
 *
 * Walking along a sector boundary makes the raw snap flicker between two sprites on
 * consecutive frames. `hysteresis` widens the current sector by that many degrees on
 * both sides, so the character commits to a direction until the movement clearly
 * leaves it. Idle input holds the last direction instead of clearing it.
 */
export function createFacingTracker(opts = {}) {
    const { hysteresis = 0 } = opts;
    const names = resolveNames(opts);
    const sector = 360 / names.length;
    let current = null;

    function update(v) {
        const next = facingFromVector(v, { ...opts, names });
        if (!next) return current;
        if (!current || next.index === current.index) {
            current = next;
            return current;
        }
        if (Math.abs(angleDelta(next.angle, current.bearing)) <= sector / 2 + hysteresis) {
            // Still inside the widened sector: keep the direction, report the new angle.
            current = { ...current, angle: next.angle };
            return current;
        }
        current = next;
        return current;
    }

    return {
        update,
        updateFromPoints: (from, to) => update(V.sub(to, from)),
        reset: () => { current = null; },
        get current() { return current; },
        get names() { return names; }
    };
}
