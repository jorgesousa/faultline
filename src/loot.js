import { M, VS } from './world.js';
import { G } from './level.js';

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

// Crates are 6×6×6 voxels with 2-voxel walls around a 2×2×2 hollow, so loot can't be grabbed through the wall.
// [x, floorY, z, material] — floorY is the first empty layer above the floor the crate stands on.
const CRATES = [
  // brick house: ground floor, first floor
  [44, G + 1, 29, M.planks], [40, G + 1, 46, M.planks],
  [22, G + 13, 28, M.planks], [44, G + 13, 42, M.planks],
  // concrete tower: each storey and the roof
  [87, G + 1, 28, M.concrete], [74, G + 13, 28, M.planks], [88, G + 25, 38, M.brick],
  [76, G + 37, 30, M.concrete], [75, G + 49, 41, M.brick],
  // barn
  [132, G + 1, 42, M.planks], [114, G + 1, 44, M.planks], [125, G + 1, 30, M.planks],
  // bunkers out in the open
  [8, G, 84, M.brick], [140, G, 84, M.brick], [80, G, 140, M.concrete], [20, G, 140, M.brick],
];

// Places that are sealed by the level itself. Coordinates are voxels; y is the layer the item rests on.
const SPECIAL = [
  { x: 36, y: G + 25, z: 40, kind: 'gem', where: 'house attic' },
  { x: 38.5, y: G + 27, z: 106.5, kind: 'flag', where: 'water tower tank' },
  { x: 117.5, y: G + 6, z: 111.5, kind: 'gem', where: 'inside the chimney' },
  { x: 115, y: G + 1, z: 112, kind: 'gold', where: 'chimney foundation', pocket: true },
];

const LOOT_CRATES = 7;

/** Adds crates and pockets to an already built level and returns the hidden loot (positions in metres). */
export function placeLoot(w, seed) {
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

export const CRATE_COUNT = CRATES.length;
