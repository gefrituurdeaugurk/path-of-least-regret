// Walking a path, rather than finding one: constant-speed traversal with optional
// acceleration at the ends and perspective-aware speed.
import { V } from './math.js';

/** Ramp shapes applied to the ease-in and ease-out factors. */
export const EASINGS = {
    linear: (t) => t,
    smoothstep: (t) => t * t * (3 - 2 * t),
    sine: (t) => Math.sin((t * Math.PI) / 2)
};

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Accepts a raw waypoint array or the `PathResult` that `findPath` returns. */
function toWaypoints(path) {
    const pts = Array.isArray(path) ? path : path?.path;
    if (!Array.isArray(pts)) return [];
    return pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: p.x, y: p.y }));
}

/** Total arc length of a waypoint list. */
export function pathLength(path) {
    const pts = toWaypoints(path);
    let sum = 0;
    for (let i = 1; i < pts.length; i++) sum += V.dist(pts[i - 1], pts[i]);
    return sum;
}

/**
 * The point `distance` along the path, plus the segment it fell on.
 *
 * Distances outside the path clamp to its ends, so a caller that overshoots by a frame
 * lands exactly on the last waypoint rather than past it.
 */
export function pointAtDistance(path, distance) {
    const pts = toWaypoints(path);
    if (!pts.length) return { point: null, index: 0, t: 0 };
    if (!(distance > 0)) return { point: { ...pts[0] }, index: 0, t: 0 };

    let remaining = distance;
    for (let i = 1; i < pts.length; i++) {
        const seg = V.dist(pts[i - 1], pts[i]);
        if (seg <= 0) continue;
        if (remaining <= seg) {
            const t = remaining / seg;
            return { point: V.add(pts[i - 1], V.mul(V.sub(pts[i], pts[i - 1]), t)), index: i - 1, t };
        }
        remaining -= seg;
    }
    return { point: { ...pts[pts.length - 1] }, index: Math.max(0, pts.length - 2), t: 1 };
}

function resolveEasing(easing) {
    if (typeof easing === 'function') return easing;
    const fn = EASINGS[easing ?? 'smoothstep'];
    if (!fn) throw new Error(`movement: unknown easing "${easing}"`);
    return fn;
}

/** `perspective` may be a horizon layer, a horizon set, or a bare function. */
function resolveScaleAt(perspective) {
    if (!perspective) return null;
    if (typeof perspective === 'function') return perspective;
    if (typeof perspective.scaleAt === 'function') return (p) => perspective.scaleAt(p);
    throw new Error('movement: `perspective` needs a scaleAt method or a function');
}

/**
 * Walks a character along a path.
 *
 * Speed is integrated one frame at a time rather than solved up front, because both the
 * easing factor and the perspective factor depend on where the character currently is —
 * and with a horizon set the integrator may switch depth planes mid-walk.
 */
export function createMover(path, opts = {}) {
    const {
        speed = 100,
        easeIn = 0,
        easeOut = 0,
        minSpeedFactor = 0.1,
        perspective = null,
        referenceScale = 1
    } = opts;

    if (!(speed > 0)) throw new Error('movement: `speed` must be positive');

    const ease = resolveEasing(opts.easing);
    const scaleAt = resolveScaleAt(perspective);

    let baseSpeed = speed;
    let pts = [];
    let total = 0;
    let travelled = 0;
    let rampIn = 0;
    let rampOut = 0;
    let position = null;
    let index = 0;

    function setPath(next) {
        pts = toWaypoints(next);
        total = pathLength(pts);
        travelled = 0;
        index = 0;
        position = pts.length ? { ...pts[0] } : position;

        // A path shorter than the two ramps combined would never reach full speed, so
        // shrink them proportionally instead of letting one swallow the whole walk.
        const wanted = Math.max(0, easeIn) + Math.max(0, easeOut);
        const fit = wanted > total && wanted > 0 ? total / wanted : 1;
        rampIn = Math.max(0, easeIn) * fit;
        rampOut = Math.max(0, easeOut) * fit;
    }

    setPath(path);

    /** Fraction of the base speed at the current point, before perspective. */
    function easeFactor() {
        const a = rampIn > 0 ? ease(clamp01(travelled / rampIn)) : 1;
        const b = rampOut > 0 ? ease(clamp01((total - travelled) / rampOut)) : 1;
        const floor = clamp01(minSpeedFactor);
        return floor + (1 - floor) * Math.min(a, b);
    }

    function perspectiveFactor() {
        if (!scaleAt || !position) return 1;
        const scale = scaleAt(position) / (referenceScale || 1);
        return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    /** Unit vector along the segment the character is currently on. */
    function tangent() {
        if (pts.length < 2) return { x: 0, y: 0 };
        const i = Math.min(index, pts.length - 2);
        const d = V.sub(pts[i + 1], pts[i]);
        return V.len(d) > 0 ? V.norm(d) : { x: 0, y: 0 };
    }

    const isDone = () => total <= 0 || travelled >= total;

    function snapshot(velocity, currentSpeed) {
        return {
            position: position ? { ...position } : null,
            velocity,
            speed: currentSpeed,
            progress: total > 0 ? travelled / total : 1,
            travelled,
            done: isDone(),
            index
        };
    }

    function step(dt) {
        if (isDone() || !(dt > 0)) return snapshot({ x: 0, y: 0 }, 0);

        const currentSpeed = baseSpeed * easeFactor() * perspectiveFactor();
        travelled = Math.min(total, travelled + currentSpeed * dt);
        const at = pointAtDistance(pts, travelled);
        position = at.point;
        index = at.index;
        return snapshot(V.mul(tangent(), currentSpeed), currentSpeed);
    }

    return {
        step,
        setPath,
        setSpeed(n) {
            if (!(n > 0)) throw new Error('movement: `speed` must be positive');
            baseSpeed = n;
        },
        /** Drops the rest of the path, leaving the character where it stands. */
        stop() {
            pts = position ? [{ ...position }] : [];
            total = 0;
            travelled = 0;
            index = 0;
        },
        /** Waypoints not yet reached, for drawing the road ahead. */
        remaining() {
            return pts.slice(Math.min(index + 1, pts.length));
        },
        get position() { return position ? { ...position } : null; },
        get done() { return isDone(); },
        get progress() { return total > 0 ? travelled / total : 1; },
        get travelled() { return travelled; },
        get total() { return total; },
        get speed() { return baseSpeed; },
        get waypoints() { return pts.slice(); }
    };
}
