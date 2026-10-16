import { WX, WZ, M, MAT } from './world.js';

export const G = 4; // ground thickness in voxels (top of ground = 1 m)
const H = 12; // storey height in voxels (3 m)

function building(w, x0, z0, W, D, stories, o) {
  const x1 = x0 + W, z1 = z0 + D;
  for (let s = 0; s < stories; s++) {
    const y0 = G + s * H;
    w.fill(x0, y0, z0, x1, y0 + 1, z1, o.floor);
    w.fill(x0, y0 + 1, z0, x1, y0 + H, z0 + 1, o.wall);
    w.fill(x0, y0 + 1, z1 - 1, x1, y0 + H, z1, o.wall);
    w.fill(x0, y0 + 1, z0, x0 + 1, y0 + H, z1, o.wall);
    w.fill(x1 - 1, y0 + 1, z0, x1, y0 + H, z1, o.wall);
    const ww = o.winW ?? 3, step = ww + (o.winGap ?? 4);
    for (let x = x0 + 3; x + ww <= x1 - 3; x += step) {
      w.fill(x, y0 + 4, z0, x + ww, y0 + 9, z0 + 1, o.win);
      w.fill(x, y0 + 4, z1 - 1, x + ww, y0 + 9, z1, o.win);
    }
    for (let z = z0 + 3; o.sideWin !== false && z + ww <= z1 - 3; z += step) {
      w.fill(x0, y0 + 4, z, x0 + 1, y0 + 9, z + ww, o.win);
      w.fill(x1 - 1, y0 + 4, z, x1, y0 + 9, z + ww, o.win);
    }
    if (o.inner) {
      const mz = z0 + Math.floor(D / 2);
      w.fill(x0 + 1, y0 + 1, mz, x1 - 1, y0 + H, mz + 1, o.inner);
      const dx = x0 + Math.floor(W / 2) - 2;
      w.fill(dx, y0 + 1, mz, dx + 4, y0 + 10, mz + 1, 0);
    }
    if (o.column) {
      for (const [cx, cz] of [[x0, z0], [x1 - 2, z0], [x0, z1 - 2], [x1 - 2, z1 - 2]])
        w.fill(cx, y0, cz, cx + 2, y0 + H, cz + 2, o.column);
    }
  }
  // front door; `flip` puts the front on the z1 side
  const fz = o.flip ? z1 - 1 : z0, bz = o.flip ? z0 + 1 : z1 - 5;
  if (o.shop) {
    // big shop windows between brick piers on the ground floor
    for (let x = x0 + 2; x + 8 <= x1 - 2; x += 10) w.fill(x, G + 2, fz, x + 8, G + 10, fz + 1, M.glass);
  }
  const doorW = o.doorW ?? 4;
  const dx = x0 + Math.floor(W / 4);
  w.fill(dx, G + 1, fz, dx + doorW, G + (o.doorH ?? 10), fz + 1, 0);
  // stairs along the back wall, one flight per storey
  for (let s = 0; s < stories - 1; s++) {
    const y0 = G + s * H, xs = x0 + 2;
    w.fill(xs, y0 + H, bz, xs + 13, y0 + H + 1, bz + 4, 0);
    for (let i = 0; i < 12; i++) w.fill(xs + i, y0 + 1, bz, xs + i + 1, y0 + 2 + i, bz + 4, o.floor);
  }
  // roof
  const top = G + stories * H;
  w.fill(x0, top, z0, x1, top + 1, z1, o.floor);
  if (o.roof) {
    let k = 0;
    for (; z0 + 1 + k < z1 - 1 - k; k++) {
      const y = top + 1 + k;
      w.fill(x0 - 1, y, z0 - 1 + k, x1 + 1, y + 1, z0 + 1 + k, o.roof);
      w.fill(x0 - 1, y, z1 - 1 - k, x1 + 1, y + 1, z1 + 1 - k, o.roof);
      w.fill(x0, y, z0 + 1 + k, x0 + 1, y + 1, z1 - 1 - k, o.wall);
      w.fill(x1 - 1, y, z0 + 1 + k, x1, y + 1, z1 - 1 - k, o.wall);
    }
    w.fill(x0 - 1, top + 1 + k, z0 - 1 + k, x1 + 1, top + 2 + k, z1 + 1 - k, o.roof); // ridge cap
  } else {
    // flat roof with a parapet
    w.fill(x0, top + 1, z0, x1, top + 3, z0 + 1, o.wall);
    w.fill(x0, top + 1, z1 - 1, x1, top + 3, z1, o.wall);
    w.fill(x0, top + 1, z0, x0 + 1, top + 3, z1, o.wall);
    w.fill(x1 - 1, top + 1, z0, x1, top + 3, z1, o.wall);
  }
}

function cylinder(w, cx, cz, r, y0, y1, mat, shell) {
  for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d <= r && (!shell || d > r - shell)) w.fill(x, y0, z, x + 1, y1, z + 1, mat);
    }
}

function waterTower(w, x0, z0) {
  const S = 14, legH = 26;
  for (const [lx, lz] of [[x0, z0], [x0 + S - 2, z0], [x0, z0 + S - 2], [x0 + S - 2, z0 + S - 2]])
    w.fill(lx, G, lz, lx + 2, G + legH, lz + 2, M.wood);
  for (const y of [G + 9, G + 18]) {
    w.fill(x0 + 2, y, z0, x0 + S - 2, y + 1, z0 + 1, M.wood);
    w.fill(x0 + 2, y, z0 + S - 1, x0 + S - 2, y + 1, z0 + S, M.wood);
    w.fill(x0, y, z0 + 2, x0 + 1, y + 1, z0 + S - 2, M.wood);
    w.fill(x0 + S - 1, y, z0 + 2, x0 + S, y + 1, z0 + S - 2, M.wood);
  }
  const py = G + legH;
  w.fill(x0 - 1, py, z0 - 1, x0 + S + 1, py + 1, z0 + S + 1, M.planks);
  const cx = x0 + S / 2, cz = z0 + S / 2;
  cylinder(w, cx, cz, 7, py + 1, py + 13, M.planks, 1.5);
  for (let k = 0; k < 7; k++) cylinder(w, cx, cz, 8 - k, py + 13 + k, py + 14 + k, M.roof, 0);
}

function chimney(w, cx, cz) {
  cylinder(w, cx, cz, 6, G, G + 6, M.concrete, 0);
  cylinder(w, cx, cz, 4.5, G + 6, G + 62, M.brick, 2);
  cylinder(w, cx, cz, 5, G + 62, G + 64, M.concrete, 2);
}

function ruinWall(w, x0, z0, len) {
  w.fill(x0, G, z0, x0 + len, G + 18, z0 + 2, M.brick);
  for (let x = x0 + 4; x + 6 <= x0 + len - 3; x += 10) {
    w.fill(x, G, z0, x + 6, G + 10, z0 + 2, 0);
    for (let k = 0; k < 2; k++) w.fill(x + k, G + 10 + k, z0, x + 6 - k, G + 11 + k, z0 + 2, 0);
  }
}

// ---------- props ----------
function sphere(w, cx, cy, cz, r, mat) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let z = Math.floor(cz - r); z <= cz + r; z++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if (Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2, z + 0.5 - cz) <= r) w.fill(x, y, z, x + 1, y + 1, z + 1, mat);
}

function tree(w, x, z, h = 18, r = 6, base = G) {
  sphere(w, x + 1, base + h, z + 1, r, M.leaves);
  w.fill(x, base, z, x + 2, base + h, z + 2, M.wood);
}

// 16 × 7 voxel hatchback (4 × 1.75 m) standing on y = base
function car(w, x, z, alongX, paint, base = G) {
  const L = 16, D = 7;
  const box = (a0, y0, b0, a1, y1, b1, m) =>
    alongX ? w.fill(x + a0, y0, z + b0, x + a1, y1, z + b1, m) : w.fill(x + b0, y0, z + a0, x + b1, y1, z + a1, m);
  box(0, base + 1, 1, L, base + 5, D - 1, paint);
  box(3, base + 5, 1, L - 2, base + 8, D - 1, M.glass);
  box(4, base + 5, 2, L - 3, base + 8, D - 2, 0);
  box(3, base + 8, 1, L - 2, base + 9, D - 1, paint);
  for (const a of [2, L - 5]) for (const b of [0, D - 1]) box(a, base, b, a + 3, base + 3, b + 1, M.tyre);
  box(0, base + 3, 1, 1, base + 4, 2, M.glass); // headlights
  box(0, base + 3, D - 2, 1, base + 4, D - 1, M.glass);
}

// street lamp: pole on y = base with an arm pointing (dx, dz). Returns the lamp spot.
function streetLamp(w, x, z, dx, dz, base = G + 1) {
  w.fill(x, base, z, x + 1, base + 18, z + 1, M.metal);
  for (let i = 1; i <= 4; i++) w.fill(x + dx * i, base + 17, z + dz * i, x + dx * i + 1, base + 18, z + dz * i + 1, M.metal);
  return [x + dx * 4, base + 17, z + dz * 4];
}

function fenceX(w, x0, x1, z, base = G) {
  w.fill(x0, base, z, x1, base + 5, z + 1, M.planks);
  for (let x = x0; x < x1; x += 6) w.fill(x, base, z, x + 1, base + 6, z + 1, M.wood);
}
function fenceZ(w, x, z0, z1, base = G) {
  w.fill(x, base, z0, x + 1, base + 5, z1, M.planks);
  for (let z = z0; z < z1; z += 6) w.fill(x, base, z, x + 1, base + 6, z + 1, M.wood);
}

function shed(w, x0, z0) {
  const x1 = x0 + 12, z1 = z0 + 10;
  w.fill(x0, G, z0, x1, G + 1, z1, M.planks);
  w.fill(x0, G + 1, z0, x1, G + 9, z1, M.wood);
  w.fill(x0 + 1, G + 1, z0 + 1, x1 - 1, G + 9, z1 - 1, 0);
  w.fill(x0 + 4, G + 1, z1 - 1, x0 + 8, G + 8, z1, 0);
  w.fill(x0 - 1, G + 9, z0 - 1, x1 + 1, G + 10, z1 + 1, M.roof);
}

function bench(w, x, z, base = G + 1) {
  w.fill(x, base, z, x + 1, base + 2, z + 2, M.metal);
  w.fill(x + 7, base, z, x + 8, base + 2, z + 2, M.metal);
  w.fill(x, base + 2, z, x + 8, base + 3, z + 2, M.planks);
  w.fill(x, base + 3, z + 1, x + 8, base + 5, z + 2, M.planks);
}

// stone church with a pitched roof (ridge along z) and a bell tower beside the front
function church(w, x0, z0, W, D) {
  const x1 = x0 + W, z1 = z0 + D, top = G + 22;
  w.fill(x0, G, z0, x1, G + 1, z1, M.stone);
  w.fill(x0, G + 1, z0, x1, top, z1, M.stone);
  w.fill(x0 + 1, G + 1, z0 + 1, x1 - 1, top, z1 - 1, 0);
  for (let z = z0 + 5; z + 2 <= z1 - 4; z += 7) {
    w.fill(x0, G + 6, z, x0 + 1, G + 17, z + 2, M.glass);
    w.fill(x1 - 1, G + 6, z, x1, G + 17, z + 2, M.glass);
  }
  const cx = x0 + W / 2;
  for (const fz of [z0, z1 - 1])
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++)
      if (x * x + y * y <= 10) w.fill(cx + x, G + 17 + y, fz, cx + x + 1, G + 18 + y, fz + 1, M.glass);
  w.fill(cx - 3, G + 1, z0, cx + 3, G + 12, z0 + 1, 0);
  for (let z = z0 + 6; z < z1 - 10; z += 4) {
    w.fill(x0 + 3, G + 1, z, x0 + W / 2 - 3, G + 3, z + 1, M.planks);
    w.fill(cx + 3, G + 1, z, x1 - 3, G + 3, z + 1, M.planks);
  }
  w.fill(cx - 5, G + 1, z1 - 7, cx + 5, G + 5, z1 - 4, M.stone); // altar
  let k = 0;
  for (; x0 + 1 + k < x1 - 1 - k; k++) {
    const y = top + k;
    w.fill(x0 - 1 + k, y, z0 - 1, x0 + 1 + k, y + 1, z1 + 1, M.roof);
    w.fill(x1 - 1 - k, y, z0 - 1, x1 + 1 - k, y + 1, z1 + 1, M.roof);
    w.fill(x0 + 1 + k, y, z0, x1 - 1 - k, y + 1, z0 + 1, M.stone);
    w.fill(x0 + 1 + k, y, z1 - 1, x1 - 1 - k, y + 1, z1, M.stone);
  }
  w.fill(x0 - 1 + k, top + k, z0 - 1, x1 + 1 - k, top + k + 1, z1 + 1, M.roof);

  // bell tower: shares the nave's side wall
  const tx0 = x1 - 1, tx1 = tx0 + 12, tz1 = z0 + 12;
  w.fill(tx0, G, z0, tx1, G + 44, tz1, M.stone);
  w.fill(tx0 + 1, G + 1, z0 + 1, tx1 - 1, G + 44, tz1 - 1, 0);
  w.fill(tx0 + 4, G + 1, z0, tx0 + 8, G + 10, z0 + 1, 0);
  for (const y of [G + 20, G + 32]) w.fill(tx0 + 1, y, z0 + 1, tx1 - 1, y + 1, tz1 - 1, y > G + 25 ? M.stone : M.wood);
  for (let i = 0; i < 2; i++) {
    const a = tx0 + 3 + i * 4;
    w.fill(a, G + 34, z0, a + 2, G + 41, z0 + 1, 0);
    w.fill(a, G + 34, tz1 - 1, a + 2, G + 41, tz1, 0);
    const b = z0 + 3 + i * 4;
    w.fill(tx0, G + 34, b, tx0 + 1, G + 41, b + 2, 0);
    w.fill(tx1 - 1, G + 34, b, tx1, G + 41, b + 2, 0);
  }
  for (let r = 0; tx0 - 1 + r < tx1 + 1 - r; r++) w.fill(tx0 - 1 + r, G + 44 + r, z0 - 1 + r, tx1 + 1 - r, G + 45 + r, tz1 + 1 - r, M.roof);
  // the bell
  w.fill(tx0 + 5, G + 42, z0 + 5, tx0 + 7, G + 44, z0 + 7, M.metal);
  w.fill(tx0 + 4, G + 37, z0 + 4, tx0 + 8, G + 42, z0 + 8, M.metal);
  w.fill(tx0 + 5, G + 37, z0 + 5, tx0 + 7, G + 41, z0 + 7, 0);
}

function chimneyStack(w, x, z, y0, y1) {
  w.fill(x, y0, z, x + 6, y1, z + 6, M.brick);
  w.fill(x + 2, y1 - 2, z + 2, x + 4, y1, z + 4, 0);
}

// lets a layout written for a smaller plot sit anywhere in the world
const shifted = (w, ox, oz) => ({ fill: (x0, y0, z0, x1, y1, z1, m) => w.fill(x0 + ox, y0, z0 + oz, x1 + ox, y1, z1 + oz, m) });
const off = (list, o) => list.map(([x, y, z, ...r]) => [x + o, y, z + o, ...r]);

// ---------- map: farm (the original level) ----------
const FO = 48;
function buildFarm(world) {
  world.fill(0, 0, 0, WX, G, WZ, M.ground);
  world.fill(0, G - 1, 66 + FO, WX, G, 78 + FO, M.asphalt);
  const w = shifted(world, FO, FO);

  const house = { wall: M.brick, floor: M.wood, inner: M.plaster, win: M.glass, roof: M.roof };
  building(w, 20, 26, 32, 28, 2, house);

  const tower = { wall: M.concrete, floor: M.concrete, win: M.glass, column: M.metal, winW: 5, winGap: 2 };
  building(w, 72, 26, 24, 24, 4, tower);

  // footbridge between the house and the tower on the first floor
  const by = G + 12;
  w.fill(52, by, 38, 72, by + 1, 44, M.concrete);
  w.fill(52, by + 1, 38, 72, by + 5, 39, M.metal);
  w.fill(52, by + 1, 43, 72, by + 5, 44, M.metal);
  w.fill(52, by + 1, 39, 72, by + 5, 43, 0);
  w.fill(51, by + 1, 39, 52, by + 10, 43, 0);
  w.fill(72, by + 1, 39, 73, by + 10, 43, 0);

  const barn = { wall: M.wood, floor: M.planks, win: M.glass, roof: M.roof, doorW: 10, doorH: 11, winW: 2, winGap: 8 };
  building(w, 112, 26, 30, 26, 1, barn);

  waterTower(w, 32, 100);
  chimney(w, 118, 112);
  ruinWall(w, 62, 120, 40);

  for (const [x, z] of [[14, 20], [30, 14], [6, 230], [40, 240], [200, 16], [236, 40], [240, 220], [206, 244], [10, 90], [244, 150]])
    tree(world, x, z, 16 + (x % 5), 6);
  fenceX(world, 2, 46, 4);
  fenceZ(world, 4, 4, 100);
}

// ---------- map: riverside town ----------
const R = { road: [78, 106], river: [158, 196], side: [98, 126] };
function buildRiverside(w) {
  w.fill(0, 0, 0, WX, G, WZ, M.ground);
  // main street with raised pavements
  w.fill(0, G - 1, R.road[0], WX, G, R.road[1], M.asphalt);
  for (let x = 4; x < WX; x += 16) w.fill(x, G - 1, 91, x + 8, G, 93, M.pavement);
  w.fill(0, G, 70, WX, G + 1, R.road[0], M.pavement);
  w.fill(0, G, R.road[1], WX, G + 1, 114, M.pavement);
  // side street to the bridge, with pavements
  w.fill(R.side[0], G - 1, R.road[1], R.side[1], G, WZ, M.asphalt);
  w.fill(R.side[0], G, R.road[1], R.side[1], G + 1, 114, 0);
  w.fill(92, G, 114, 98, G + 1, WZ, M.pavement);
  w.fill(126, G, 114, 132, G + 1, WZ, M.pavement);
  // promenades and the river with stepped stone banks
  w.fill(0, G, 150, WX, G + 1, R.river[0], M.pavement);
  w.fill(0, G, R.river[1], WX, G + 1, 204, M.pavement);
  w.fill(R.side[0], G, 150, R.side[1], G + 1, 204, 0);
  w.fill(0, 1, R.river[0], WX, G + 1, R.river[1], 0);
  for (let k = 0; k < 4; k++) {
    w.fill(0, 0, R.river[0] + k, WX, G - k, R.river[0] + k + 1, M.pavement);
    w.fill(0, 0, R.river[1] - 1 - k, WX, G - k, R.river[1] - k, M.pavement);
  }
  // railings along the promenade, with gaps to reach the water steps
  for (const z of [156, 197]) {
    for (let x = 0; x < WX; x += 1) {
      if ((x >= 28 && x < 40) || (x >= 88 && x < 136) || (x >= 160 && x < 172) || (z > 160 && ((x >= 196 && x < 212) || (x >= 56 && x < 92)))) continue;
      if (x % 6 === 0) w.fill(x, G + 1, z, x + 1, G + 5, z + 1, M.metal);
      w.fill(x, G + 4, z, x + 1, G + 5, z + 1, M.metal);
    }
  }
  // stone bridge on three piers
  w.fill(R.side[0], G - 1, R.river[0], R.side[1], G, R.river[1], M.concrete);
  for (const z of [168, 178, 188]) w.fill(R.side[0] + 2, 1, z, R.side[1] - 2, G - 1, z + 2, M.concrete);
  for (const x of [R.side[0] - 2, R.side[1]]) {
    w.fill(x, G, 156, x + 2, G + 4, 198, M.stone);
    w.fill(x, G - 1, 158, x + 2, G, 196, M.concrete);
  }

  // north side: terraced houses with back gardens
  const facades = [M.brick, M.render, M.render2, M.brick, M.render3];
  facades.forEach((wall, i) => {
    const x0 = 16 + 28 * i;
    building(w, x0, 40, 29, 30, 2, { wall, floor: M.wood, inner: M.plaster, win: M.glass, roof: M.roof, flip: true, sideWin: false });
    w.fill(x0 + 7, G, 70, x0 + 11, G + 1, 71, M.pavement);
    fenceZ(w, x0, 9, 40);
  });
  chimneyStack(w, 74, 52, G + 24, G + 43);
  fenceZ(w, 156, 9, 40);
  fenceX(w, 16, 157, 8);
  shed(w, 50, 14);
  shed(w, 106, 14);
  tree(w, 86, 20, 18, 6);
  tree(w, 138, 18, 15, 5);
  tree(w, 24, 18, 14, 5);
  // corner shop with a flat above
  building(w, 172, 44, 56, 26, 2, { wall: M.render2, floor: M.concrete, inner: M.plaster, win: M.glass, flip: true, shop: true, doorW: 6 });
  w.fill(172, G + 11, 70, 228, G + 12, 74, M.paint); // awning
  tree(w, 236, 24, 17, 6);
  tree(w, 160, 20, 16, 5);

  // south side: church, car park, pub, café
  church(w, 20, 116, 28, 34);
  w.fill(62, G - 1, 114, 92, G, 150, M.asphalt);
  car(w, 66, 124, false, M.paint);
  car(w, 80, 130, false, M.paint2);
  building(w, 136, 116, 60, 32, 2, { wall: M.brick, floor: M.wood, inner: M.plaster, win: M.glass, roof: M.roof, doorW: 6 });
  building(w, 204, 118, 32, 28, 1, { wall: M.render3, floor: M.concrete, win: M.glass, shop: true, doorW: 6 });
  w.fill(204, G + 11, 114, 236, G + 12, 118, M.paint2);
  bench(w, 212, 108, G + 1);
  // parked cars along the kerb
  car(w, 20, 79, true, M.paint2);
  car(w, 150, 79, true, M.paint);
  car(w, 180, 98, true, M.paint2);

  // across the river: boathouse on stilts, fishing pier, a house and the park
  building(w, 60, 184, 28, 28, 1, { wall: M.wood, floor: M.planks, win: M.glass, roof: M.roof, doorW: 12, doorH: 10, winW: 2, winGap: 6, flip: true });
  for (const z of [184, 190]) for (const x of [60, 67, 74, 81, 86]) w.fill(x, 1, z, x + 2, G, z + 2, M.wood);
  w.fill(200, G, 166, 207, G + 1, R.river[1], M.planks);
  for (const z of [166, 174, 182, 189]) for (const x of [200, 205]) w.fill(x, 1, z, x + 2, G, z + 2, M.wood);
  building(w, 12, 212, 32, 28, 2, { wall: M.render3, floor: M.wood, inner: M.plaster, win: M.glass, roof: M.roof });
  fenceX(w, 10, 46, 244);
  for (const [x, z, h] of [[150, 214, 18], [236, 214, 16], [150, 244, 15], [236, 246, 19], [208, 238, 14], [56, 236, 17]]) tree(w, x, z, h, 6);
  w.fill(180, G, 224, 188, G + 6, 232, M.stone); // statue plinth
  w.fill(182, G + 6, 226, 186, G + 9, 230, M.metal);
  w.fill(183, G + 9, 227, 185, G + 18, 229, M.metal);
  w.fill(181, G + 14, 227, 187, G + 15, 229, M.metal);
  bench(w, 170, 210, G);
  bench(w, 194, 210, G);
}

const RIVERSIDE_LAMPS = [
  [40, G + 18, 76], [120, G + 18, 76], [80, G + 18, 108], [180, G + 18, 108],
  [60, G + 18, 156], [170, G + 18, 156], [103, G + 17, 177], [150, G + 18, 202],
  [166, G + 12, 124], [196, G + 12, 56],
];
function riversideLamps(w) {
  streetLamp(w, 40, 72, 0, 1); streetLamp(w, 120, 72, 0, 1);
  streetLamp(w, 80, 112, 0, -1); streetLamp(w, 180, 112, 0, -1);
  streetLamp(w, 60, 152, 0, 1); streetLamp(w, 170, 152, 0, 1);
  streetLamp(w, 99, 177, 1, 0, G); streetLamp(w, 150, 198, 0, 1);
}

export const MAPS = [
  {
    id: 'riverside', name: '🏘️ Riverside town',
    desc: 'Terraced houses, a church, a pub and a stone bridge over the river.',
    build: (w) => { buildRiverside(w); riversideLamps(w); },
    spawn: { x: 6, z: 92, yaw: -Math.PI / 2 },
    lamps: RIVERSIDE_LAMPS,
    water: [{ z0: R.river[0], z1: R.river[1], y: 3 }],
    backdrop: { style: 'town', roads: [R.road], rivers: [R.river], sideRoads: [R.side] },
    crates: [
      [34, G + 1, 60, M.planks], [62, G + 13, 47, M.planks], [90, G + 1, 60, M.planks], [118, G + 13, 60, M.planks], [146, G + 1, 47, M.planks],
      [53, G + 1, 16, M.planks], [109, G + 1, 16, M.planks],
      [212, G + 1, 47, M.paint2], [190, G + 13, 60, M.planks],
      [22, G + 1, 141, M.planks], [50, G + 1, 119, M.stone],
      [64, G, 143, M.paint2],
      [180, G + 1, 120, M.planks], [170, G + 13, 136, M.brick], [226, G + 1, 136, M.planks],
      [78, G + 1, 202, M.planks],
      [34, G + 1, 216, M.planks], [32, G + 13, 228, M.planks],
      [220, G, 226, M.brick],
    ],
    special: [
      { x: 53, y: G + 33, z: 122, kind: 'flag', where: 'church bell tower' },
      { x: 70, y: G + 2, z: 137, kind: 'gem', where: 'boot of the red car', pocket: true },
      { x: 184, y: G + 2, z: 228, kind: 'gold', where: 'statue plinth', pocket: true },
      { x: 77, y: G + 30, z: 55, kind: 'gem', where: 'chimney stack', pocket: true },
    ],
  },
  {
    id: 'farm', name: '🚜 Old farm',
    desc: 'The original sandbox: a brick house, a concrete tower, a barn and a water tower.',
    build: buildFarm,
    spawn: { x: 62 + FO, z: 6 + FO, yaw: Math.PI },
    lamps: off([[36, G + 12, 33], [36, G + 12, 47], [36, G + 24, 33], [36, G + 24, 47],
      [84, G + 12, 38], [84, G + 24, 38], [84, G + 36, 38], [84, G + 48, 38], [120, G + 12, 39], [134, G + 12, 39]], FO),
    water: [],
    backdrop: { style: 'rural', roads: [[66 + FO, 78 + FO]] },
    crates: off([
      [44, G + 1, 29, M.planks], [40, G + 1, 46, M.planks],
      [22, G + 13, 28, M.planks], [44, G + 13, 42, M.planks],
      [87, G + 1, 28, M.concrete], [74, G + 13, 28, M.planks], [88, G + 25, 38, M.brick],
      [76, G + 37, 30, M.concrete], [75, G + 49, 41, M.brick],
      [132, G + 1, 42, M.planks], [114, G + 1, 44, M.planks], [125, G + 1, 30, M.planks],
      [8, G, 84, M.brick], [140, G, 84, M.brick], [80, G, 140, M.concrete], [20, G, 140, M.brick],
    ], FO),
    special: [
      { x: 36, y: G + 25, z: 40, kind: 'gem', where: 'house attic' },
      { x: 38.5, y: G + 27, z: 106.5, kind: 'flag', where: 'water tower tank' },
      { x: 117.5, y: G + 6, z: 111.5, kind: 'gem', where: 'inside the chimney' },
      { x: 115, y: G + 1, z: 112, kind: 'gold', where: 'chimney foundation', pocket: true },
    ].map((s) => ({ ...s, x: s.x + FO, z: s.z + FO })),
  },
];

export function buildLevel(w, map) {
  w.data.fill(0);
  map.build(w);
}

export function countDestructible(w) {
  let n = 0;
  for (let i = 0; i < w.data.length; i++) {
    const m = w.data[i];
    if (m && !MAT[m].anchor) n++;
  }
  return n;
}
