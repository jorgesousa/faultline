import { VS, MAT_RGB } from './world.js';

const AO_CURVE = [0.45, 0.65, 0.82, 1.0];
const FACES = [];
for (let a = 0; a < 3; a++) for (const s of [1, -1]) FACES.push({ a, s, u: (a + 1) % 3, v: (a + 2) % 3 });
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

function noise(x, y, z) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Culled-face voxel mesher with per-vertex ambient occlusion.
 * get(x,y,z) -> material id. Ranges are [x0,x1) etc.
 * (nox,noy,noz) offsets the colour noise so detached debris keeps its original look.
 * (px,py,pz) is added to every vertex position (metres).
 */
export function buildGeometryArrays(get, x0, y0, z0, x1, y1, z1, nox, noy, noz, px, py, pz) {
  const pos = [], nor = [], col = [], idx = [];
  const p = [0, 0, 0], q = [0, 0, 0], vp = [0, 0, 0], ao = [0, 0, 0, 0];
  const solid = (r) => (get(r[0], r[1], r[2]) ? 1 : 0);

  for (let y = y0; y < y1; y++)
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        const m = get(x, y, z);
        if (!m) continue;
        const base = MAT_RGB[m];
        const shade = 0.86 + 0.14 * noise(x + nox, y + noy, z + noz);
        for (const f of FACES) {
          p[0] = x; p[1] = y; p[2] = z;
          p[f.a] += f.s;
          if (get(p[0], p[1], p[2])) continue;
          const start = pos.length / 3;
          for (let c = 0; c < 4; c++) {
            const cu = CORNERS[c][0], cv = CORNERS[c][1];
            const su = cu ? 1 : -1, sv = cv ? 1 : -1;
            q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[f.u] += su;
            const s1 = solid(q);
            q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[f.v] += sv;
            const s2 = solid(q);
            q[f.u] += su;
            const cc = solid(q);
            const a = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
            ao[c] = a;
            vp[0] = x; vp[1] = y; vp[2] = z;
            if (f.s > 0) vp[f.a] += 1;
            vp[f.u] += cu; vp[f.v] += cv;
            pos.push(vp[0] * VS + px, vp[1] * VS + py, vp[2] * VS + pz);
            const n0 = f.a === 0 ? f.s : 0, n1 = f.a === 1 ? f.s : 0, n2 = f.a === 2 ? f.s : 0;
            nor.push(n0, n1, n2);
            const b = AO_CURVE[a] * shade;
            col.push(base[0] * b, base[1] * b, base[2] * b);
          }
          const flip = ao[0] + ao[2] < ao[1] + ao[3];
          if (f.s > 0) {
            if (flip) idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
            else idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
          } else {
            if (flip) idx.push(start + 1, start + 3, start + 2, start + 1, start, start + 3);
            else idx.push(start, start + 2, start + 1, start, start + 3, start + 2);
          }
        }
      }
  return {
    pos: new Float32Array(pos),
    nor: new Float32Array(nor),
    col: new Float32Array(col),
    idx: new Uint32Array(idx),
  };
}

/** Decomposes solid voxels in a range into a small set of axis-aligned boxes for physics colliders. */
export function greedyBoxes(get, x0, y0, z0, x1, y1, z1) {
  const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
  const vis = new Uint8Array(sx * sy * sz);
  const id = (x, y, z) => ((y - y0) * sz + (z - z0)) * sx + (x - x0);
  const ok = (x, y, z) => get(x, y, z) !== 0 && !vis[id(x, y, z)];
  const boxes = [];
  for (let y = y0; y < y1; y++)
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        if (!ok(x, y, z)) continue;
        let x2 = x + 1;
        while (x2 < x1 && ok(x2, y, z)) x2++;
        let z2 = z + 1;
        zl: while (z2 < z1) {
          for (let xx = x; xx < x2; xx++) if (!ok(xx, y, z2)) break zl;
          z2++;
        }
        let y2 = y + 1;
        yl: while (y2 < y1) {
          for (let zz = z; zz < z2; zz++) for (let xx = x; xx < x2; xx++) if (!ok(xx, y2, zz)) break yl;
          y2++;
        }
        for (let yy = y; yy < y2; yy++) for (let zz = z; zz < z2; zz++) for (let xx = x; xx < x2; xx++) vis[id(xx, yy, zz)] = 1;
        boxes.push([x, y, z, x2, y2, z2]);
      }
  return boxes;
}
