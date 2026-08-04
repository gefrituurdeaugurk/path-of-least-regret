// Character scaling by depth: the classic adventure-game trick where an actor shrinks
// as it walks "away" from the camera. A horizon is a line with a scale attached; the
// scale at any point is interpolated between the horizons that bracket it.

export const HorizonErrorCodes = {
    NO_LAYERS: 'NO_LAYERS',
    NOT_ENOUGH_HORIZONS: 'NOT_ENOUGH_HORIZONS',
    INVALID_HORIZON: 'INVALID_HORIZON',
    UNKNOWN_LAYER: 'UNKNOWN_LAYER'
};

// Mirrors the same helper in api.js; duplicated rather than imported to keep this
// module independent of the pathfinding surface.
function fail(code, errorMode, message, extra = {}) {
    if (errorMode === 'code') return { ok: false, code, ...extra };
    throw Object.assign(new Error(message), { code, ...extra });
}

const isFinitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Y of a horizon at a given x. Constant for a horizontal one, which is the common case. */
function lineY(h, x) {
    if (h.tilted) return h.a.y + (h.b.y - h.a.y) * ((x - h.a.x) / (h.b.x - h.a.x));
    return h.y;
}

function normalise(h, index, errorMode) {
    if (!h || !Number.isFinite(h.scale)) {
        return fail(HorizonErrorCodes.INVALID_HORIZON, errorMode, `Horizon ${index} needs a finite scale`, { index });
    }
    if (Number.isFinite(h.y)) return { tilted: false, y: h.y, scale: h.scale };
    if (isFinitePoint(h.a) && isFinitePoint(h.b)) {
        if (h.a.x === h.b.x) {
            return fail(
                HorizonErrorCodes.INVALID_HORIZON, errorMode,
                `Horizon ${index} is vertical, so it has no single y per x`, { index }
            );
        }
        return { tilted: true, a: { x: h.a.x, y: h.a.y }, b: { x: h.b.x, y: h.b.y }, scale: h.scale };
    }
    return fail(
        HorizonErrorCodes.INVALID_HORIZON, errorMode,
        `Horizon ${index} needs either a numeric \`y\` or two points \`a\` and \`b\``, { index }
    );
}

/**
 * Builds a scale ramp from two or more horizons.
 *
 * Horizons may be given in any order and are bracketed by their y at the sampled x, so
 * a tilted horizon behaves correctly even when it crosses another one off to the side.
 * Points beyond the outermost horizon clamp to its scale rather than extrapolating —
 * an actor that wanders past the far horizon should not shrink to nothing.
 */
export function createHorizonLayer(horizons, opts = {}) {
    const { errorMode = 'throw' } = opts;

    if (!Array.isArray(horizons) || horizons.length < 2) {
        return fail(
            HorizonErrorCodes.NOT_ENOUGH_HORIZONS, errorMode,
            'A horizon layer needs at least 2 horizons to scale between'
        );
    }

    const normalised = [];
    for (let i = 0; i < horizons.length; i++) {
        const h = normalise(horizons[i], i, errorMode);
        if (h.ok === false) return h;
        normalised.push(h);
    }

    const scales = normalised.map((h) => h.scale);
    // Horizontal horizons keep the same order and y at every x, so resolve them once
    // instead of re-sorting on every frame.
    const staticRows = normalised.every((h) => !h.tilted)
        ? normalised.map((h) => ({ y: h.y, scale: h.scale })).sort((p, q) => p.y - q.y)
        : null;

    function scaleAt(point) {
        if (!isFinitePoint(point)) return normalised[0].scale;

        const rows = staticRows ?? normalised
            .map((h) => ({ y: lineY(h, point.x), scale: h.scale }))
            .sort((p, q) => p.y - q.y);

        if (point.y <= rows[0].y) return rows[0].scale;
        const last = rows[rows.length - 1];
        if (point.y >= last.y) return last.scale;

        for (let i = 0; i < rows.length - 1; i++) {
            const lo = rows[i];
            const hi = rows[i + 1];
            if (point.y > hi.y) continue;
            const span = hi.y - lo.y;
            if (!(span > 0)) return lo.scale;
            return lo.scale + (hi.scale - lo.scale) * ((point.y - lo.y) / span);
        }
        return last.scale;
    }

    return {
        horizons: normalised,
        scaleAt,
        minScale: Math.min(...scales),
        maxScale: Math.max(...scales)
    };
}

/**
 * A named collection of layers with one active at a time.
 *
 * Scenes often need more than one ramp: walking down a staircase can put the actor on a
 * different depth plane entirely, and the switch has to be abrupt rather than blended.
 * Which layer applies is the integrator's call, so it is set explicitly with `use`.
 */
export function createHorizonSet(layers, opts = {}) {
    const { errorMode = 'throw' } = opts;
    const ids = layers ? Object.keys(layers) : [];

    if (!ids.length) {
        return fail(HorizonErrorCodes.NO_LAYERS, errorMode, 'A horizon set needs at least one layer');
    }

    const built = new Map();
    for (const id of ids) {
        const value = layers[id];
        const layer = typeof value?.scaleAt === 'function' ? value : createHorizonLayer(value, opts);
        if (layer.ok === false) return { ...layer, layer: id };
        built.set(id, layer);
    }

    let activeId = ids[0];

    function layer(id = activeId) {
        return built.get(id) ?? null;
    }

    function use(id) {
        if (!built.has(id)) {
            return fail(HorizonErrorCodes.UNKNOWN_LAYER, errorMode, `No horizon layer named "${id}"`, { layer: id });
        }
        activeId = id;
        return built.get(id);
    }

    function scaleAt(point, id = activeId) {
        const target = built.get(id);
        if (!target) {
            return fail(HorizonErrorCodes.UNKNOWN_LAYER, errorMode, `No horizon layer named "${id}"`, { layer: id });
        }
        return target.scaleAt(point);
    }

    return {
        ids,
        layer,
        use,
        scaleAt,
        get active() { return activeId; }
    };
}
