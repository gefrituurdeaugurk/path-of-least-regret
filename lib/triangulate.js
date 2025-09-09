import { isCCW, triArea2 } from './math.js';
export function triangulate(simplePoly) {
    const n = simplePoly.length; if (n < 3) return [];
    const verts = simplePoly.slice(); if (!isCCW(verts)) verts.reverse();
    const result = []; const Vlist = verts.slice();
    function insideTri(p, a, b, c) { const b1 = triArea2(p, a, b) < 0, b2 = triArea2(p, b, c) < 0, b3 = triArea2(p, c, a) < 0; return (b1 === b2) && (b2 === b3); }
    let guard = 0;
    while (Vlist.length > 3 && guard++ < 10000) {
        let ear = false;
        for (let i = 0; i < Vlist.length; i++) {
            const a = Vlist[(i - 1 + Vlist.length) % Vlist.length], b = Vlist[i], c = Vlist[(i + 1) % Vlist.length];
            if (triArea2(a, b, c) <= 0) continue;
            let contains = false;
            for (let j = 0; j < Vlist.length; j++) { const p = Vlist[j]; if (p === a || p === b || p === c) continue; if (insideTri(p, a, b, c)) { contains = true; break; } }
            if (contains) continue;
            result.push([a, b, c]); Vlist.splice(i, 1); ear = true; break;
        }
        if (!ear) break;
    }
    if (Vlist.length === 3) result.push([Vlist[0], Vlist[1], Vlist[2]]);
    return result;
}
