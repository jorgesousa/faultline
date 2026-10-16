import * as THREE from 'three';

export const VS = 0.25; // voxel size in metres
export const WX = 256, WY = 80, WZ = 256;
export const CS = 16; // chunk size in voxels
export const NCX = WX / CS, NCY = WY / CS, NCZ = WZ / CS;

// hard: tool power needed to break it. anchor: counts as solid ground for connectivity.
// span: how many voxels it can reach horizontally from a vertical load path before sagging off.
// strength: load (in density units) one voxel can carry when it rests on the ground.
export const MAT = [
  null,
  { name: 'ground', pat: 6, color: 0x5f6e48, hard: 99, density: 2.0, anchor: true, span: 99, strength: 1e9 },
  { name: 'concrete', pat: 8, color: 0x9c9b96, hard: 3, density: 2.4, span: 12, strength: 900 },
  { name: 'brick', pat: 1, color: 0xa5553b, hard: 2, density: 1.9, span: 10, strength: 500 },
  { name: 'wood', pat: 4, color: 0x8f6036, hard: 1, density: 0.7, span: 14, strength: 300 },
  { name: 'glass', pat: 11, shatter: true, color: 0xa9dcec, hard: 0, density: 2.5, span: 4, strength: 20 },
  { name: 'metal', pat: 12, color: 0x5b6571, hard: 5, density: 7.8, span: 24, strength: 3000 },
  { name: 'roof', pat: 3, color: 0x7b3a31, hard: 1, density: 1.5, span: 16, strength: 60 },
  { name: 'plaster', pat: 9, color: 0xe2dacb, hard: 1, density: 1.2, span: 8, strength: 80 },
  { name: 'asphalt', pat: 7, color: 0x3a3c40, hard: 99, density: 2.0, anchor: true, span: 99, strength: 1e9 },
  { name: 'planks', pat: 4, color: 0xb98b56, hard: 1, density: 0.6, span: 16, strength: 120 },
  { name: 'pavement', pat: 5, color: 0xa29d94, hard: 99, density: 2.2, anchor: true, span: 99, strength: 1e9 },
  { name: 'stone', pat: 2, color: 0xb9ad92, hard: 3, density: 2.5, span: 12, strength: 900 },
  { name: 'render', pat: 9, color: 0xe6d6a8, hard: 2, density: 1.9, span: 10, strength: 500 },
  { name: 'render2', pat: 9, color: 0x9fc0d8, hard: 2, density: 1.9, span: 10, strength: 500 },
  { name: 'render3', pat: 9, color: 0xe0a296, hard: 2, density: 1.9, span: 10, strength: 500 },
  { name: 'leaves', pat: 10, color: 0x4f7f3a, hard: 0, density: 0.3, span: 10, strength: 40 },
  { name: 'paint', pat: 12, color: 0xb8262c, hard: 2, density: 3.0, span: 20, strength: 600 },
  { name: 'paint2', pat: 12, color: 0x2c5aa8, hard: 2, density: 3.0, span: 20, strength: 600 },
  { name: 'tyre', pat: 0, color: 0x1d1e21, hard: 2, density: 1.2, span: 8, strength: 600 },
  { name: 'trim', pat: 9, color: 0xe8e4d8, hard: 1, density: 0.7, span: 10, strength: 200 },
  { name: 'slate', pat: 3, color: 0x4e5560, hard: 1, density: 1.6, span: 16, strength: 60 },
  { name: 'sign', pat: 9, color: 0x1f4a3b, hard: 1, density: 0.7, span: 12, strength: 200 },
  { name: 'flower', pat: 10, color: 0xd2476a, hard: 0, density: 0.3, span: 10, strength: 40 },
  { name: 'pane', pat: 13, shatter: true, color: 0x9fcfe0, hard: 0, density: 2.5, span: 4, strength: 20 },
  { name: 'darkbrick', pat: 1, color: 0x6e3a2c, hard: 2, density: 1.9, span: 10, strength: 500 },
  { name: 'container', pat: 14, color: 0x2f6d8c, hard: 2, density: 1.6, span: 16, strength: 800 },
  { name: 'container2', pat: 14, color: 0xb4532c, hard: 2, density: 1.6, span: 16, strength: 800 },
  { name: 'container3', pat: 14, color: 0x3f7a4a, hard: 2, density: 1.6, span: 16, strength: 800 },
  { name: 'plastic', pat: 9, color: 0x2b4636, hard: 1, density: 0.6, span: 8, strength: 100 },
  { name: 'paint3', pat: 12, color: 0xe2e3df, hard: 2, density: 3.0, span: 20, strength: 600 },
  { name: 'headlamp', pat: 11, shatter: true, color: 0xfff1c8, hard: 0, density: 2.5, span: 4, strength: 20 },
  { name: 'taillamp', pat: 11, shatter: true, color: 0xc4161c, hard: 0, density: 2.5, span: 4, strength: 20 },
  { name: 'plate', pat: 0, color: 0xf2d43a, hard: 1, density: 1.0, span: 4, strength: 50 },
];
export const M = Object.fromEntries(MAT.map((m, i) => [m?.name, i]).filter(([n]) => n));

// surface pattern drawn by the voxel shader (see main.js)
export const MAT_PAT = MAT.map((m) => m?.pat ?? 0);

// Linear-space RGB for vertex colours
export const MAT_RGB = MAT.map((m) => {
  if (!m) return null;
  const c = new THREE.Color(m.color);
  return [c.r, c.g, c.b];
});

export class VoxelWorld {
  constructor() {
    this.data = new Uint8Array(WX * WY * WZ);
    this.burn = new Uint8Array(WX * WY * WZ); // scorch per voxel, 0–255
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
