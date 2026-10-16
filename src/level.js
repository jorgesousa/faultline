import { WX, WZ, M, MAT } from './world.js';

export const G = 4; // ground thickness in voxels (top of ground = 1 m)
const H = 12; // storey height in voxels (3 m)

// stone dressings on brick, painted trim on render
const TRIM_FOR = () => ({ [M.brick]: M.stone, [M.darkbrick]: M.stone, [M.stone]: M.stone, [M.concrete]: M.concrete });

/**
 * A building with floors, stairs, windows and a pitched or flat roof, plus facade detail:
 * window sills and lintels, string courses, a plinth, quoins, a door surround with a hood,
 * gutters and downpipes, and optional bay window, dormers, window boxes and an open door.
 * Options: wall, floor, win, roof, inner, column, flip (front on z1), sideWin, shop, doorW, doorH, doorX,
 * winW, winH, winGap, winFront / winBack (offsets, or one list per storey), trim, plinth, groundMat,
 * bay {u, w, d}, dormers [u], flowers, doorLeaf (material), pipeU, plain (no dressings).
 */
function building(w, x0, z0, W, D, stories, o) {
  const x1 = x0 + W, z1 = z0 + D, top = G + stories * H;
  const dress = !o.plain;
  const trim = o.trim ?? TRIM_FOR()[o.wall] ?? M.trim;
  // fill relative to a face: u runs along it, d is the distance outward from the wall plane (0 = the wall)
  const ff = (f, u0, u1, y0, y1, d0, d1, m) => {
    if (f === 'z0') w.fill(u0, y0, z0 - d1 + 1, u1, y1, z0 - d0 + 1, m);
    else if (f === 'z1') w.fill(u0, y0, z1 - 1 + d0, u1, y1, z1 - 1 + d1, m);
    else if (f === 'x0') w.fill(x0 - d1 + 1, y0, u0, x0 - d0 + 1, y1, u1, m);
    else w.fill(x1 - 1 + d0, y0, u0, x1 - 1 + d1, y1, u1, m);
  };
  const front = o.flip ? 'z1' : 'z0', back = o.flip ? 'z0' : 'z1';
  const detached = o.sideWin !== false;
  const faces = detached ? [front, back, 'x0', 'x1'] : [front, back];
  const lo = (f) => (f[0] === 'z' ? x0 : z0), hi = (f) => (f[0] === 'z' ? x1 : z1);
  const ext = detached ? 1 : 0; // bands wrap round the corners of detached buildings
  const ww = o.winW ?? 3, wh = o.winH ?? 5, gap = o.winGap ?? 4;
  const doorW = o.doorW ?? 4, doorH = o.doorH ?? 10;
  const dx = x0 + (o.doorX ?? Math.floor(W / 4));
  const winList = (f, s) => {
    const spec = f === front ? o.winFront : f === back ? o.winBack : null;
    if (spec) return (Array.isArray(spec[0]) ? spec[s] ?? spec[spec.length - 1] : spec).map((u) => lo(f) + u);
    if (f[0] === 'x' && !detached) return [];
    const r = [];
    for (let u = lo(f) + 3; u + ww <= hi(f) - 3; u += ww + gap) {
      if (f === front && s === 0 && (o.shop || (u < dx + doorW + 1 && u + ww > dx - 1))) continue;
      r.push(u);
    }
    return r;
  };

  for (let s = 0; s < stories; s++) {
    const y0 = G + s * H;
    w.fill(x0, y0, z0, x1, y0 + 1, z1, o.floor);
    w.fill(x0, y0 + 1, z0, x1, y0 + H, z0 + 1, o.wall);
    w.fill(x0, y0 + 1, z1 - 1, x1, y0 + H, z1, o.wall);
    w.fill(x0, y0 + 1, z0, x0 + 1, y0 + H, z1, o.wall);
    w.fill(x1 - 1, y0 + 1, z0, x1, y0 + H, z1, o.wall);
    if (s === 0 && o.groundMat) ff(front, x0, x1, G + 1, G + H, 0, 1, o.groundMat);
    for (const f of faces) for (const u of winList(f, s)) ff(f, u, u + ww, y0 + 4, y0 + 4 + wh, 0, 1, o.win);
    if (o.inner) {
      const mz = z0 + Math.floor(D / 2);
      w.fill(x0 + 1, y0 + 1, mz, x1 - 1, y0 + H, mz + 1, o.inner);
      const ix = x0 + Math.floor(W / 2) - 2;
      w.fill(ix, y0 + 1, mz, ix + 4, y0 + 10, mz + 1, 0);
    }
    if (o.column) {
      for (const [cx, cz] of [[x0, z0], [x1 - 2, z0], [x0, z1 - 2], [x1 - 2, z1 - 2]])
        w.fill(cx, y0, cz, cx + 2, y0 + H, cz + 2, o.column);
    }
  }
  const fz = o.flip ? z1 - 1 : z0, bz = o.flip ? z0 + 1 : z1 - 5;
  const shopTop = o.shopTop ?? G + 10;
  if (o.shop) {
    // big shop windows between piers on the ground floor
    for (let x = x0 + 2; x + 8 <= x1 - 2; x += 10) {
      w.fill(x, G + 2, fz, x + 8, shopTop, fz + 1, M.glass);
      if (dress && x + 10 <= x1 - 2) ff(front, x + 8, x + 10, G + 1, shopTop, 1, 2, trim);
    }
  }

  if (dress) {
    for (const f of faces) {
      const a = lo(f) - ext, b = hi(f) + ext;
      ff(f, a, b, G, G + 2, 1, 2, o.plinth ?? (o.wall === M.brick ? M.darkbrick : M.stone));
      for (let s = 1; s < stories; s++) ff(f, a, b, G + s * H, G + s * H + 1, 1, 2, trim);
      for (let s = 0; s < stories; s++) {
        const y0 = G + s * H;
        for (const u of winList(f, s)) {
          ff(f, u - 1, u + ww + 1, y0 + 3, y0 + 4, 1, 2, trim); // sill
          ff(f, u - 1, u + ww + 1, y0 + 4 + wh, y0 + 5 + wh, 0, 1, trim); // lintel
          if (o.flowers && s > 0 && f === front) ff(f, u, u + ww, y0 + 4, y0 + 5, 1, 2, M.flower);
        }
      }
    }
    // quoins: alternating long and short blocks up the corners
    if (detached && o.wall !== M.stone && o.wall !== M.concrete && o.wall !== M.wood) {
      for (let y = G + 2, i = 0; y < top; y += 2, i++) {
        const l = i % 2 ? 2 : 3, sh = i % 2 ? 3 : 2;
        for (const f of ['z0', 'z1']) { ff(f, x0, x0 + l, y, y + 2, 0, 1, trim); ff(f, x1 - l, x1, y, y + 2, 0, 1, trim); }
        for (const f of ['x0', 'x1']) { ff(f, z0, z0 + sh, y, y + 2, 0, 1, trim); ff(f, z1 - sh, z1, y, y + 2, 0, 1, trim); }
      }
    }
    // door surround and hood
    if (!o.shop) {
      ff(front, dx - 1, dx + doorW + 1, G + 1, G + doorH + 1, 0, 1, trim);
      if (doorH + 2 < H) ff(front, dx - 2, dx + doorW + 2, G + doorH + 1, G + doorH + 2, 1, 3, trim);
    }
  }
  // front door: a step in the plinth, and optionally an open door leaf swung inside
  w.fill(dx, G + 1, fz, dx + doorW, G + doorH + 1 - (dress && !o.shop ? 1 : 0), fz + 1, 0);
  if (dress) ff(front, dx, dx + doorW, G + 1, G + 2, 1, 2, 0);
  if (o.doorLeaf) ff(front, dx + doorW - 1, dx + doorW, G + 1, G + doorH, -4, 0, o.doorLeaf);

  // bay window on the ground floor front
  if (o.bay) {
    const b0 = x0 + o.bay.u, b1 = b0 + o.bay.w, bd = o.bay.d ?? 3;
    ff(front, b0, b1, G, G + 1, 1, bd + 1, o.floor);
    ff(front, b0, b1, G + 1, G + 3, 1, bd + 1, o.wall);
    ff(front, b0, b1, G + 3, G + 4, 1, bd + 2, trim);
    ff(front, b0, b1, G + 4, G + 10, 1, bd + 1, M.pane);
    ff(front, b0 + 1, b1 - 1, G + 1, G + 10, 1, bd, 0);
    ff(front, b0 + 1, b1 - 1, G + 1, G + 10, 0, 1, 0);
    for (const u of [b0, b1 - 1]) ff(front, u, u + 1, G + 4, G + 10, bd, bd + 1, trim);
    ff(front, b0 - 1, b1 + 1, G + 10, G + 11, 1, bd + 2, trim);
    ff(front, b0, b1, G + 11, G + 12, 1, bd + 1, o.roof ?? o.wall);
  }

  // stairs along the back wall, one flight per storey
  for (let s = 0; s < stories - 1; s++) {
    const y0 = G + s * H, xs = x0 + 2;
    w.fill(xs, y0 + H, bz, xs + 13, y0 + H + 1, bz + 4, 0);
    for (let i = 0; i < 12; i++) w.fill(xs + i, y0 + 1, bz, xs + i + 1, y0 + 2 + i, bz + 4, o.floor);
  }
  // roof
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
    if (dress) {
      for (const f of ['z0', 'z1']) {
        ff(f, x0 - 1, x1 + 1, top, top + 1, 1, 2, M.metal); // gutter under the eaves
        const pu = x0 + (o.pipeU ?? W - 2);
        ff(f, pu, pu + 1, G + 2, top, 1, 2, M.metal); // downpipe
      }
      // dormer windows on the front slope
      for (const du of o.dormers ?? []) {
        const a = x0 + du, DW = 7;
        ff(front, a, a + DW, top + 1, top + 10, -8, -2, o.wall);
        ff(front, a + 1, a + DW - 1, top + 1, top + 10, -8, -3, 0);
        ff(front, a + 2, a + DW - 2, top + 5, top + 9, -3, -2, M.pane);
        ff(front, a + 1, a + DW - 1, top + 4, top + 5, -2, -1, trim);
        ff(front, a - 1, a + DW + 1, top + 10, top + 11, -9, -1, o.roof);
      }
    }
  } else {
    // flat roof with a parapet, a cornice and coping
    w.fill(x0, top + 1, z0, x1, top + 3, z0 + 1, o.wall);
    w.fill(x0, top + 1, z1 - 1, x1, top + 3, z1, o.wall);
    w.fill(x0, top + 1, z0, x0 + 1, top + 3, z1, o.wall);
    w.fill(x1 - 1, top + 1, z0, x1, top + 3, z1, o.wall);
    if (dress) for (const f of ['z0', 'z1', 'x0', 'x1']) {
      ff(f, lo(f) - 1, hi(f) + 1, top, top + 1, 1, 2, trim);
      ff(f, lo(f) - 1, hi(f) + 1, top + 3, top + 4, -1, 2, trim);
    }
  }
}

// 3×5 block letters for shop and pub signs
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'], L: ['#..', '#..', '#..', '#..', '###'],
  O: ['###', '#.#', '#.#', '#.#', '###'], P: ['###', '#.#', '###', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  ' ': ['...', '...', '...', '...', '...'],
};
// sign board on a wall facing ±z (wall plane at z = zw, out = -1 or +1), 7 rows from y, raised letters centred
function signBoard(w, xa, xb, y, zw, out, text, bg, fg) {
  const zb = zw + out, zl = zw + 2 * out;
  w.fill(xa, y, zb, xb, y + 7, zb + 1, bg);
  const len = text.length * 4 - 1;
  let x = Math.floor((xa + xb - len) / 2);
  for (const ch of text) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r][c] !== '#') continue;
      // a viewer facing a -z sign looks along +z, so +x is on their left: mirror it
      const gx = out > 0 ? x + c : xa + xb - 1 - (x + c);
      w.set(gx, y + 5 - r, zl, fg);
    }
    x += 4;
  }
}
// striped canvas awning along x, attached under a sign
function awning(w, xa, xb, y, zw, out, depth, m1, m2) {
  for (let x = xa; x < xb; x++) {
    const m = Math.floor((x - xa) / 2) % 2 ? m2 : m1;
    for (let d = 1; d <= depth; d++) w.set(x, y, zw + d * out, m);
    w.set(x, y - 1, zw + depth * out, m);
  }
}
// chimney stack straddling a party wall, with pots
function roofChimney(w, x, z, y0, y1) {
  w.fill(x - 2, y0, z - 2, x + 2, y1, z + 2, M.brick);
  w.fill(x - 3, y1 - 1, z - 3, x + 3, y1, z + 3, M.stone);
  for (const px of [x - 1, x + 1]) {
    w.fill(px - 1, y1, z - 1, px, y1 + 3, z, M.roof);
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

// vehicle builder: a is along the length (0 = front), b across, y up; mirrored when alongX is false
const vbox = (w, x, z, alongX) => (a0, y0, b0, a1, y1, b1, m) =>
  alongX ? w.fill(x + a0, y0, z + b0, x + a1, y1, z + b1, m) : w.fill(x + b0, y0, z + a0, x + b1, y1, z + a1, m);
function wheels(box, base, D, at) {
  for (const a of at) for (const b of [0, D - 1]) {
    box(a, base, b, a + 3, base + 3, b + 1, M.tyre);
    box(a + 1, base + 1, b, a + 2, base + 2, b + 1, M.metal); // hub
  }
}

// 16 × 7 voxel hatchback (4 × 1.75 m) standing on y = base: wheel arches, sloped windscreen, lights, mirrors, seats
function car(w, x, z, alongX, paint, base = G) {
  const L = 16, D = 7, box = vbox(w, x, z, alongX);
  box(0, base + 1, 0, L, base + 4, D, paint); // lower body
  for (const a of [0, L - 1]) for (const b of [0, D - 1]) box(a, base + 1, b, a + 1, base + 4, b + 1, 0); // rounded corners
  box(0, base + 3, 0, 1, base + 4, D, 0); // nose slopes down to the bumper
  box(0, base + 1, 1, 1, base + 2, D - 1, M.tyre); // bumpers
  box(L - 1, base + 1, 1, L, base + 2, D - 1, M.tyre);
  box(0, base + 2, 2, 1, base + 3, D - 2, M.metal); // grille
  for (const b of [1, D - 2]) {
    box(0, base + 2, b, 1, base + 3, b + 1, M.headlamp);
    box(L - 1, base + 3, b, L, base + 4, b + 1, M.taillamp);
  }
  box(L - 1, base + 2, 2, L, base + 3, D - 2, M.plate);
  for (const b of [0, D - 1]) box(1, base + 1, b, L - 1, base + 2, b + 1, 0); // tucked-in sills
  box(1, base + 1, 1, L - 1, base + 2, 2, M.tyre);
  box(1, base + 1, D - 2, L - 1, base + 2, D - 1, M.tyre);
  box(5, base + 2, 1, L - 2, base + 4, D - 1, 0); // cabin
  box(5, base + 3, 1, 6, base + 4, D - 1, M.tyre); // dashboard
  for (const [a0, a1] of [[8, 10], [11, 13]]) {
    box(a0, base + 2, 2, a1, base + 3, D - 2, M.tyre); // seats
    box(a1 - 1, base + 3, 2, a1, base + 5, D - 2, M.tyre);
  }
  // glasshouse set in one voxel from the shoulders: raked windscreen, side windows with pillars, roof
  box(4, base + 4, 1, L - 1, base + 6, D - 1, M.glass);
  box(5, base + 4, 2, L - 2, base + 6, D - 2, 0);
  box(4, base + 5, 1, 5, base + 6, D - 1, 0);
  box(5, base + 5, 2, 6, base + 6, D - 2, M.glass);
  for (const a of [4, 9, L - 2]) for (const b of [1, D - 2]) box(a, base + 4, b, a + 1, base + 6 - (a === 4 ? 1 : 0), b + 1, paint);
  box(5, base + 6, 1, L - 1, base + 7, D - 1, paint); // roof
  for (const b of [0, D - 1]) box(5, base + 4, b, 6, base + 5, b + 1, paint); // mirrors on the shoulders
  wheels(box, base, D, [2, L - 5]);
}

// 20 × 8 voxel delivery van (5 × 2 m): cab with a raked windscreen and a tall cargo box
function van(w, x, z, alongX, paint, stripe, base = G) {
  const L = 20, D = 8, box = vbox(w, x, z, alongX);
  box(0, base + 1, 0, 5, base + 5, D, paint); // cab
  for (const b of [0, D - 1]) box(0, base + 1, b, 1, base + 5, b + 1, 0);
  box(0, base + 4, 0, 1, base + 5, D, 0);
  box(0, base + 1, 1, 1, base + 2, D - 1, M.tyre);
  box(0, base + 2, 2, 1, base + 4, D - 2, M.metal);
  for (const b of [1, D - 2]) box(0, base + 2, b, 1, base + 4, b + 1, M.headlamp);
  box(0, base + 2, 3, 1, base + 3, 5, M.plate);
  for (let k = 0; k < 4; k++) {
    box(1 + k, base + 5 + k, 0, 5, base + 6 + k, D, M.glass);
    box(2 + k, base + 5 + k, 1, 5, base + 6 + k, D - 1, 0);
  }
  box(2, base + 2, 1, 5, base + 5, D - 1, 0);
  box(2, base + 2, 1, 3, base + 4, D - 1, M.tyre); // dashboard
  box(3, base + 2, 1, 5, base + 3, D - 1, M.tyre); // seats
  box(4, base + 9, 0, 5, base + 10, D, paint);
  for (const b of [-1, D]) box(2, base + 6, b, 3, base + 8, b + 1, M.tyre); // mirrors
  // cargo box with a side stripe and rear doors
  box(5, base + 1, 0, L, base + 10, D, paint);
  box(6, base + 2, 1, L - 1, base + 9, D - 1, 0);
  box(6, base + 5, 0, L - 1, base + 6, D, stripe);
  box(6, base + 5, 1, L - 1, base + 6, D - 1, 0);
  box(L - 1, base + 1, 1, L, base + 2, D - 1, M.tyre);
  box(L - 1, base + 2, 3, L, base + 3, 5, M.plate);
  box(L - 1, base + 7, 4, L, base + 8, 5, M.metal); // door handle
  for (const b of [0, D - 1]) box(L - 1, base + 3, b, L, base + 5, b + 1, M.taillamp);
  for (const b of [0, D - 1]) box(1, base + 1, b, L - 1, base + 2, b + 1, 0); // tucked-in sills
  for (const b of [1, D - 2]) box(1, base + 1, b, L - 1, base + 2, b + 1, M.tyre);
  wheels(box, base, D, [2, L - 5]);
}

// wooden utility pole with a crossarm across the wire run; returns the three wire attachment points
function utilityPole(w, x, z, alongX, base = G + 1, h = 34) {
  const top = base + h - 1;
  w.fill(x, base, z, x + 1, top + 1, z + 1, M.wood);
  const ca = alongX ? (d) => [x, z + d] : (d) => [x + d, z];
  for (let d = -3; d <= 3; d++) { const [cx, cz] = ca(d); w.fill(cx, top - 2, cz, cx + 1, top - 1, cz + 1, M.wood); }
  for (const d of [-3, 3]) { const [cx, cz] = ca(d); w.fill(cx, top - 1, cz, cx + 1, top, cz + 1, M.metal); } // insulators
  return [[...ca(-3), top - 1], [x, z, top], [...ca(3), top - 1]].map(([px, pz, py]) => [px, py, pz]);
}

// Overhead wires laid by the current map, in world voxel coordinates. They are not voxels: the game
// draws each one as a rope hanging from the cells next to its anchors (p and q) and simulates it
// once it is cut or an anchor is destroyed.
export const WIRES = [];
function wire(w, p, q, sag) {
  const ox = w.ox ?? 0, oz = w.oz ?? 0;
  WIRES.push({ p: [p[0] + ox, p[1], p[2] + oz], q: [q[0] + ox, q[1], q[2] + oz], sag });
}
// run cables between consecutive poles, from one attachment to the matching one on the next pole
function wireRun(w, poles, alongX, sag = 4) {
  for (let i = 0; i + 1 < poles.length; i++)
    for (let k = 0; k < 3; k++) {
      const a = [...poles[i][k]], b = [...poles[i + 1][k]];
      a[alongX ? 0 : 2] += 1; b[alongX ? 0 : 2] -= 1;
      wire(w, a, b, sag);
    }
}

// 24 × 10 × 10 voxel shipping container (6 × 2.5 × 2.5 m) with corner posts and end doors
function container(w, x, z, alongX, mat, base = G, open = false) {
  const L = 24, D = 10, H = 10, box = vbox(w, x, z, alongX);
  box(0, base, 0, L, base + H, D, mat);
  box(1, base + 1, 1, L - 1, base + H - 1, D - 1, 0);
  box(1, base, 1, L - 1, base + 1, D - 1, M.planks);
  for (const a of [0, L - 1]) for (const b of [0, D - 1]) box(a, base, b, a + 1, base + H, b + 1, M.metal);
  for (const b of [0, D - 1]) { box(0, base, b, L, base + 1, b + 1, M.metal); box(0, base + H - 1, b, L, base + H, b + 1, M.metal); }
  if (open) {
    box(L - 1, base + 1, 5, L, base + H - 1, D - 1, 0);
    box(L, base + 1, D - 1, L + 4, base + H - 1, D, mat); // one door swung open
  }
  for (const b of open ? [2, 4] : [2, 4, 5, 7]) box(L, base + 1, b, L + 1, base + H - 1, b + 1, M.metal); // lock bars
}

// 5 × 4 voxel pallet: two runners and three deck boards
function pallet(w, x, y, z) {
  for (const dz of [0, 3]) w.fill(x, y, z + dz, x + 5, y + 1, z + dz + 1, M.wood);
  for (const dx of [0, 2, 4]) w.fill(x + dx, y + 1, z, x + dx + 1, y + 2, z + 4, M.planks);
}
function palletStack(w, x, z, n, base = G + 1) { for (let i = 0; i < n; i++) pallet(w, x, base + 2 * i, z); }

// wheelie bin (0.5 × 0.75 × 1.1 m) with its lid and wheels at the back
function wheelieBin(w, x, z, base = G + 1, mat = M.plastic) {
  w.fill(x, base + 1, z, x + 2, base + 4, z + 3, mat);
  w.fill(x, base + 4, z, x + 2, base + 5, z + 3, M.tyre);
  w.fill(x, base, z + 2, x + 2, base + 1, z + 3, M.tyre);
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
  // stone cross on the front gable
  w.fill(cx, top + k + 1, z0 - 1, cx + 1, top + k + 7, z0, M.stone);
  w.fill(cx - 2, top + k + 4, z0 - 1, cx + 3, top + k + 5, z0, M.stone);
  // buttresses between the nave windows
  for (let z = z0 + 8; z + 2 <= z1 - 4; z += 7) {
    w.fill(x0 - 2, G, z, x0, G + 12, z + 2, M.stone);
    w.fill(x0 - 1, G + 12, z, x0, G + 18, z + 2, M.stone);
    if (z >= z0 + 13) {
      w.fill(x1, G, z, x1 + 2, G + 12, z + 2, M.stone);
      w.fill(x1, G + 12, z, x1 + 1, G + 18, z + 2, M.stone);
    }
  }
  // arched porch around the west door
  w.fill(cx - 5, G, z0 - 1, cx + 5, G + 14, z0, M.stone);
  w.fill(cx - 3, G + 1, z0 - 1, cx + 3, G + 12, z0, 0);

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
  // clock face on the front of the tower
  const ccx = tx0 + 6, ccy = G + 27;
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++)
    if (x * x + y * y <= 10) w.fill(ccx + x - 1, ccy + y, z0 - 1, ccx + x, ccy + y + 1, z0, M.trim);
  w.fill(ccx - 1, ccy, z0 - 2, ccx, ccy + 3, z0 - 1, M.metal);
  w.fill(ccx, ccy, z0 - 2, ccx + 2, ccy + 1, z0 - 1, M.metal);
  w.fill(tx0, G, z0 - 1, tx1 + 1, G + 2, z0, M.stone);
  w.fill(tx1, G, z0 - 1, tx1 + 1, G + 2, tz1 + 1, M.stone);
  w.fill(tx0, G, tz1, tx1 + 1, G + 2, tz1 + 1, M.stone);
  w.fill(tx0 + 4, G + 1, z0 - 1, tx0 + 8, G + 2, z0, 0);
  w.fill(tx0 + 5, G + 51, z0 + 5, tx0 + 6, G + 55, z0 + 6, M.metal); // finial
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
const shifted = (w, ox, oz) => ({
  ox, oz,
  fill: (x0, y0, z0, x1, y1, z1, m) => w.fill(x0 + ox, y0, z0 + oz, x1 + ox, y1, z1 + oz, m),
  get: (x, y, z) => w.get(x + ox, y, z + oz),
  set: (x, y, z, m) => w.set(x + ox, y, z + oz, m),
});
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

  const barn = { wall: M.wood, floor: M.planks, win: M.glass, roof: M.roof, doorW: 10, doorH: 11, winW: 2, winGap: 8, plain: true };
  building(w, 112, 26, 30, 26, 1, barn);

  const farmPoles = [-39, 1, 41, 81, 121, 161, 201].map((x) => utilityPole(w, x, 62, true, G, 32));
  wireRun(w, farmPoles, true, 4);
  wire(w, [41, G + 31, 61], [41, G + 20, 54], 1);
  container(w, 150, 30, true, M.container2);
  container(w, 150, 42, true, M.container, G, true);
  palletStack(w, 152, 54, 3, G);
  palletStack(w, 159, 54, 1, G);
  van(w, 100, 56, true, M.paint3, M.paint, G);
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
    const x0 = 16 + 28 * i, brick = wall === M.brick;
    building(w, x0, 40, 29, 30, 2, {
      wall, floor: M.wood, inner: M.plaster, win: M.pane, roof: i % 2 ? M.slate : M.roof, flip: true, sideWin: false,
      winW: 4, doorX: 5, doorW: 5, winFront: [[], [5, 14, 21]], winBack: [4, 12, 20], bay: { u: 14, w: 12 },
      dormers: i % 2 ? [15] : [], flowers: !brick, doorLeaf: brick ? M.paint : M.paint2,
    });
    fenceZ(w, x0, 9, 40);
    if (i % 2 === 0) wheelieBin(w, x0 + 11, 71, G + 1, i === 2 ? M.container : M.plastic);
  });
  chimneyStack(w, 74, 52, G + 24, G + 43);
  for (const x of [44, 100, 128]) roofChimney(w, x, 55, G + 30, G + 43);
  fenceZ(w, 156, 9, 40);
  fenceX(w, 16, 157, 8);
  shed(w, 50, 14);
  shed(w, 106, 14);
  tree(w, 86, 20, 18, 6);
  tree(w, 138, 18, 15, 5);
  tree(w, 24, 18, 14, 5);
  // corner shop with a flat above
  building(w, 172, 44, 56, 26, 2, { wall: M.render2, floor: M.concrete, inner: M.plaster, win: M.pane, flip: true, shop: true, shopTop: G + 9, doorW: 6, doorH: 8 });
  signBoard(w, 174, 226, G + 9, 69, 1, 'FOOD STORE', M.sign, M.trim);
  awning(w, 174, 226, G + 8, 69, 1, 4, M.paint, M.trim);
  // delivery yard behind the shop: containers, a van, pallets and bins
  w.fill(172, G - 1, 10, 232, G, 44, M.asphalt);
  container(w, 176, 13, true, M.container);
  container(w, 178, 13, true, M.container2, G + 10);
  container(w, 214, 12, false, M.container3, G, true);
  van(w, 180, 30, true, M.paint3, M.sign, G);
  palletStack(w, 204, 30, 4, G);
  palletStack(w, 204, 36, 2, G);
  pallet(w, 210, G, 38);
  for (const x of [196, 199]) wheelieBin(w, x, 40, G, M.plastic);
  w.fill(180, G + 25, 50, 187, G + 29, 56, M.metal); // air conditioning units
  w.fill(206, G + 25, 52, 211, G + 28, 57, M.metal);
  tree(w, 236, 24, 17, 6);
  tree(w, 160, 20, 16, 5);

  // south side: church, car park, pub, café
  church(w, 20, 116, 28, 34);
  for (const z of [124, 131, 138, 145]) for (const x of [5, 12]) {
    w.fill(x, G, z, x + 3, G + 4, z + 1, M.stone);
    w.fill(x + 1, G + 4, z, x + 2, G + 5, z + 1, M.stone);
  }
  w.fill(62, G - 1, 114, 92, G, 150, M.asphalt);
  car(w, 66, 124, false, M.paint);
  car(w, 80, 130, false, M.paint3);
  building(w, 136, 116, 60, 32, 2, { wall: M.brick, floor: M.wood, inner: M.plaster, win: M.pane, roof: M.slate, doorW: 6, groundMat: M.sign });
  signBoard(w, 160, 192, G + 9, 116, -1, 'THE BELL', M.wood, M.trim);
  roofChimney(w, 142, 132, G + 28, G + 45);
  building(w, 204, 118, 32, 28, 1, { wall: M.render3, floor: M.concrete, win: M.pane, shop: true, shopTop: G + 9, doorW: 6, doorH: 8 });
  signBoard(w, 206, 234, G + 9, 118, -1, 'CAFE', M.sign, M.trim);
  awning(w, 205, 235, G + 8, 118, -1, 4, M.paint2, M.trim);
  w.fill(214, G + 13, 126, 220, G + 16, 132, M.metal);
  bench(w, 212, 108, G + 1);
  wheelieBin(w, 198, 111, G + 1);
  wheelieBin(w, 201, 111, G + 1, M.container);
  // parked cars along the kerb
  car(w, 20, 79, true, M.paint2);
  car(w, 150, 79, true, M.paint3);
  van(w, 54, 80, true, M.paint3, M.paint2);
  car(w, 180, 98, true, M.paint2);

  // across the river: boathouse on stilts, fishing pier, a house and the park
  building(w, 60, 184, 28, 28, 1, { wall: M.wood, floor: M.planks, win: M.glass, roof: M.roof, doorW: 12, doorH: 10, winW: 2, winGap: 6, flip: true, plain: true });
  for (const z of [184, 190]) for (const x of [60, 67, 74, 81, 86]) w.fill(x, 1, z, x + 2, G, z + 2, M.wood);
  w.fill(200, G, 166, 207, G + 1, R.river[1], M.planks);
  for (const z of [166, 174, 182, 189]) for (const x of [200, 205]) w.fill(x, 1, z, x + 2, G, z + 2, M.wood);
  building(w, 12, 212, 32, 28, 2, { wall: M.render3, floor: M.wood, inner: M.plaster, win: M.pane, roof: M.slate, flowers: true, doorLeaf: M.paint });
  roofChimney(w, 38, 226, G + 30, G + 42);
  fenceX(w, 10, 46, 244);
  for (const [x, z, h] of [[150, 214, 18], [236, 214, 16], [150, 244, 15], [236, 246, 19], [208, 238, 14], [56, 236, 17]]) tree(w, x, z, h, 6);
  w.fill(180, G, 224, 188, G + 6, 232, M.stone); // statue plinth
  w.fill(182, G + 6, 226, 186, G + 9, 230, M.metal);
  w.fill(183, G + 9, 227, 185, G + 18, 229, M.metal);
  w.fill(181, G + 14, 227, 187, G + 15, 229, M.metal);
  bench(w, 170, 210, G);
  // overhead power and phone lines along the south pavement, with drops to the houses and the pub
  const poles = [6, 46, 86, 134, 174, 214, 252].map((x) => utilityPole(w, x, 109, true));
  wireRun(w, poles, true, 4);
  wire(w, [46, G + 34, 108], [46, G + 22, 70], 3);
  wire(w, [86, G + 34, 108], [86, G + 22, 70], 3);
  wire(w, [174, G + 34, 110], [174, G + 23, 115], 1);
  w.fill(135, G + 24, 108, 138, G + 29, 111, M.metal); // transformer
  // phone line along the back gardens of the terraces
  const back = [12, 52, 92, 132, 160].map((x) => utilityPole(w, x, 4, true, G, 30));
  wireRun(w, back, true, 3);
  bench(w, 194, 210, G);
}

const RIVERSIDE_LAMPS = [
  [44, G + 18, 76], [128, G + 18, 76], [80, G + 18, 108], [180, G + 18, 108],
  [60, G + 18, 156], [170, G + 18, 156], [103, G + 17, 177], [150, G + 18, 202],
  [166, G + 12, 124], [196, G + 12, 56],
];
function riversideLamps(w) {
  streetLamp(w, 44, 72, 0, 1); streetLamp(w, 128, 72, 0, 1);
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
  WIRES.length = 0;
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
