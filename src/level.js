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
    for (let z = z0 + 3; z + ww <= z1 - 3; z += step) {
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
  // front door
  const doorW = o.doorW ?? 4;
  const dx = x0 + Math.floor(W / 4);
  w.fill(dx, G + 1, z0, dx + doorW, G + (o.doorH ?? 10), z0 + 1, 0);
  // stairs along the back wall, one flight per storey
  for (let s = 0; s < stories - 1; s++) {
    const y0 = G + s * H, xs = x0 + 2;
    w.fill(xs, y0 + H, z1 - 5, xs + 13, y0 + H + 1, z1 - 1, 0);
    for (let i = 0; i < 12; i++) w.fill(xs + i, y0 + 1, z1 - 5, xs + i + 1, y0 + 2 + i, z1 - 1, o.floor);
  }
  // roof
  const top = G + stories * H;
  w.fill(x0, top, z0, x1, top + 1, z1, o.floor);
  if (o.roof) {
    for (let k = 0; z0 + 1 + k < z1 - 1 - k; k++) {
      const y = top + 1 + k;
      w.fill(x0 - 1, y, z0 - 1 + k, x1 + 1, y + 1, z0 + 1 + k, o.roof);
      w.fill(x0 - 1, y, z1 - 1 - k, x1 + 1, y + 1, z1 + 1 - k, o.roof);
      w.fill(x0, y, z0 + 1 + k, x0 + 1, y + 1, z1 - 1 - k, o.wall);
      w.fill(x1 - 1, y, z0 + 1 + k, x1, y + 1, z1 - 1 - k, o.wall);
    }
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

export function buildLevel(w) {
  w.data.fill(0);
  w.fill(0, 0, 0, WX, G, WZ, M.ground);
  w.fill(0, G - 1, 66, WX, G, 78, M.asphalt);

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
}

export function countDestructible(w) {
  let n = 0;
  for (let i = 0; i < w.data.length; i++) {
    const m = w.data[i];
    if (m && !MAT[m].anchor) n++;
  }
  return n;
}
