import { WX, WY, WZ, MAT } from './world.js';

// Structural analysis for grounded voxel structures.
//  1. Load paths: a multi-source search from the voxels resting on the ground. Moving up is free,
//     moving sideways or down costs 1. A voxel further than its material's `span` sags off.
//  2. Balance: the centre of mass must lie over the convex hull of the voxels touching the ground.
//  3. Load: total mass must not exceed the summed `strength` of those ground-contact voxels.

const SX = 1, SZ = WX, SY = WX * WZ, N = WX * WY * WZ;
const seen = new Int32Array(N);
const aux = new Int32Array(N);
const dist = new Uint8Array(N);
let stamp = 0, auxStamp = 0;
const MAX_SPAN = MAT.reduce((a, m) => (m && !m.anchor ? Math.max(a, m.span) : a), 0);
export const MAX_STRUCT = 260000;
const TOPPLE_MARGIN = 0.35; // voxels

function cellXYZ(c) {
  const x = c % WX, t = (c / WX) | 0;
  return [x, (t / WZ) | 0, t % WZ];
}

// Calls f(n, dir) for each in-bounds neighbour. dir: 0 = up, 1 = sideways, 2 = down.
function forNeighbours(c, f) {
  const x = c % WX, t = (c / WX) | 0, z = t % WZ, y = (t / WZ) | 0;
  if (y < WY - 1) f(c + SY, 0);
  if (x > 0) f(c - SX, 1);
  if (x < WX - 1) f(c + SX, 1);
  if (z > 0) f(c - SZ, 1);
  if (z < WZ - 1) f(c + SZ, 1);
  if (y > 0) f(c - SY, 2);
}

const solid = (data, c) => data[c] !== 0 && !MAT[data[c]].anchor;

function flood(data, start) {
  const list = [start], stack = [start], feet = [];
  seen[start] = stamp;
  while (stack.length) {
    const c = stack.pop();
    dist[c] = 255;
    const below = c - SY;
    if (c < SY || (data[below] && MAT[data[below]].anchor)) feet.push(c);
    forNeighbours(c, (n) => {
      if (seen[n] !== stamp && solid(data, n)) {
        seen[n] = stamp;
        stack.push(n);
        list.push(n);
      }
    });
    if (list.length > MAX_STRUCT) return null;
  }
  return { list, feet };
}

function propagateSupport(data, feet) {
  let bucket = [];
  for (const f of feet) { dist[f] = 0; bucket.push(f); }
  for (let d = 0; d <= MAX_SPAN && bucket.length; d++) {
    const next = [];
    for (let i = 0; i < bucket.length; i++) {
      const c = bucket[i];
      if (dist[c] !== d || d > MAT[data[c]].span) continue;
      forNeighbours(c, (n, dir) => {
        if (seen[n] !== stamp || !data[n]) return;
        const nd = dir === 0 ? d : d + 1;
        if (dist[n] > nd) {
          dist[n] = nd;
          (dir === 0 ? bucket : next).push(n);
        }
      });
    }
    bucket = next;
  }
}

function groupCells(cells) {
  const g = ++auxStamp, done = ++auxStamp;
  for (const c of cells) aux[c] = g;
  const groups = [];
  for (const s of cells) {
    if (aux[s] !== g) continue;
    aux[s] = done;
    const list = [s], stack = [s];
    while (stack.length) {
      forNeighbours(stack.pop(), (n) => {
        if (aux[n] === g) { aux[n] = done; stack.push(n); list.push(n); }
      });
    }
    groups.push(list);
  }
  return groups;
}

function convexHull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper); // counter-clockwise
}

/** Distance of (px, pz) outside a CCW convex polygon (<= 0 when inside). */
function outsideDistance(hull, px, pz) {
  let worst = -Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez) || 1;
    // outward normal of a CCW edge is (ez, -ex)
    worst = Math.max(worst, ((px - a[0]) * ez - (pz - a[1]) * ex) / len);
  }
  return worst;
}

/**
 * Every horizontal cut through a structure must carry everything above it: the centre of mass of
 * the part above must sit over the cells crossing the cut, and its weight must not exceed their
 * strength. Returns the lowest failing layer (or -1).
 */
function findWeakestLayer(data, list) {
  const lm = new Float64Array(WY), lx = new Float64Array(WY), lz = new Float64Array(WY);
  const sup = Array.from({ length: WY }, () => []);
  let minY = WY;
  for (const c of list) {
    const m = MAT[data[c]], x = c % WX, t = (c / WX) | 0, z = t % WZ, y = (t / WZ) | 0;
    lm[y] += m.density; lx[y] += (x + 0.5) * m.density; lz[y] += (z + 0.5) * m.density;
    if (y === 0 || data[c - SY]) sup[y].push(c);
    if (y < minY) minY = y;
  }
  let M = 0, MX = 0, MZ = 0, layer = -1, kind = '', supports = null, worstOff = -Infinity, worstLoad = 0;
  for (let y = WY - 1; y >= minY; y--) {
    M += lm[y]; MX += lx[y]; MZ += lz[y];
    const s = sup[y];
    if (!M || !s.length) continue;
    let cap = 0;
    const corners = new Map();
    for (const c of s) {
      cap += MAT[data[c]].strength;
      const x = c % WX, z = ((c / WX) | 0) % WZ;
      for (const [cx, cz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]) corners.set(cx * 4096 + cz, [cx, cz]);
    }
    const off = outsideDistance(convexHull([...corners.values()]), MX / M, MZ / M);
    const load = M / cap;
    if (off > worstOff) worstOff = off;
    if (load > worstLoad) worstLoad = load;
    if (off > TOPPLE_MARGIN) { layer = y; kind = 'topple'; supports = s; }
    else if (load > 1) { layer = y; kind = 'crush'; supports = s; }
  }
  return { layer, kind, supports, info: { off: worstOff, load: worstLoad, layer, kind } };
}

/**
 * Analyses every grounded structure touching `starts` (cell indices).
 * Returns { fall: cell lists that sag off, topple: cell lists that tip over, crush: [{ list, feet }] , info }.
 */
export function analyzeStructures(data, starts) {
  const out = { fall: [], topple: [], crush: [], info: [] };
  stamp++;
  for (const s of starts) {
    if (seen[s] === stamp || !solid(data, s)) continue;
    const comp = flood(data, s);
    if (!comp) break; // huge structure: skip this pass rather than stall a frame
    const { list, feet } = comp;
    if (!feet.length) continue;
    propagateSupport(data, feet);

    const unsupported = [];
    for (const c of list) if (dist[c] > MAT[data[c]].span) unsupported.push(c);
    const fail = findWeakestLayer(data, list);
    out.info.push({ voxels: list.length, feet: feet.length, unsupported: unsupported.length, ...fail.info });

    // A structure that tips or buckles goes down as a whole above the failing layer;
    // otherwise only unsupported overhangs sag off.
    if (fail.layer >= 0) {
      const y0 = fail.layer, above = list.filter((c) => ((c / SY) | 0) >= y0);
      if (fail.kind === 'topple') out.topple.push(above);
      else out.crush.push({ list: above, feet: fail.supports });
    } else for (const g of groupCells(unsupported)) out.fall.push(g);
  }
  return out;
}

export { cellXYZ };
