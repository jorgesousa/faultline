import * as THREE from 'three';

export const VS = 0.25; // voxel size in metres
export const WX = 160, WY = 80, WZ = 160;
export const CS = 16; // chunk size in voxels
export const NCX = WX / CS, NCY = WY / CS, NCZ = WZ / CS;

// hard: tool power needed to break it. anchor: counts as solid ground for connectivity.
// span: how many voxels it can reach horizontally from a vertical load path before sagging off.
// strength: load (in density units) one voxel can carry when it rests on the ground.
export const MAT = [
  null,
  { name: 'ground', color: 0x5f6e48, hard: 99, density: 2.0, anchor: true, span: 99, strength: 1e9 },
  { name: 'concrete', color: 0x9c9b96, hard: 3, density: 2.4, span: 12, strength: 900 },
  { name: 'brick', color: 0xa5553b, hard: 2, density: 1.9, span: 10, strength: 500 },
  { name: 'wood', color: 0x8f6036, hard: 1, density: 0.7, span: 14, strength: 300 },
  { name: 'glass', color: 0xa9dcec, hard: 0, density: 2.5, span: 4, strength: 20 },
  { name: 'metal', color: 0x5b6571, hard: 5, density: 7.8, span: 24, strength: 3000 },
  { name: 'roof', color: 0x7b3a31, hard: 1, density: 1.5, span: 16, strength: 60 },
  { name: 'plaster', color: 0xe2dacb, hard: 1, density: 1.2, span: 8, strength: 80 },
  { name: 'asphalt', color: 0x3a3c40, hard: 99, density: 2.0, anchor: true, span: 99, strength: 1e9 },
  { name: 'planks', color: 0xb98b56, hard: 1, density: 0.6, span: 16, strength: 120 },
];
export const M = Object.fromEntries(MAT.map((m, i) => [m?.name, i]).filter(([n]) => n));

// Linear-space RGB for vertex colours
export const MAT_RGB = MAT.map((m) => {
  if (!m) return null;
  const c = new THREE.Color(m.color);
  return [c.r, c.g, c.b];
});

export class VoxelWorld {
  constructor() {
    this.data = new Uint8Array(WX * WY * WZ);
  }
  idx(x, y, z) {
    return (y * WZ + z) * WX + x;
  }
  inb(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < WX && y < WY && z < WZ;
  }
  get(x, y, z) {
    if (y < 0) return 1; // bedrock below the world hides bottom faces
    if (x < 0 || z < 0 || x >= WX || y >= WY || z >= WZ) return 0;
    return this.data[(y * WZ + z) * WX + x];
  }
  set(x, y, z, m) {
    if (this.inb(x, y, z)) this.data[(y * WZ + z) * WX + x] = m;
  }
  // upper bounds exclusive
  fill(x0, y0, z0, x1, y1, z1, m) {
    for (let y = Math.max(0, y0); y < Math.min(WY, y1); y++)
      for (let z = Math.max(0, z0); z < Math.min(WZ, z1); z++)
        for (let x = Math.max(0, x0); x < Math.min(WX, x1); x++) this.data[(y * WZ + z) * WX + x] = m;
  }
}
