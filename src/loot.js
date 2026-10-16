import { VS } from './world.js';

export const LOOT_KINDS = {
  gold: { name: 'Gold bar', value: 1, color: 0xffc83d },
  gem: { name: 'Gem', value: 2, color: 0xff4fd8 },
  flag: { name: 'Flag', value: 3, color: 0xff3b3b },
};

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each map lists its hiding places (see level.js):
//  crates: [x, floorY, z, material] — 6×6×6 voxels with 2-voxel walls around a 2×2×2 hollow,
//          floorY being the first empty layer above the floor the crate stands on.
//  special: places sealed by the level itself; y is the layer the item rests on.
const LOOT_CRATES = 7;

/** Adds crates and pockets to an already built level and returns the hidden loot (positions in metres). */
export function placeLoot(w, seed, map) {
  const { crates: CRATES, special: SPECIAL } = map;
  const rnd = mulberry32(seed);
  const order = CRATES.map((c, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  const filled = new Set(order.slice(0, LOOT_CRATES));
  const items = [];
  const at = (x, y, z, kind, where) =>
    items.push({ id: items.length, kind, where, x: (x + 0.5) * VS, y: y * VS + 0.16, z: (z + 0.5) * VS });

  CRATES.forEach(([x, y, z, mat], i) => {
    w.fill(x, y, z, x + 6, y + 6, z + 6, mat);
    w.fill(x + 2, y + 2, z + 2, x + 4, y + 4, z + 4, 0);
    if (filled.has(i)) at(x + 2.5, y + 2, z + 2.5, rnd() < 0.7 ? 'gold' : 'gem', 'a crate');
  });
  for (const s of SPECIAL) {
    if (s.pocket) w.fill(s.x - 1, s.y, s.z - 1, s.x + 1, s.y + 2, s.z + 1, 0);
    at(s.x - (s.pocket ? 0.5 : 0), s.y, s.z - (s.pocket ? 0.5 : 0), s.kind, s.where);
  }
  return items;
}

