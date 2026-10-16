import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { VS, WX, WY, WZ, CS, NCX, NCY, NCZ, MAT, MAT_RGB, M, VoxelWorld } from './world.js';
import { buildGeometryArrays, greedyBoxes } from './mesher.js';
import { buildLevel, countDestructible, G, MAPS } from './level.js';
import { analyzeStructures } from './structure.js';
import { placeLoot, LOOT_KINDS } from './loot.js';

await RAPIER.init();

// ---------- rendering ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0xa9cde6;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 35, 140);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 400);
scene.add(camera);

const CENTER = new THREE.Vector3((WX * VS) / 2, 0, (WZ * VS) / 2);
const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4030, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.copy(CENTER).add(new THREE.Vector3(-18, 34, -12));
sun.target.position.copy(CENTER);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ground beyond the play area, with a hole so dug-out terrain (like a river bed) stays visible
const outerShape = new THREE.Shape().moveTo(-300, -300).lineTo(300, -300).lineTo(300, 300).lineTo(-300, 300).lineTo(-300, -300);
outerShape.holes.push(new THREE.Path().moveTo(-WX * VS / 2, -WZ * VS / 2).lineTo(-WX * VS / 2, WZ * VS / 2).lineTo(WX * VS / 2, WZ * VS / 2).lineTo(WX * VS / 2, -WZ * VS / 2).lineTo(-WX * VS / 2, -WZ * VS / 2));
const outerGround = new THREE.Mesh(
  new THREE.ShapeGeometry(outerShape),
  new THREE.MeshLambertMaterial({ color: new THREE.Color(MAT[M.ground].color).multiplyScalar(0.92) })
);
outerGround.rotation.x = -Math.PI / 2;
outerGround.position.set(CENTER.x, G * VS - 0.02, CENTER.z);
outerGround.receiveShadow = true;
scene.add(outerGround);

const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
// Procedural surface detail (brick courses, stone blocks, roof tiles, boards, paving slabs, speckle)
// drawn from each voxel's original grid position, so debris keeps its pattern.
const SURFACE_GLSL = /* glsl */ `
varying vec4 vTp;
varying vec3 vObjN;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
// 1 on a joint line at integer values of c, 0 elsewhere (anti-aliased)
float jl(float c, float w) { float d = abs(fract(c + 0.5) - 0.5); return 1.0 - smoothstep(w, w + fwidth(c) * 1.5, d); }
vec3 surf(vec3 col) {
  int pat = int(vTp.w + 0.5);
  if (pat == 0) return col;
  vec3 n = abs(vObjN);
  bool top = n.y > 0.5;
  vec2 uv = n.x > 0.5 ? vTp.zy : (n.z > 0.5 ? vTp.xy : vTp.xz);
  float fw = max(fwidth(uv.x), fwidth(uv.y));
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  float d4 = 1.0 - smoothstep(0.08, 0.22, fw); // detail at 4 lines per voxel
  float d2 = 1.0 - smoothstep(0.15, 0.45, fw);
  float d1 = 1.0 - smoothstep(0.3, 0.9, fw);
  if (pat == 1) { // brick: 4 courses per voxel, stretcher bond
    float r = uv.y * 4.0, ri = floor(r);
    float b = uv.x * (top ? 2.0 : 1.0) + mod(ri, 2.0) * 0.5;
    if (top) { r = uv.y * 2.0; ri = floor(r); b = uv.x + mod(ri, 2.0) * 0.5; }
    float v = h21(vec2(floor(b), ri));
    col *= mix(1.0, 0.8 + 0.34 * v + 0.08 * (vn(uv * 9.0) - 0.5), d4);
    float m = max(jl(r, 0.09), jl(b, 0.035)) * d4;
    col = mix(col, vec3(lum) * 1.25 + 0.035, m * 0.85);
  } else if (pat == 2) { // stone: irregular ashlar blocks
    float r = uv.y * 1.6, ri = floor(r);
    float b = uv.x * 0.8 + h21(vec2(ri, 7.0));
    float v = h21(vec2(floor(b), ri));
    col *= mix(1.0, 0.78 + 0.36 * v, d2) * (0.92 + 0.16 * vn(uv * 5.0));
    float m = max(jl(r, 0.05), jl(b, 0.03)) * d2;
    col = mix(col, col * 0.55, m);
  } else if (pat == 3) { // roof tiles: 3 rows per voxel, each row darker at its lower edge
    float r = (top ? uv.y : uv.y) * 3.0, ri = floor(r);
    float b = uv.x * 3.0 + mod(ri, 2.0) * 0.5;
    float v = h21(vec2(floor(b), ri));
    float g = top ? 1.0 : 0.72 + 0.28 * fract(r);
    col *= mix(1.0, g * (0.82 + 0.3 * v), d4) * (0.9 + 0.2 * vn(uv * 0.7));
    col = mix(col, col * 0.6, max(jl(r, 0.06), jl(b, 0.05)) * d4);
  } else if (pat == 4) { // boards, 2 per voxel, with grain
    float c = top ? uv.y : uv.x;
    float along = top ? uv.x : uv.y;
    float bi = floor(c * 2.0);
    float v = h21(vec2(bi, floor(along * 0.25 + h21(vec2(bi, 1.0)))));
    float grain = vn(vec2(c * 20.0, along * 1.5));
    col *= mix(1.0, (0.84 + 0.26 * v) * (0.9 + 0.2 * grain), d2);
    col = mix(col, col * 0.5, jl(c * 2.0, 0.05) * d2);
  } else if (pat == 5) { // paving slabs, 50 cm
    vec2 s = uv * 0.5;
    float v = h21(floor(s));
    col *= mix(1.0, 0.88 + 0.2 * v, d1) * (0.93 + 0.14 * vn(uv * 3.0));
    if (top) col = mix(col, col * 0.7, max(jl(s.x, 0.02), jl(s.y, 0.02)) * d1);
  } else if (pat == 6) { // grass
    col *= 0.8 + 0.35 * vn(uv * 2.5) + 0.12 * (h21(floor(uv * 6.0)) - 0.5) * d4;
    col = mix(col, col * vec3(1.18, 1.08, 0.7), smoothstep(0.55, 0.85, vn(uv * 0.15)));
  } else if (pat == 7) { // asphalt
    col *= 0.85 + 0.25 * vn(uv * 0.4) + 0.14 * (h21(floor(uv * 12.0)) - 0.5) * d4;
  } else if (pat == 8) { // concrete: speckle, faint form-work panels
    col *= 0.9 + 0.12 * vn(uv * 1.5) + 0.06 * (h21(floor(uv * 10.0)) - 0.5) * d4;
    if (!top) col = mix(col, col * 0.8, max(jl(uv.x * 0.25, 0.01), jl(uv.y * 0.25, 0.01)) * d1);
  } else if (pat == 9) { // render / plaster / paint
    col *= 0.94 + 0.1 * vn(uv * 4.0) * d2 + 0.05 * vn(uv * 0.6);
  } else if (pat == 10) { // foliage
    col *= 0.6 + 0.7 * vn(uv * 3.0);
  } else if (pat == 11) { // glass: soft diagonal reflections
    float s = fract((uv.x + uv.y * 0.6) * 0.18);
    col *= 0.8 + 0.35 * smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.25, 0.6, s));
  } else if (pat == 12) { // metal / paint: subtle scratches and rust
    col *= 0.92 + 0.12 * vn(uv * vec2(1.0, 8.0));
    col = mix(col, vec3(0.32, 0.13, 0.05) * (0.6 + lum), smoothstep(0.72, 0.9, vn(uv * 1.3)) * 0.35);
  } else if (pat == 13) { // multi-pane window: white glazing bars on every voxel edge
    float s = fract((uv.x + uv.y * 0.6) * 0.18);
    col *= 0.8 + 0.35 * smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.25, 0.6, s));
    if (!top) col = mix(col, vec3(0.86, 0.85, 0.8), max(jl(uv.x, 0.07), jl(uv.y, 0.07)) * d1);
  } else if (pat == 14) { // shipping container: corrugated steel sides, dents and rust streaks
    if (!top) {
      float rib = 0.5 + 0.5 * sin(uv.x * 6.2832 * 1.5);
      col *= mix(1.0, 0.78 + 0.3 * rib, d4);
      col *= 1.0 - 0.18 * smoothstep(0.6, 0.95, vn(vec2(uv.x * 0.9, uv.y * 0.12)));
    }
    col *= 0.9 + 0.14 * vn(uv * 0.8);
    col = mix(col, vec3(0.36, 0.17, 0.08) * (0.5 + lum), smoothstep(0.7, 0.92, vn(uv * 0.9 + 13.0)) * 0.5);
  }
  // weathering on walls: grime near the ground and rain streaks running down
  if (!top && (pat == 1 || pat == 2 || pat == 4 || pat == 8 || pat == 9)) {
    col *= mix(0.72, 1.0, smoothstep(4.0, 10.0, vTp.y));
    col *= 1.0 - 0.14 * smoothstep(0.55, 0.95, vn(vec2(uv.x * 1.3, uv.y * 0.06))) * d1;
  }
  return col;
}
`;
voxelMaterial.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 tp;\nvarying vec4 vTp;\nvarying vec3 vObjN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTp = tp;\nvObjN = normal;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + SURFACE_GLSL)
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = surf(diffuseColor.rgb);');
};

function makeGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
  g.setAttribute('tp', new THREE.BufferAttribute(a.tp, 4));
  g.setIndex(new THREE.BufferAttribute(a.idx, 1));
  return g;
}

// ---------- physics ----------
const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
physics.timestep = 1 / 60;
const staticBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
{
  // invisible boundary walls
  const L = WX * VS, D = WZ * VS, h = 30;
  for (const [x, z, hx, hz] of [[-0.5, D / 2, 0.5, D / 2], [L + 0.5, D / 2, 0.5, D / 2], [L / 2, -0.5, L / 2, 0.5], [L / 2, D + 0.5, L / 2, 0.5]])
    physics.createCollider(RAPIER.ColliderDesc.cuboid(hx, h, hz).setTranslation(x, h, z), staticBody);
}

// ---------- voxel world + chunks ----------
const world = new VoxelWorld();
const wget = (x, y, z) => world.get(x, y, z);
const chunks = Array.from({ length: NCX * NCY * NCZ }, () => ({ mesh: null, colliders: [] }));
const dirty = new Set();
const chunkOf = (x, y, z) => ((Math.floor(y / CS) * NCZ + Math.floor(z / CS)) * NCX + Math.floor(x / CS));

function markDirty(x, y, z) {
  for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    if (world.inb(nx, ny, nz)) dirty.add(chunkOf(nx, ny, nz));
  }
}

function rebuildChunk(ci) {
  const c = chunks[ci];
  const cx = ci % NCX, cz = Math.floor(ci / NCX) % NCZ, cy = Math.floor(ci / (NCX * NCZ));
  const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
  const a = buildGeometryArrays(wget, x0, y0, z0, x0 + CS, y0 + CS, z0 + CS, 0, 0, 0, 0, 0, 0);
  if (c.mesh) {
    c.mesh.geometry.dispose();
    scene.remove(c.mesh);
    c.mesh = null;
  }
  if (a.idx.length) {
    c.mesh = new THREE.Mesh(makeGeometry(a), voxelMaterial);
    c.mesh.castShadow = c.mesh.receiveShadow = true;
    scene.add(c.mesh);
  }
  for (const col of c.colliders) physics.removeCollider(col, false);
  c.colliders = greedyBoxes(wget, x0, y0, z0, x0 + CS, y0 + CS, z0 + CS).map(([bx, by, bz, ex, ey, ez]) =>
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid(((ex - bx) * VS) / 2, ((ey - by) * VS) / 2, ((ez - bz) * VS) / 2)
        .setTranslation(((bx + ex) * VS) / 2, ((by + ey) * VS) / 2, ((bz + ez) * VS) / 2)
        .setFriction(0.9),
      staticBody
    )
  );
}

function flushDirty() {
  for (const ci of dirty) rebuildChunk(ci);
  dirty.clear();
}

// ---------- particles ----------
class Particles {
  constructor(max, size, { gravity, drag, rise = 0, grow = 0, lit = true, soft = false }) {
    this.max = max;
    this.cfg = { gravity, drag, rise, grow };
    const mat = soft
      ? new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55, depthWrite: false })
      : lit ? new THREE.MeshLambertMaterial() : new THREE.MeshBasicMaterial();
    const geo = soft ? new THREE.IcosahedronGeometry(size / 2, 1) : new THREE.BoxGeometry(size, size, size);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = lit && !soft;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.scale = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3();
    this.t = new THREE.Vector3();
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life, scale, r, g, b) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.scale[i] = scale;
    this.rot[i] = Math.random() * 6;
    this.mesh.instanceColor.setXYZ(i, r, g, b);
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const { gravity, drag, rise, grow } = this.cfg;
    const groundY = G * VS;
    for (let i = 0; i < this.max; i++) {
      let s = 0;
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        const k = i * 3;
        this.v[k + 1] += (rise - gravity) * dt;
        const dk = Math.exp(-drag * dt);
        this.v[k] *= dk; this.v[k + 1] *= dk; this.v[k + 2] *= dk;
        this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
        if (this.p[k + 1] < groundY && this.v[k + 1] < 0) {
          this.p[k + 1] = groundY;
          this.v[k + 1] *= -0.3; this.v[k] *= 0.6; this.v[k + 2] *= 0.6;
        }
        const t = 1 - this.life[i] / this.maxLife[i];
        s = this.scale[i] * (1 + grow * t) * Math.min(1, (this.life[i] / this.maxLife[i]) * 3);
        this.rot[i] += dt * 2;
        this.t.set(this.p[k], this.p[k + 1], this.p[k + 2]);
      }
      this.e.set(this.rot[i], this.rot[i] * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(Math.max(s, 0.0001));
      this.m.compose(this.t, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const chips = new Particles(2500, VS * 0.7, { gravity: 14, drag: 0.6 });
const smoke = new Particles(600, 1, { gravity: 0, drag: 2.2, rise: 1.2, grow: 1.2, soft: true });

function chipAt(x, y, z, m, speed = 4) {
  const c = MAT_RGB[m] ?? [0.6, 0.6, 0.6];
  chips.spawn(x, y, z, (Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed,
    0.8 + Math.random() * 1.2, 0.5 + Math.random() * 0.6, c[0], c[1], c[2]);
}

// ---------- stats ----------
let initialDestructible = 1, destroyed = 0;

// ---------- world carving + connectivity ----------
const mark = new Int32Array(WX * WY * WZ);
let fillCounter = 0;
const MAXFILL = 400000;

/** Removes voxels in a sphere (metres), or a capsule when `end` is given. Glass shatters over a wider radius. Returns removed cell indices. */
function carveWorld(c, r, power, glassMul = 2.2, end = null) {
  const vx = c.x / VS, vy = c.y / VS, vz = c.z / VS, vr = r / VS, gr = vr * glassMul;
  const ex = end ? end.x / VS : vx, ey = end ? end.y / VS : vy, ez = end ? end.z / VS : vz;
  const sx = ex - vx, sy = ey - vy, sz = ez - vz, sl = sx * sx + sy * sy + sz * sz || 1;
  const R = Math.ceil(gr) + 1;
  const removed = [], mats = [];
  for (let y = Math.max(0, Math.floor(Math.min(vy, ey) - R)); y <= Math.min(WY - 1, Math.max(vy, ey) + R); y++)
    for (let z = Math.max(0, Math.floor(Math.min(vz, ez) - R)); z <= Math.min(WZ - 1, Math.max(vz, ez) + R); z++)
      for (let x = Math.max(0, Math.floor(Math.min(vx, ex) - R)); x <= Math.min(WX - 1, Math.max(vx, ex) + R); x++) {
        const i = world.idx(x, y, z), m = world.data[i];
        if (!m) continue;
        const px = x + 0.5 - vx, py = y + 0.5 - vy, pz = z + 0.5 - vz;
        const k = end ? Math.max(0, Math.min(1, (px * sx + py * sy + pz * sz) / sl)) : 0;
        const d = Math.hypot(px - sx * k, py - sy * k, pz - sz * k);
        const breakable = MAT[m].hard <= power;
        if ((d <= vr && breakable) || (MAT[m].shatter && d <= gr)) {
          world.data[i] = 0;
          removed.push(i);
          mats.push(m);
          markDirty(x, y, z);
        }
      }
  destroyed += removed.length;
  const p = Math.min(1, 90 / Math.max(1, removed.length));
  removed.forEach((i, k) => {
    if (Math.random() > p) return;
    const x = i % WX, t = (i / WX) | 0, z = t % WZ, y = (t / WZ) | 0;
    chipAt((x + 0.5) * VS, (y + 0.5) * VS, (z + 0.5) * VS, mats[k]);
  });
  return removed;
}

/** After removal, find voxel islands no longer connected to the ground and turn them into rigid bodies. */
function detachFloating(removed) {
  const passStart = fillCounter + 1;
  const anchored = new Map();
  const D = world.data;
  const SX = 1, SZ = WX, SY = WX * WZ;
  for (const r of removed) {
    const rx = r % WX, rt = (r / WX) | 0, rz = rt % WZ, ry = (rt / WZ) | 0;
    const nbs = [];
    if (rx > 0) nbs.push(r - SX); if (rx < WX - 1) nbs.push(r + SX);
    if (rz > 0) nbs.push(r - SZ); if (rz < WZ - 1) nbs.push(r + SZ);
    if (ry > 0) nbs.push(r - SY); if (ry < WY - 1) nbs.push(r + SY);
    for (const start of nbs) {
      if (!D[start] || mark[start] >= passStart) continue;
      const id = ++fillCounter;
      mark[start] = id;
      const stack = [start], list = [start];
      let isAnchored = false;
      search: while (stack.length) {
        const c = stack.pop();
        if (MAT[D[c]].anchor) { isAnchored = true; break; }
        const x = c % WX, t = (c / WX) | 0, z = t % WZ, y = (t / WZ) | 0;
        // push up first so "down" is explored first (reaches the ground quickly)
        const cand = [];
        if (y < WY - 1) cand.push(c + SY);
        if (x > 0) cand.push(c - SX); if (x < WX - 1) cand.push(c + SX);
        if (z > 0) cand.push(c - SZ); if (z < WZ - 1) cand.push(c + SZ);
        if (y > 0) cand.push(c - SY); else { isAnchored = true; break; }
        for (const n of cand) {
          if (!D[n]) continue;
          const mk = mark[n];
          if (mk === id) continue;
          if (mk >= passStart) { if (anchored.get(mk)) { isAnchored = true; break search; } continue; }
          mark[n] = id;
          stack.push(n);
          list.push(n);
        }
        if (list.length > MAXFILL) { isAnchored = true; break; }
      }
      anchored.set(id, isAnchored);
      if (!isAnchored) spawnFromWorld(list);
    }
  }
}

function spawnFromWorld(list) {
  let mnx = WX, mny = WY, mnz = WZ, mxx = 0, mxy = 0, mxz = 0;
  const cells = list.map((c) => {
    const x = c % WX, t = (c / WX) | 0, z = t % WZ, y = (t / WZ) | 0;
    mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z);
    mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z);
    return [x, y, z, world.data[c]];
  });
  for (const c of list) world.data[c] = 0;
  for (const [x, y, z, m] of cells) markDirty(x, y, z);
  if (cells.length <= 3) {
    destroyed += cells.length;
    for (const [x, y, z, m] of cells) chipAt((x + 0.5) * VS, (y + 0.5) * VS, (z + 0.5) * VS, m);
    return;
  }
  const dx = mxx - mnx + 1, dy = mxy - mny + 1, dz = mxz - mnz + 1;
  const grid = new Uint8Array(dx * dy * dz);
  for (const [x, y, z, m] of cells) grid[((y - mny) * dz + (z - mnz)) * dx + (x - mnx)] = m;
  createDebris(grid, dx, dy, dz, [mnx, mny, mnz], new THREE.Vector3(mnx * VS, mny * VS, mnz * VS),
    new THREE.Quaternion(), { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
}

// ---------- debris (detached rigid bodies) ----------
const debris = [];
const colliderOwner = new Map(); // collider handle -> debris | bomb
const MAX_DEBRIS = 140;

function createDebris(grid, dx, dy, dz, noff, frameOrigin, quat, linvel, angvel) {
  const get = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= dx || y >= dy || z >= dz ? 0 : grid[(y * dz + z) * dx + x]);
  let n = 0, cx = 0, cy = 0, cz = 0, dens = 0;
  for (let y = 0; y < dy; y++) for (let z = 0; z < dz; z++) for (let x = 0; x < dx; x++) {
    const m = get(x, y, z);
    if (!m) continue;
    n++; cx += x + 0.5; cy += y + 0.5; cz += z + 0.5; dens += MAT[m].density;
  }
  if (!n) return null;
  const com = new THREE.Vector3((cx / n) * VS, (cy / n) * VS, (cz / n) * VS);
  const a = buildGeometryArrays(get, 0, 0, 0, dx, dy, dz, noff[0], noff[1], noff[2], -com.x, -com.y, -com.z);
  const mesh = new THREE.Mesh(makeGeometry(a), voxelMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  const t = com.clone().applyQuaternion(quat).add(frameOrigin);
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(t.x, t.y, t.z).setRotation(quat)
      .setLinvel(linvel.x, linvel.y, linvel.z).setAngvel(angvel).setCcdEnabled(n < 40)
  );
  const deb = { grid, dx, dy, dz, noff, com, body, mesh, colliders: [], count: n, age: 0, impactCd: 0.25, prevVel: { ...linvel }, prevAng: { ...angvel } };
  deb.radius = Math.hypot(dx, dy, dz) * VS * 0.5;
  for (const [bx, by, bz, ex, ey, ez] of greedyBoxes(get, 0, 0, 0, dx, dy, dz)) {
    const col = physics.createCollider(
      RAPIER.ColliderDesc.cuboid(((ex - bx) * VS) / 2, ((ey - by) * VS) / 2, ((ez - bz) * VS) / 2)
        .setTranslation(((bx + ex) * VS) / 2 - com.x, ((by + ey) * VS) / 2 - com.y, ((bz + ez) * VS) / 2 - com.z)
        .setDensity((dens / n) * 1000).setFriction(0.8).setRestitution(0.05),
      body
    );
    deb.colliders.push(col);
    colliderOwner.set(col.handle, deb);
  }
  mesh.position.copy(t);
  mesh.quaternion.copy(quat);
  debris.push(deb);
  while (debris.length > MAX_DEBRIS) removeDebris(debris[0]);
  return deb;
}

function removeDebris(deb) {
  const i = debris.indexOf(deb);
  if (i < 0) return;
  debris.splice(i, 1);
  for (const c of deb.colliders) colliderOwner.delete(c.handle);
  physics.removeRigidBody(deb.body);
  scene.remove(deb.mesh);
  deb.mesh.geometry.dispose();
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

function debrisLocalPoint(deb, p) {
  const t = deb.body.translation(), r = deb.body.rotation();
  _q.set(r.x, r.y, r.z, r.w).invert();
  return _v.set(p.x - t.x, p.y - t.y, p.z - t.z).applyQuaternion(_q).add(deb.com);
}
function debrisWorldPoint(deb, lx, ly, lz, out) {
  const t = deb.body.translation(), r = deb.body.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  return out.set(lx - deb.com.x, ly - deb.com.y, lz - deb.com.z).applyQuaternion(_q).add(t);
}

/** Carves a sphere out of a debris body and re-splits it into connected pieces. */
function carveDebris(deb, p, r, power) {
  const lp = debrisLocalPoint(deb, p).clone();
  const vx = lp.x / VS, vy = lp.y / VS, vz = lp.z / VS, vr = r / VS, gr = vr * 2.2;
  const R = Math.ceil(gr) + 1;
  const { grid, dx, dy, dz } = deb;
  let removed = 0;
  for (let y = Math.max(0, Math.floor(vy - R)); y < Math.min(dy, vy + R + 1); y++)
    for (let z = Math.max(0, Math.floor(vz - R)); z < Math.min(dz, vz + R + 1); z++)
      for (let x = Math.max(0, Math.floor(vx - R)); x < Math.min(dx, vx + R + 1); x++) {
        const i = (y * dz + z) * dx + x, m = grid[i];
        if (!m) continue;
        const d = Math.hypot(x + 0.5 - vx, y + 0.5 - vy, z + 0.5 - vz);
        if ((d <= vr && MAT[m].hard <= power) || (MAT[m].shatter && d <= gr)) {
          grid[i] = 0;
          removed++;
          if (Math.random() < 0.35) {
            debrisWorldPoint(deb, (x + 0.5) * VS, (y + 0.5) * VS, (z + 0.5) * VS, _w);
            chipAt(_w.x, _w.y, _w.z, m);
          }
        }
      }
  if (!removed) return false;
  destroyed += removed;
  splitDebris(deb);
  return true;
}

function splitDebris(deb) {
  const { grid, dx, dy, dz } = deb;
  const seen = new Uint8Array(grid.length);
  const comps = [];
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || seen[s]) continue;
    const list = [s], stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop();
      const x = c % dx, t = (c / dx) | 0, z = t % dz, y = (t / dz) | 0;
      const nb = [];
      if (x > 0) nb.push(c - 1); if (x < dx - 1) nb.push(c + 1);
      if (z > 0) nb.push(c - dx); if (z < dz - 1) nb.push(c + dx);
      if (y > 0) nb.push(c - dx * dz); if (y < dy - 1) nb.push(c + dx * dz);
      for (const n of nb) if (grid[n] && !seen[n]) { seen[n] = 1; stack.push(n); list.push(n); }
    }
    comps.push(list);
  }
  const lv = deb.body.linvel(), av = deb.body.angvel(), r = deb.body.rotation();
  const quat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  const frameOrigin = debrisWorldPoint(deb, 0, 0, 0, new THREE.Vector3());
  removeDebris(deb);
  for (const list of comps) {
    let mnx = dx, mny = dy, mnz = dz, mxx = 0, mxy = 0, mxz = 0;
    for (const c of list) {
      const x = c % dx, t = (c / dx) | 0, z = t % dz, y = (t / dz) | 0;
      mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z);
      mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z);
    }
    if (list.length <= 3) {
      destroyed += list.length;
      continue;
    }
    const ndx = mxx - mnx + 1, ndy = mxy - mny + 1, ndz = mxz - mnz + 1;
    const ng = new Uint8Array(ndx * ndy * ndz);
    for (const c of list) {
      const x = c % dx, t = (c / dx) | 0, z = t % dz, y = (t / dz) | 0;
      ng[((y - mny) * ndz + (z - mnz)) * ndx + (x - mnx)] = grid[c];
    }
    const origin = new THREE.Vector3(mnx * VS, mny * VS, mnz * VS).applyQuaternion(quat).add(frameOrigin);
    createDebris(ng, ndx, ndy, ndz, [deb.noff[0] + mnx, deb.noff[1] + mny, deb.noff[2] + mnz], origin, quat, lv, av);
  }
}

// ---------- destruction API ----------
function destroyAt(p, r, power, glassMul = 2.2, end = null) {
  const removed = carveWorld(p, r, power, glassMul, end);
  if (removed.length) {
    detachFloating(removed);
    for (const c of removed) pendingStructural.push(c);
  }
  for (const deb of [...debris]) {
    const t = deb.body.translation();
    let q = p;
    if (end) { // closest point of the segment to this body
      _w.subVectors(end, p);
      const k = Math.max(0, Math.min(1, _w.dot(_v.set(t.x - p.x, t.y - p.y, t.z - p.z)) / (_w.lengthSq() || 1)));
      q = p.clone().addScaledVector(_w, k);
    }
    if (Math.hypot(t.x - q.x, t.y - q.y, t.z - q.z) < r * glassMul + deb.radius) carveDebris(deb, q, end ? r * 1.4 : r, power);
  }
  flushDirty();
  return removed.length;
}

// ---------- structural integrity ----------
// Cells removed recently; their neighbourhood is re-analysed in a batch shortly after
// (the small delay also reads as the structure "giving way").
const pendingStructural = [];
let structuralTimer = 0;

function dustAt(x, y, z, n, spread) {
  for (let i = 0; i < n; i++) {
    const g = 0.5 + Math.random() * 0.15;
    smoke.spawn(x + (Math.random() - 0.5) * spread, y + Math.random() * 0.5, z + (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3,
      1.2 + Math.random() * 1.5, 0.35 + Math.random() * 0.4, g, g * 0.95, g * 0.85);
  }
}

function runStructural() {
  if (!pendingStructural.length) return;
  const D = world.data, SY = WX * WZ, starts = [];
  for (const r of pendingStructural)
    for (const n of [r + 1, r - 1, r + WX, r - WX, r + SY, r - SY]) if (n >= 0 && n < D.length && D[n]) starts.push(n);
  pendingStructural.length = 0;
  const res = analyzeStructures(D, starts);
  const cellPos = (c) => {
    const x = c % WX, t = (c / WX) | 0;
    return [(x + 0.5) * VS, (((t / WZ) | 0) + 0.5) * VS, ((t % WZ) + 0.5) * VS];
  };
  for (const list of res.fall) spawnFromWorld(list);
  for (const list of res.topple) {
    for (let i = 0; i < 6; i++) {
      const [x, y, z] = cellPos(list[(Math.random() * list.length) | 0]);
      dustAt(x, y, z, 3, 1);
    }
    shake = Math.max(shake, 0.15);
    spawnFromWorld(list);
  }
  for (const { list, feet } of res.crush) {
    // the supports give way: grind away the bottom of every load-bearing column
    for (const f of feet) {
      for (let k = 0, c = f; k < 3 && D[c]; k++, c += SY) {
        const [x, y, z] = cellPos(c);
        chipAt(x, y, z, D[c], 3);
        D[c] = 0;
        destroyed++;
        markDirty(x / VS | 0, y / VS | 0, z / VS | 0);
      }
    }
    for (let i = 0; i < Math.min(12, feet.length); i++) {
      const [x, y, z] = cellPos(feet[(Math.random() * feet.length) | 0]);
      dustAt(x, y, z, 2, 0.6);
    }
    shake = Math.max(shake, 0.2);
    spawnFromWorld(list.filter((c) => D[c]));
  }
  flushDirty();
}

// ---------- impact damage ----------
const IMPACT_DV = 4.5; // m/s of sudden velocity change that counts as a hard hit
const _cp = { x: 0, y: 0, z: 0 };
let impactsThisFrame = 0, impactCount = 0, maxImpactDv = 0;

/** Returns up to `max` world-space contact points of a debris body, strongest first. */
function impactPoints(deb, max = 4) {
  const pts = [];
  for (const col of deb.colliders) {
    physics.contactPairsWith(col, (other) => {
      if (colliderOwner.get(other.handle) === deb) return;
      physics.contactPair(col, other, (man) => {
        const ns = man.numSolverContacts();
        if (!ns) return;
        let imp = 0;
        for (let i = 0; i < man.numContacts(); i++) imp += man.contactImpulse(i);
        for (let i = 0; i < ns; i++) {
          man.solverContactPoint(i, _cp);
          pts.push({ imp: imp / ns, p: new THREE.Vector3(_cp.x, _cp.y, _cp.z) });
        }
      });
    });
  }
  pts.sort((a, b) => b.imp - a.imp);
  const out = [];
  for (const { p } of pts) {
    if (out.length >= max) break;
    if (out.every((q) => q.distanceTo(p) > 0.8)) out.push(p);
  }
  return out;
}

function checkImpacts(dt) {
  impactsThisFrame = 0;
  for (const deb of [...debris]) {
    if (!debris.includes(deb)) continue; // split or removed by an earlier impact this frame
    deb.age += dt;
    deb.impactCd -= dt;
    const v = deb.body.linvel(), pv = deb.prevVel, w = deb.body.angvel(), pw = deb.prevAng;
    // the hit point of a tumbling body moves faster than its centre, so count the spin change too
    const dv = Math.hypot(v.x - pv.x, v.y - pv.y, v.z - pv.z) + Math.hypot(w.x - pw.x, w.y - pw.y, w.z - pw.z) * deb.radius * 0.6;
    deb.prevVel = { x: v.x, y: v.y, z: v.z };
    deb.prevAng = { x: w.x, y: w.y, z: w.z };
    if (dv > maxImpactDv) maxImpactDv = dv;
    if (dv < IMPACT_DV || deb.impactCd > 0 || deb.count < 10 || impactsThisFrame >= 3) continue;
    const pts = impactPoints(deb);
    if (!pts.length) continue;
    deb.impactCd = 0.35;
    impactsThisFrame++;
    impactCount++;
    const e = dv * Math.cbrt(deb.count);
    const power = e > 80 ? 3 : e > 35 ? 2 : e > 12 ? 1 : 0;
    const r = Math.min(1.6, 0.15 + 0.014 * e);
    for (const p of pts) {
      dustAt(p.x, p.y, p.z, Math.min(8, 2 + (e / 15) | 0), r * 2);
      shake = Math.max(shake, Math.min(0.5, e / 400) * Math.max(0, 1 - distTo(camera.position, p) / 40));
      destroyAt(p, r, power);
    }
  }
}

function explode(p, r = 2.2, push = 6, power = 3, color = 0xffb060) {
  destroyAt(p, r, power, r > 2.5 ? 1.6 : 2.2);
  const R = r * 2.6;
  for (const deb of debris) {
    const t = deb.body.translation();
    _v.set(t.x - p.x, t.y - p.y, t.z - p.z);
    const d = _v.length();
    if (d > R) continue;
    deb.impactCd = Math.max(deb.impactCd, 0.3); // a blast push isn't a collision
    _v.normalize().add(new THREE.Vector3(0, 0.35, 0)).normalize();
    const k = deb.body.mass() * push * (1 - d / R);
    deb.body.applyImpulseAtPoint({ x: _v.x * k, y: _v.y * k, z: _v.z * k },
      { x: t.x + (Math.random() - 0.5) * deb.radius, y: t.y + (Math.random() - 0.5) * deb.radius, z: t.z + (Math.random() - 0.5) * deb.radius }, true);
  }
  for (const b of bombs) if (b.fuse > 0.12 && distTo(b.body.translation(), p) < R) b.fuse = 0.12;
  for (const s of projectiles) if (s.kind === 'sticky' && s.fuse > 0.12 && distTo(s.pos, p) < R) s.fuse = 0.12;
  for (const it of items) {
    if (it.taken) continue;
    const t = it.body.translation();
    _v.set(t.x - p.x, t.y - p.y, t.z - p.z);
    const d = _v.length();
    if (d > R) continue;
    _v.normalize().add(new THREE.Vector3(0, 0.6, 0)).normalize().multiplyScalar(it.body.mass() * push * 1.2 * (1 - d / R));
    it.body.applyImpulse(_v, true);
  }
  const pd = distTo(player.body.translation(), p);
  if (pd < R) {
    _v.set(camera.position.x - p.x, camera.position.y - p.y + 0.5, camera.position.z - p.z).normalize();
    player.kick.addScaledVector(_v, 9 * (1 - pd / R));
  }
  shake = Math.max(shake, Math.max(0, 1 - pd / 25) * 0.6);
  for (let i = 0; i < 40; i++) {
    const g = 0.35 + Math.random() * 0.25;
    smoke.spawn(p.x + (Math.random() - 0.5) * r, p.y + (Math.random() - 0.3) * r, p.z + (Math.random() - 0.5) * r,
      (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 1.5 + Math.random() * 1.8, 0.5 + Math.random() * 0.6, g, g, g);
  }
  for (let i = 0; i < 14; i++)
    smoke.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 0.25, 0.7, 4, 2.4, 0.8);
  flash.position.copy(p);
  flash.color.set(color);
  flash.intensity = 400 * Math.max(1, r / 2.2);
}
const distTo = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const flash = new THREE.PointLight(0xffb060, 0, 30, 2);
scene.add(flash);

// ---------- bombs ----------
const bombs = [];
const bombGeo = new THREE.SphereGeometry(0.16, 16, 12);
function throwBomb() {
  if (bombs.length >= 8) return;
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const p = camera.position.clone().addScaledVector(dir, 0.6);
  const body = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
    .setLinvel(dir.x * 13, dir.y * 13 + 2.5, dir.z * 13).setCcdEnabled(true));
  const col = physics.createCollider(RAPIER.ColliderDesc.ball(0.16).setDensity(2500).setRestitution(0.3).setFriction(0.9), body);
  const mesh = new THREE.Mesh(bombGeo, new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2200, emissiveIntensity: 0, roughness: 0.6 }));
  mesh.castShadow = true;
  scene.add(mesh);
  const b = { body, col, mesh, fuse: 2.6 };
  colliderOwner.set(col.handle, b);
  bombs.push(b);
}
function updateBombs(dt) {
  for (const b of [...bombs]) {
    b.fuse -= dt;
    const t = b.body.translation();
    b.mesh.position.copy(t);
    b.mesh.material.emissiveIntensity = Math.sin(b.fuse * (b.fuse < 1 ? 30 : 10)) > 0 ? 3 : 0;
    if (b.fuse <= 0 || t.y < -20) {
      bombs.splice(bombs.indexOf(b), 1);
      colliderOwner.delete(b.col.handle);
      physics.removeRigidBody(b.body);
      scene.remove(b.mesh);
      if (t.y > -20) explode(new THREE.Vector3(t.x, t.y, t.z));
    }
  }
}


// ---------- projectiles: sticky bombs, plasma bolts, black holes ----------
const projectiles = [];
const glowGeo = new THREE.SphereGeometry(1, 16, 12);
const STICKY_FUSE = 3;
const BH_RANGE = 14, BH_TIME = 2.2;

function launchProjectile(kind, speed) {
  if (projectiles.filter((s) => s.kind === kind).length >= (kind === 'sticky' ? 12 : 6)) return;
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const pos = camera.position.clone().addScaledVector(dir, 0.5);
  const vel = dir.clone().multiplyScalar(speed);
  if (kind !== 'plasma') vel.y += 2;
  const mesh = new THREE.Group();
  if (kind === 'sticky') {
    const brick = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.13), new THREE.MeshLambertMaterial({ color: 0x6b6b3a }));
    brick.position.y = 0.04;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    led.position.set(0.06, 0.09, 0);
    brick.castShadow = true;
    mesh.add(brick, led);
    mesh.userData.led = led;
  } else if (kind === 'plasma') {
    const core = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xffe0ff }));
    core.scale.setScalar(0.12);
    const halo = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xb050ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(0.3);
    mesh.add(core, halo);
  } else {
    const core = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    core.scale.setScalar(0.12);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xa040ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.scale.setScalar(0.2);
    ring.rotation.x = 1.3;
    mesh.add(core, ring);
    mesh.userData.core = core;
    mesh.userData.ring = ring;
  }
  mesh.position.copy(pos);
  scene.add(mesh);
  projectiles.push({ kind, pos, vel, mesh, stuck: false, deb: null, local: null, localQ: null, normal: new THREE.Vector3(0, 1, 0), fuse: kind === 'sticky' ? STICKY_FUSE : BH_TIME, age: 0, beepT: 0 });
  beep(kind === 'plasma' ? 180 : 300, kind === 'plasma' ? 0.25 : 0.06, 0.06, kind === 'plasma' ? 'sawtooth' : 'triangle');
}

function removeProjectile(s) {
  projectiles.splice(projectiles.indexOf(s), 1);
  scene.remove(s.mesh);
}

function stick(s, hit) {
  s.stuck = true;
  s.pos.copy(hit.point);
  s.normal.copy(hit.normal);
  s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.normal);
  const owner = colliderOwner.get(hit.collider.handle);
  if (owner && owner.grid) {
    s.deb = owner;
    s.local = debrisLocalPoint(owner, hit.point).clone();
    const r = owner.body.rotation();
    s.localQ = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert().multiply(s.mesh.quaternion);
  }
  if (s.kind === 'sticky') beep(900, 0.05, 0.05, 'square');
}

function blackHoleCollapse(p) {
  for (const deb of debris) {
    const t = deb.body.translation();
    _v.set(t.x - p.x, t.y - p.y, t.z - p.z);
    const d = _v.length();
    if (d < BH_RANGE) deb.body.setLinvel({ x: deb.body.linvel().x * 0.2, y: deb.body.linvel().y * 0.2, z: deb.body.linvel().z * 0.2 }, true);
  }
  destroyAt(p, TOOLS[6].radius, TOOLS[6].power, 1.2);
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), sp = 4 + Math.random() * 6;
    sparkle.spawn(p.x, p.y, p.z, Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp, 0.5 + Math.random() * 0.5, 2, 1.6, 0.6, 3);
  }
  dustAt(p.x, p.y - 2, p.z, 14, 6);
  flash.position.copy(p);
  flash.color.set(0xb060ff);
  flash.intensity = 1200;
  shake = Math.max(shake, Math.max(0, 1 - distTo(camera.position, p) / 40) * 0.8);
  [0, 0.1].forEach((at, i) => beep(90 - i * 30, 0.6, 0.12, 'sawtooth', at));
}

function updateProjectiles(dt) {
  for (const s of [...projectiles]) {
    s.age += dt;
    if (!s.stuck) {
      if (s.kind !== 'plasma') s.vel.y -= 14 * dt;
      const step = s.vel.length() * dt;
      const dir = s.vel.clone().normalize();
      const h = physics.castRayAndGetNormal(new RAPIER.Ray(s.pos, dir), step + 0.05, true, undefined, undefined, player.col);
      if (h) {
        const hit = { point: s.pos.clone().addScaledVector(dir, h.timeOfImpact), normal: new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z), collider: h.collider };
        if (s.kind === 'plasma') {
          removeProjectile(s);
          explode(hit.point.addScaledVector(dir, 0.3), TOOLS[4].radius, 10, TOOLS[4].power, 0xc070ff);
          continue;
        }
        stick(s, hit);
      } else {
        s.pos.addScaledVector(s.vel, dt);
        if (s.kind === 'plasma') {
          for (let i = 0; i < 3; i++)
            sparkle.spawn(s.pos.x + (Math.random() - 0.5) * 0.15, s.pos.y + (Math.random() - 0.5) * 0.15, s.pos.z + (Math.random() - 0.5) * 0.15, 0, 0, 0, 0.35, 1.6, 2.2, 1, 3);
        }
        if (s.pos.y < -20 || s.age > 8) { removeProjectile(s); continue; }
      }
    } else if (s.deb) {
      if (debris.includes(s.deb)) {
        debrisWorldPoint(s.deb, s.local.x, s.local.y, s.local.z, s.pos);
        const r = s.deb.body.rotation();
        s.mesh.quaternion.set(r.x, r.y, r.z, r.w).multiply(s.localQ);
      } else { s.stuck = false; s.deb = null; s.vel.set(0, 0, 0); } // the piece it was on broke up
    } else if (!wget(Math.floor((s.pos.x - s.normal.x * 0.12) / VS), Math.floor((s.pos.y - s.normal.y * 0.12) / VS), Math.floor((s.pos.z - s.normal.z * 0.12) / VS))) {
      s.stuck = false; s.vel.set(0, 0, 0); // the surface it was stuck to is gone
    }
    s.mesh.position.copy(s.pos);

    if (s.kind === 'sticky' && s.stuck) {
      s.fuse -= dt;
      s.beepT -= dt;
      const fast = s.fuse < 1;
      s.mesh.userData.led.visible = Math.sin(s.fuse * (fast ? 30 : 10)) > 0;
      if (s.beepT <= 0) { beep(fast ? 1400 : 1100, 0.04, 0.03, 'square'); s.beepT = fast ? 0.15 : 0.5; }
      if (s.fuse <= 0) { removeProjectile(s); explode(s.pos.clone().addScaledVector(s.normal, 0.15), TOOLS[3].radius, 8, TOOLS[3].power); }
    } else if (s.kind === 'blackhole' && s.stuck) {
      s.fuse -= dt;
      const t = 1 - s.fuse / BH_TIME, p = s.pos.clone().addScaledVector(s.normal, 1.2);
      s.mesh.position.copy(p);
      s.mesh.userData.core.scale.setScalar(0.15 + t * 0.9);
      s.mesh.userData.ring.scale.setScalar(0.4 + t * 1.6);
      s.mesh.userData.ring.rotation.z += dt * (4 + t * 12);
      s.mesh.userData.ring.material.opacity = 0.6 + 0.4 * Math.sin(s.age * 20);
      for (const deb of debris) {
        const q = deb.body.translation();
        _v.set(p.x - q.x, p.y - q.y, p.z - q.z);
        const d = _v.length();
        if (d > BH_RANGE || d < 0.3) continue;
        _v.normalize().multiplyScalar(deb.body.mass() * dt * (9.81 * 0.9 + 30 * (1 - d / BH_RANGE)));
        deb.body.applyImpulse(_v, true);
        deb.impactCd = Math.max(deb.impactCd, 0.2);
      }
      for (const it of items) {
        if (it.taken) continue;
        const q = it.body.translation();
        _v.set(p.x - q.x, p.y - q.y, p.z - q.z);
        const d = _v.length();
        if (d > BH_RANGE || d < 0.5) continue;
        _v.normalize().multiplyScalar(it.body.mass() * dt * (9.81 + 14 * (1 - d / BH_RANGE)));
        it.body.applyImpulse(_v, true);
      }
      const pd = distTo(player.body.translation(), p);
      if (pd < BH_RANGE) player.kick.addScaledVector(_v.set(p.x - camera.position.x, p.y - camera.position.y, p.z - camera.position.z).normalize(), dt * 6 * (1 - pd / BH_RANGE));
      for (let i = 0; i < 4; i++) { // matter spiralling in
        const a = Math.random() * Math.PI * 2, rr = 3 + Math.random() * 4, y = (Math.random() - 0.5) * 3;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        sparkle.spawn(p.x + x, p.y + y, p.z + z, -x * 1.6 - z * 1.2, -y * 1.6, -z * 1.6 + x * 1.2, 0.55, 1.4, 1.2, 0.5, 2.6);
      }
      shake = Math.max(shake, 0.05 + t * 0.15 * Math.max(0, 1 - pd / 30));
      if (s.fuse <= 0) { removeProjectile(s); blackHoleCollapse(p); }
    }
  }
  for (const b of [...railBeams]) {
    b.t -= dt;
    b.mesh.material.opacity = Math.max(0, b.t / 0.5);
    b.mesh.scale.x = b.mesh.scale.z = 1 + (0.5 - b.t) * 3;
    if (b.t <= 0) { scene.remove(b.mesh); b.mesh.geometry.dispose(); railBeams.splice(railBeams.indexOf(b), 1); }
  }
}

const railBeams = [];
const RAIL_LEN = 30;

function fireRailgun() {
  const T = TOOLS[5];
  const hit = aimRay(T.range);
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const start = new THREE.Vector3(0.32, -0.25, -1.1).applyMatrix4(camera.matrixWorld);
  const from = hit ? hit.point.clone().addScaledVector(dir, -0.2) : camera.position.clone().addScaledVector(dir, T.range);
  const to = from.clone().addScaledVector(dir, hit ? RAIL_LEN : 0);
  const len = start.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x70f8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.position.copy(start).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v.subVectors(to, start).normalize());
  scene.add(mesh);
  railBeams.push({ mesh, t: 0.5 });
  beep(1800, 0.3, 0.07, 'sawtooth');
  beep(120, 0.4, 0.1, 'square', 0.02);
  shake = Math.max(shake, 0.25);
  player.kick.addScaledVector(dir, -2.5);
  if (!hit) return;
  for (let i = 0; i < 60; i++) {
    const k = Math.random();
    const p = from.clone().lerp(to, k);
    sparkle.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.6, 1.2, 0.8, 2.4, 3);
  }
  // shove what's in the way along the shot
  for (const deb of debris) {
    const t = deb.body.translation();
    _v.set(t.x - from.x, t.y - from.y, t.z - from.z);
    const k = Math.max(0, Math.min(RAIL_LEN, _v.dot(dir)));
    if (_w.copy(from).addScaledVector(dir, k).distanceTo(t) < deb.radius + 1) {
      const m = deb.body.mass() * 6;
      deb.body.applyImpulse({ x: dir.x * m, y: dir.y * m, z: dir.z * m }, true);
    }
  }
  destroyAt(from, T.radius, T.power, 1.4, to);
  for (let i = 0; i < 6; i++) dustAt(from.x + dir.x * i * 5, from.y + dir.y * i * 5, from.z + dir.z * i * 5, 2, 1);
}

// ---------- mini-map: top-down view of the destructible area, north up ----------
const miniEl = document.getElementById('mini');
const miniCanvas = miniEl.querySelector('canvas'), miniCtx = miniCanvas.getContext('2d');
const miniBase = Object.assign(document.createElement('canvas'), { width: WX, height: WZ });
const miniBaseCtx = miniBase.getContext('2d');
const MAT_SRGB = MAT.map((m) => (m ? [(m.color >> 16) & 255, (m.color >> 8) & 255, m.color & 255] : null));
let miniShown = localStorage.getItem('vw-minimap') !== 'off', miniDestroyed = -1, miniT = 0;
// colour of the highest voxel in each column, brighter the taller it is
function renderMiniBase() {
  const img = miniBaseCtx.createImageData(WX, WZ), d = img.data;
  for (let z = 0; z < WZ; z++)
    for (let x = 0; x < WX; x++) {
      let y = WY - 1, m = 0;
      for (; y >= 0 && !(m = world.data[(y * WZ + z) * WX + x]); y--);
      const o = (z * WX + x) * 4, c = MAT_SRGB[m] ?? [24, 24, 28], k = m ? 0.55 + 0.45 * Math.min(1, Math.max(0, y - G + 1) / 40) : 1;
      d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255;
    }
  miniBaseCtx.putImageData(img, 0, 0);
}
function updateMiniMap(dt, now) {
  miniEl.style.display = miniShown ? 'block' : 'none';
  if (!miniShown) return;
  miniT -= dt;
  if (miniT <= 0 && miniDestroyed !== destroyed) { miniDestroyed = destroyed; miniT = 1; renderMiniBase(); }
  const S = miniCanvas.width, k = S / (WX * VS);
  miniCtx.imageSmoothingEnabled = false;
  miniCtx.drawImage(miniBase, 0, 0, S, S);
  const p = camera.position;
  const edge = Math.min(p.x, p.z, WX * VS - p.x, WZ * VS - p.z);
  const near = edge < 4;
  miniEl.classList.toggle('edge', near);
  miniCtx.lineWidth = near ? 6 : 2;
  miniCtx.strokeStyle = near ? `rgba(255,80,60,${0.55 + 0.45 * Math.sin(now / 110)})` : '#ffffff55';
  miniCtx.strokeRect(0, 0, S, S);
  const dir = camera.getWorldDirection(_v);
  miniCtx.save();
  miniCtx.translate(THREE.MathUtils.clamp(p.x * k, 0, S), THREE.MathUtils.clamp(p.z * k, 0, S));
  miniCtx.rotate(Math.atan2(dir.z, dir.x));
  miniCtx.beginPath();
  miniCtx.moveTo(8, 0); miniCtx.lineTo(-5, -5); miniCtx.lineTo(-2, 0); miniCtx.lineTo(-5, 5); miniCtx.closePath();
  miniCtx.fillStyle = '#ffd23f';
  miniCtx.strokeStyle = '#000';
  miniCtx.lineWidth = 1.5;
  miniCtx.fill();
  miniCtx.stroke();
  miniCtx.restore();
}

// ---------- loot hunt ----------
const PICKUP_R = 0.8, PICKUP_DY = 1.1;
const items = [];
const hunt = { seed: 1, time: 0, points: 0, found: 0, total: 0, maxPoints: 0, over: false, started: false, detector: localStorage.getItem('vw-detector') !== 'off', tick: 0 };
const sparkle = new Particles(400, 0.06, { gravity: -0.5, drag: 1.5, lit: false });

let audio = null;
function beep(freq, dur = 0.08, vol = 0.05, type = 'sine', at = 0) {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime + at, o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* audio unavailable */ }
}

function makeItemMesh(kind) {
  const c = LOOT_KINDS[kind].color;
  const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 });
  const g = new THREE.Group(), spin = new THREE.Group();
  g.add(spin);
  if (kind === 'gold') spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.14), mat));
  else if (kind === 'gem') spin.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.15), mat));
  else {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8 }));
    pole.position.y = 0.1;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.01), mat);
    cloth.position.set(0.12, 0.27, 0);
    spin.add(pole, cloth);
  }
  spin.traverse((m) => (m.castShadow = true));
  g.userData.spin = spin;
  return g;
}

function clearItems() {
  for (const it of items) {
    if (!it.taken) { colliderOwner.delete(it.col.handle); physics.removeRigidBody(it.body); }
    scene.remove(it.mesh);
  }
  items.length = 0;
}

function createItems(specs) {
  for (const s of specs) {
    const body = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(s.x, s.y, s.z)
      .setCanSleep(false).setCcdEnabled(true).setAngularDamping(3).setLinearDamping(0.2));
    const col = physics.createCollider(RAPIER.ColliderDesc.ball(0.15).setDensity(3000).setFriction(1).setRestitution(0.2), body);
    const mesh = makeItemMesh(s.kind);
    scene.add(mesh);
    const it = { ...s, body, col, mesh, home: new THREE.Vector3(s.x, s.y, s.z), taken: false, phase: Math.random() * 6 };
    colliderOwner.set(col.handle, it);
    items.push(it);
  }
  hunt.total = items.length;
  hunt.maxPoints = items.reduce((a, it) => a + LOOT_KINDS[it.kind].value, 0);
}

function collect(it) {
  it.taken = true;
  const t = it.body.translation(), K = LOOT_KINDS[it.kind];
  colliderOwner.delete(it.col.handle);
  physics.removeRigidBody(it.body);
  scene.remove(it.mesh);
  hunt.points += K.value;
  hunt.found++;
  const c = new THREE.Color(K.color);
  for (let i = 0; i < 40; i++)
    sparkle.spawn(t.x, t.y, t.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.6 + Math.random() * 0.6, 1, c.r * 3, c.g * 3, c.b * 3);
  [0, 0.07, 0.14].forEach((at, i) => beep(660 * Math.pow(1.26, i + (K.value - 1)), 0.18, 0.08, 'triangle', at));
  toast(`${K.name} +${K.value} <small>(${it.where})</small>`);
  if (hunt.found === hunt.total) endHunt();
}

function updateItems(dt) {
  const p = player.body.translation();
  for (const it of items) {
    if (it.taken) continue;
    const t = it.body.translation();
    if (t.y < -10) { // lost off the map: put it back where it started
      it.body.setTranslation(it.home, true);
      it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      continue;
    }
    it.phase += dt;
    it.mesh.position.set(t.x, t.y - 0.02, t.z);
    it.mesh.userData.spin.rotation.y = it.phase * 1.6;
    it.mesh.userData.spin.position.y = Math.sin(it.phase * 2.5) * 0.03;
    if (Math.random() < dt * 3) {
      const c = new THREE.Color(LOOT_KINDS[it.kind].color);
      sparkle.spawn(t.x + (Math.random() - 0.5) * 0.3, t.y + 0.1, t.z + (Math.random() - 0.5) * 0.3, 0, 0.4, 0, 0.8, 0.8, c.r * 2, c.g * 2, c.b * 2);
    }
    if (!hunt.over && Math.hypot(t.x - p.x, t.z - p.z) < PICKUP_R && Math.abs(t.y - p.y) < PICKUP_DY) collect(it);
  }
  sparkle.update(dt);
}

function nearestItemDist() {
  const c = camera.position;
  let best = Infinity;
  for (const it of items) if (!it.taken) best = Math.min(best, distTo(c, it.body.translation()));
  return best;
}

let toastTimer = 0;
function toast(html, secs = 2.5) {
  hud.toast.innerHTML = html;
  hud.toast.style.opacity = 1;
  toastTimer = secs;
}

const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
let mapIndex = Math.max(0, MAPS.findIndex((m) => m.id === localStorage.getItem('vw-map')));
// the farm keeps the original key so earlier times survive
const boardKey = () => (MAPS[mapIndex].id === 'farm' ? 'vw-leaderboard' : `vw-leaderboard-${MAPS[mapIndex].id}`);
function loadBoard() {
  try { return JSON.parse(localStorage.getItem(boardKey())) ?? []; } catch { return []; }
}
function renderBoard(highlight) {
  const board = loadBoard();
  const html = board.length
    ? `<table>${board.map((r, i) => `<tr class="${r.at === highlight ? 'me' : ''}"><td>${i + 1}.</td><td><b>${fmtTime(r.time)}</b></td>` +
      `<td>${new Date(r.at).toLocaleDateString()} ${new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>${r.destruction}% destroyed</td></tr>`).join('')}</table>`
    : '<p class="empty">No results yet. Find all the loot to set the first time!</p>';
  document.querySelectorAll('.board').forEach((el) => (el.innerHTML = html));
  document.querySelectorAll('.board-title').forEach((el) => (el.textContent = `🏆 Best times · ${MAPS[mapIndex].name.replace(/^\S+\s/, '')}`));
}

function setDetector(on) {
  hunt.detector = on;
  localStorage.setItem('vw-detector', on ? 'on' : 'off');
  document.querySelectorAll('.sound-toggle').forEach((b) => (b.textContent = on ? '🔊 Detector sound: on' : '🔇 Detector sound: off'));
}

function endHunt() {
  if (hunt.over) return;
  hunt.over = true;
  const entry = { time: hunt.time, at: Date.now(), destruction: +((100 * destroyed) / initialDestructible).toFixed(1) };
  const board = [...loadBoard(), entry].sort((a, b) => a.time - b.time).slice(0, 10);
  localStorage.setItem(boardKey(), JSON.stringify(board));
  const rank = board.indexOf(entry) + 1;
  hud.endTitle.textContent = 'All loot found!';
  hud.endBody.innerHTML = `Your time <b style="font-size:22px">${fmtTime(hunt.time)}</b> · ${hunt.points} points` +
    (rank ? `<br><span style="color:#ffb347">${rank === 1 ? 'New record!' : `#${rank} on the leaderboard`}</span>` : '<br>Not in the top 10 this time');
  renderBoard(rank ? entry.at : null);
  [0, 0.12, 0.24, 0.4].forEach((at, i) => beep(520 * Math.pow(1.19, i), 0.25, 0.08, 'triangle', at));
  if (controls.isLocked) controls.unlock();
  else showOverlay();
}

function updateHunt(dt) {
  if (controls.isLocked && !hunt.over) {
    hunt.started = true;
    hunt.time += dt;
  }
  const d = nearestItemDist(), sig = isFinite(d) ? Math.max(0, Math.min(1, 1 - d / 30)) : 0;
  hud.signalFill.style.width = `${(sig * 100).toFixed(0)}%`;
  hud.signalFill.style.background = sig > 0.8 ? '#ff4a3d' : sig > 0.55 ? '#ffb347' : '#5fc8ff';
  hud.signalText.textContent = !isFinite(d) ? '—' : sig > 0.85 ? 'Very hot' : sig > 0.65 ? 'Hot' : sig > 0.45 ? 'Warm' : sig > 0.2 ? 'Cold' : 'Freezing';
  // detector clicks speed up as you close in
  hunt.tick -= dt;
  if (hunt.detector && controls.isLocked && !hunt.over && sig > 0.2 && hunt.tick <= 0) {
    beep(500 + sig * 900, 0.04, 0.025, 'square');
    hunt.tick = 1.6 - sig * 1.45;
  }
  hud.hunt.innerHTML = `Loot <b>${hunt.found}/${hunt.total}</b> · Points <b>${hunt.points}</b> · ⏱ <b>${fmtTime(hunt.time)}</b>`;
  hud.signalSound.textContent = hunt.detector ? '🔊' : '🔇';
  toastTimer -= dt;
  if (toastTimer < 0.5) hud.toast.style.opacity = Math.max(0, toastTimer / 0.5);
}

// ---------- player ----------
const SPAWN = new THREE.Vector3();
let spawnYaw = 0;
function setSpawn({ x, z, yaw }) { SPAWN.set((x + 0.5) * VS, G * VS + 1.0, (z + 0.5) * VS); spawnYaw = yaw; }
setSpawn(MAPS[mapIndex].spawn);
const player = { body: null, col: null, vy: 0, grounded: false, kick: new THREE.Vector3() };
player.body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SPAWN.x, SPAWN.y, SPAWN.z));
player.col = physics.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.3), player.body);
const cc = physics.createCharacterController(0.02);
cc.enableAutostep(0.4, 0.12, false);
cc.enableSnapToGround(0.3);
cc.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
cc.setApplyImpulsesToDynamicBodies(true);

const controls = new PointerLockControls(camera, renderer.domElement);
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  const dg = /^Digit([1-9])$/.exec(e.code);
  if (dg && +dg[1] <= TOOLS.length) setTool(+dg[1] - 1);
  if (e.code === 'KeyR') resetLevel();
  if (e.code === 'KeyT') setEnvironment(envIndex + 1);
  if (e.code === 'KeyL') { setTorch(!torchOn); toast(`Flashlight ${torchOn ? 'on' : 'off'}`, 1); }
  if (e.code === 'KeyM') { miniShown = !miniShown; localStorage.setItem('vw-minimap', miniShown ? 'on' : 'off'); toast(`Mini-map ${miniShown ? 'on' : 'off'}`, 1); }
  if (e.code === 'KeyF') { setDetector(!hunt.detector); toast(`Detector sound ${hunt.detector ? 'on' : 'off'}`, 1.2); }
});
addEventListener('keyup', (e) => keys.delete(e.code));

function updatePlayer(dt) {
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const wish = new THREE.Vector3();
  if (controls.isLocked) {
    if (keys.has('KeyW')) wish.add(fwd);
    if (keys.has('KeyS')) wish.sub(fwd);
    if (keys.has('KeyD')) wish.add(right);
    if (keys.has('KeyA')) wish.sub(right);
    if (keys.has('Space') && player.grounded) { player.vy = 5.6; player.grounded = false; }
  }
  if (wish.lengthSq()) wish.normalize().multiplyScalar(keys.has('ShiftLeft') ? 8 : 4.6);
  player.vy -= 18 * dt;
  player.kick.multiplyScalar(Math.exp(-3 * dt));
  const desired = {
    x: (wish.x + player.kick.x) * dt,
    y: (player.vy + player.kick.y) * dt,
    z: (wish.z + player.kick.z) * dt,
  };
  cc.computeColliderMovement(player.col, desired);
  const mv = cc.computedMovement();
  player.grounded = cc.computedGrounded();
  if (player.grounded && player.vy < 0) player.vy = 0;
  if (player.vy > 0 && mv.y < desired.y * 0.5) player.vy = 0;
  const p = player.body.translation();
  let nx = p.x + mv.x, ny = p.y + mv.y, nz = p.z + mv.z;
  if (ny < -10) { nx = SPAWN.x; ny = SPAWN.y; nz = SPAWN.z; player.vy = 0; }
  player.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
  camera.position.set(nx, ny + 0.62, nz);
}

// ---------- tools ----------
const TOOLS = [
  { name: 'Sledgehammer', key: 1, range: 2.6, radius: 0.5, power: 2, cooldown: 0.38, desc: 'Breaks glass, wood, plaster and brick' },
  { name: 'Blaster', key: 2, range: 90, radius: 0.32, power: 1, cooldown: 0.12, desc: 'Long range. Shatters glass, chews wood' },
  { name: 'Bomb', key: 3, range: 0, radius: 2.2, power: 3, cooldown: 0.5, desc: 'Throw it. Bounces, 2.6 s fuse' },
  { name: 'Sticky bomb', key: 4, range: 0, radius: 2.6, power: 4, cooldown: 0.45, desc: 'Sticks where it lands. Boom in 3 s' },
  { name: 'Plasma cannon', key: 5, range: 0, radius: 3.2, power: 4, cooldown: 0.9, desc: 'Energy bolt. Huge crater' },
  { name: 'Railgun', key: 6, range: 120, radius: 0.85, power: 5, cooldown: 1.6, desc: 'Bores a 30 m tunnel, even steel' },
  { name: 'Black hole', key: 7, range: 0, radius: 4, power: 5, cooldown: 4, desc: 'Sucks things in, then erases them' },
];
let tool = 0, cooldown = 0, swing = 0;

const viewmodels = TOOLS.map(() => new THREE.Group());
{
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6b7079, metalness: 0.6, roughness: 0.4 });
  const hammer = viewmodels[0];
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), wood);
  handle.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.11), steel);
  head.position.y = 0.5;
  hammer.add(handle, head);
  const gun = viewmodels[1];
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.45), new THREE.MeshLambertMaterial({ color: 0x2f3a44 }));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10), steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.33);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), new THREE.MeshBasicMaterial({ color: 0x40e0ff }));
  glow.position.set(0.055, 0.02, 0);
  gun.add(bodyM, barrel, glow);
  const bombVm = viewmodels[2];
  bombVm.add(new THREE.Mesh(bombGeo, new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2200, emissiveIntensity: 0.12, roughness: 0.5 })));
  bombVm.userData.scale = 0.45;
  const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const sticky = viewmodels[3];
  const brick = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.13), new THREE.MeshLambertMaterial({ color: 0x6b6b3a }));
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), glowMat(0xff2020));
  led.position.set(0.06, 0.05, 0);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.085, 0.03), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  sticky.add(brick, led, tape);
  sticky.userData.led = led;
  const plasma = viewmodels[4];
  const pbody = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x30283f, metalness: 0.7, roughness: 0.35 }));
  pbody.rotation.x = Math.PI / 2;
  plasma.add(pbody);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 8, 20), glowMat(0xc060ff));
    ring.position.z = -0.12 - i * 0.1;
    plasma.add(ring);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), glowMat(0xf0c0ff));
  core.position.z = -0.27;
  plasma.add(core);
  plasma.userData.core = core;
  const rail = viewmodels[5];
  const rbody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 }));
  rbody.position.z = 0.05;
  rail.add(rbody);
  for (const x of [-0.04, 0.04]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.75), steel);
    r.position.set(x, 0.02, -0.35);
    rail.add(r);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.7), glowMat(0x40f0ff));
  strip.position.set(0, 0.02, -0.33);
  rail.add(strip);
  rail.userData.strip = strip;
  const bh = viewmodels[6];
  bh.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x050008 })));
  const bhRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 8, 32), glowMat(0xa040ff));
  bhRing.rotation.x = 1.2;
  bh.add(bhRing);
  bh.userData.ring = bhRing;
  for (const v of viewmodels) {
    v.position.set(0.36, -0.36, -0.7);
    v.scale.setScalar(v.userData.scale ?? 0.75);
    v.visible = false;
    camera.add(v);
  }
}
const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0x80f0ff, transparent: true, opacity: 0 }));
beam.frustumCulled = false;
scene.add(beam);

function setTool(i) {
  tool = i;
  viewmodels.forEach((v, j) => (v.visible = j === i));
  document.querySelectorAll('.tool').forEach((el, j) => { el.classList.toggle('active', j === i); el.querySelector('i').style.height = '0'; });
  toolName.innerHTML = `${TOOLS[i].name}<small>${TOOLS[i].desc}</small>`;
  toolShowT = 2.5;
}

function aimRay(maxDist) {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const o = camera.position;
  const hit = physics.castRay(new RAPIER.Ray(o, dir), maxDist, true, undefined, undefined, player.col);
  if (!hit) return null;
  return { point: o.clone().addScaledVector(dir, hit.timeOfImpact), dir, collider: hit.collider };
}

function useTool() {
  if (cooldown > 0) return;
  const T = TOOLS[tool];
  cooldown = T.cooldown;
  if (tool === 2) { throwBomb(); swing = 1; return; }
  swing = 1;
  if (tool === 3) { launchProjectile('sticky', 16); return; }
  if (tool === 4) { launchProjectile('plasma', 55); return; }
  if (tool === 6) { launchProjectile('blackhole', 14); return; }
  if (tool === 5) { fireRailgun(); return; }
  const hit = aimRay(T.range);
  if (tool === 1) {
    const end = hit ? hit.point : camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), T.range);
    const start = new THREE.Vector3(0.32, -0.25, -0.9).applyMatrix4(camera.matrixWorld);
    beam.geometry.setFromPoints([start, end]);
    beam.material.opacity = 1;
  }
  if (!hit) return;
  const owner = colliderOwner.get(hit.collider.handle);
  const p = hit.point.clone().addScaledVector(hit.dir, 0.1);
  if (owner && owner.fuse !== undefined) { owner.fuse = 0.05; return; }
  if (owner && owner.kind) {
    const k = owner.body.mass() * (tool === 0 ? 4 : 2);
    owner.body.applyImpulse({ x: hit.dir.x * k, y: hit.dir.y * k + k * 0.4, z: hit.dir.z * k }, true);
    return;
  }
  let n;
  if (owner) {
    n = carveDebris(owner, p, T.radius, T.power) ? 1 : 0;
    if (owner.body && debris.includes(owner)) {
      const k = owner.body.mass() * (tool === 0 ? 1.2 : 0.4);
      owner.body.applyImpulseAtPoint({ x: hit.dir.x * k, y: hit.dir.y * k, z: hit.dir.z * k }, hit.point, true);
    }
    flushDirty();
  } else {
    n = destroyAt(p, T.radius, T.power);
  }
  if (!n) for (let i = 0; i < 6; i++) chips.spawn(hit.point.x, hit.point.y, hit.point.z,
    (Math.random() - 0.5) * 3 - hit.dir.x * 2, Math.random() * 3, (Math.random() - 0.5) * 3 - hit.dir.z * 2, 0.3, 0.25, 3, 2.4, 1.2);
}

let mouseDown = false;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) { controls.lock(); return; }
  if (e.button === 0) mouseDown = true;
});
addEventListener('mouseup', () => (mouseDown = false));
addEventListener('wheel', (e) => setTool((tool + (e.deltaY > 0 ? 1 : TOOLS.length - 1)) % TOOLS.length));

// ---------- HUD ----------
const hud = {
  overlay: document.getElementById('overlay'),
  stats: document.getElementById('stats'),
  toolbar: document.getElementById('toolbar'),
  hunt: document.getElementById('hunt'),
  toast: document.getElementById('toast'),
  signalFill: document.querySelector('#signal i'),
  signalText: document.querySelector('#signal span'),
  signalSound: document.querySelector('#signal em'),
  intro: document.getElementById('intro'),
  end: document.getElementById('end'),
  endTitle: document.querySelector('#end h1'),
  endBody: document.querySelector('#end p'),
};
// 24×24 line icons for the hotbar
const TOOL_ICONS = [
  '<path d="M4 5h9v6H4zM13 8h2M15 8l5 12"/>',
  '<path d="M3 8h14l2 2v3H9l-1 7H4l1-7H3zM17 9h4"/>',
  '<circle cx="11" cy="14" r="6"/><path d="M15 9l2-2M17 7c1-2 3-2 4-1"/>',
  '<circle cx="12" cy="11" r="6"/><path d="M8 16v4M12 17v3M16 16v4"/>',
  '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="3 3"/>',
  '<path d="M2 9h18M2 15h18M20 7v10M5 12h17"/>',
  '<path d="M12 12m-2 0a2 2 0 1 0 4 0a4 4 0 1 0 -8 0a6 6 0 1 0 12 0a8 8 0 1 0 -16 0"/>',
];
hud.toolbar.innerHTML = TOOLS.map((t, i) =>
  `<div class="tool" title="${t.name}"><b>${t.key}</b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${TOOL_ICONS[i]}</svg><i></i></div>`).join('');
const toolName = document.getElementById('toolname');
const toolSlots = [...hud.toolbar.children];
let toolShowT = 0;
// name and description float above the bar for a moment after switching; the bar dims when idle
function updateToolbar(dt) {
  toolShowT -= dt;
  toolName.style.opacity = toolShowT > 0 ? Math.min(1, toolShowT / 0.4) : 0;
  hud.toolbar.classList.toggle('idle', toolShowT < -1.5);
  const cd = TOOLS[tool].cooldown;
  toolSlots[tool].querySelector('i').style.height = `${Math.max(0, cooldown / cd) * 100}%`;
}
controls.addEventListener('lock', () => (hud.overlay.style.display = 'none'));
function showOverlay() {
  hud.overlay.style.display = 'flex';
  hud.intro.style.display = hunt.over ? 'none' : 'block';
  hud.end.style.display = hunt.over ? 'block' : 'none';
}
controls.addEventListener('unlock', showOverlay);
document.querySelectorAll('.sound-toggle').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setDetector(!hunt.detector); }));
setDetector(hunt.detector);
renderBoard();
hud.overlay.addEventListener('click', (e) => {
  if (e.target.closest('.board')) return;
  if (hunt.over) resetLevel();
  controls.lock();
});

// ---------- level lifecycle ----------
function resetLevel(seed = (Math.random() * 2 ** 31) | 0) {
  for (const d of [...debris]) removeDebris(d);
  for (const b of [...bombs]) { b.fuse = 1e9; physics.removeRigidBody(b.body); scene.remove(b.mesh); colliderOwner.delete(b.col.handle); }
  bombs.length = 0;
  for (const p of [...projectiles]) removeProjectile(p);
  for (const b of railBeams) scene.remove(b.mesh);
  railBeams.length = 0;
  pendingStructural.length = 0;
  clearItems();
  const map = MAPS[mapIndex];
  buildLevel(world, map);
  const specs = placeLoot(world, seed, map);
  setSpawn(map.spawn);
  placeLamps(map.lamps);
  buildScenery(map);
  initialDestructible = countDestructible(world);
  destroyed = 0;
  for (let i = 0; i < chunks.length; i++) rebuildChunk(i);
  createItems(specs);
  miniDestroyed = -1;
  miniT = 0;
  Object.assign(hunt, { seed, time: 0, points: 0, found: 0, over: false, started: false });
  hud.intro.style.display = 'block';
  hud.end.style.display = 'none';
  player.body.setTranslation({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, true);
  player.vy = 0;
  player.kick.set(0, 0, 0);
  camera.position.set(SPAWN.x, SPAWN.y + 0.62, SPAWN.z);
  camera.rotation.set(0, spawnYaw, 0);
}

function setMap(i) {
  mapIndex = (i + MAPS.length) % MAPS.length;
  localStorage.setItem('vw-map', MAPS[mapIndex].id);
  document.querySelectorAll('.map-btn').forEach((b) => b.classList.toggle('on', +b.dataset.i === mapIndex));
  document.querySelectorAll('.map-desc').forEach((el) => (el.textContent = MAPS[mapIndex].desc));
  resetLevel();
  renderBoard();
}


// ---------- environments: time of day, weather, lamps, flashlight ----------
const C = (h) => new THREE.Color(h);
const dirFrom = (elev, azim) => {
  const e = THREE.MathUtils.degToRad(elev), a = THREE.MathUtils.degToRad(azim);
  return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
};
const ENV_KEYS_C = ['light', 'hs', 'hg', 'top', 'hor', 'sun'];
const ENV_KEYS_N = ['li', 'hi', 'fogNear', 'fogFar', 'exp', 'stars', 'lamps', 'glow', 'disc', 'moon', 'rain', 'night'];
const preset = (o) => ({ disc: 1, moon: 0, stars: 0, lamps: 0, rain: 0, night: 0, glow: 0.3, exp: 1, sun: o.light, ...o, dir: dirFrom(o.elev, o.azim) });
const ENVS = [
  { id: 'day', name: '☀️ Day', p: preset({ elev: 57, azim: -146, light: 0xfff1dc, li: 2.6, hs: 0xdfefff, hg: 0x4a4030, hi: 1.1, top: 0x5b97d4, hor: 0xb4d6ec, fogNear: 35, fogFar: 140, glow: 0.25 }) },
  { id: 'sunset', name: '🌇 Sunset', p: preset({ elev: 7, azim: -70, light: 0xff8c42, li: 3.4, hs: 0xffa47e, hg: 0x2c2230, hi: 0.5, top: 0x2b3d6c, hor: 0xf08a58, sun: 0xffb070, fogNear: 30, fogFar: 170, exp: 1.1, stars: 0.12, lamps: 0.6, glow: 1.3 }) },
  { id: 'night', name: '🌙 Night', p: preset({ elev: 38, azim: 150, light: 0x9db4ff, li: 0.5, hs: 0x24345a, hg: 0x0a0a12, hi: 0.32, top: 0x01030a, hor: 0x0b1428, sun: 0x000000, fogNear: 18, fogFar: 110, exp: 1.25, stars: 1, lamps: 1, glow: 0, disc: 0, moon: 1, night: 1 }) },
  { id: 'fog', name: '🌫️ Foggy dawn', p: preset({ elev: 11, azim: 40, light: 0xffc9a6, li: 1.4, hs: 0xcfd6e6, hg: 0x6a5a50, hi: 0.9, top: 0x9aa6c0, hor: 0xe3cdc4, sun: 0xffd8b8, fogNear: 2, fogFar: 46, lamps: 0.4, glow: 0.7 }) },
  { id: 'storm', name: '⛈️ Storm', p: preset({ elev: 50, azim: -100, light: 0xa8b8c8, li: 0.55, hs: 0x6c7682, hg: 0x2a2a26, hi: 0.6, top: 0x22282f, hor: 0x48505a, sun: 0x000000, fogNear: 10, fogFar: 85, lamps: 0.8, glow: 0, disc: 0, rain: 1 }) },
  { id: 'cycle', name: '🔄 Day cycle', p: null },
];
const CYCLE_LEN = 240; // seconds per full day
const cur = { ...preset(ENVS[0].p), dir: ENVS[0].p.dir.clone() };
for (const k of ENV_KEYS_C) cur[k] = C(cur[k]);
for (const e of ENVS) if (e.p) for (const k of ENV_KEYS_C) e.p[k] = C(e.p[k]);
const tmpEnv = { dir: new THREE.Vector3() };
for (const k of ENV_KEYS_C) tmpEnv[k] = new THREE.Color();
let envIndex = Math.max(0, ENVS.findIndex((e) => e.id === localStorage.getItem('vw-env')));
let cycleTime = CYCLE_LEN * 0.22, envBlend = 0;

// sky dome with sun glow, stars and a moon; follows the camera
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: C(0) }, hor: { value: C(0) }, sun: { value: C(0) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: 0 }, disc: { value: 1 } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top, hor, sun, sunDir; uniform float glow, disc; varying vec3 vDir;
    void main() {
      float h = vDir.y;
      vec3 col = mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.55));
      float d = max(dot(normalize(vDir), sunDir), 0.0);
      col += sun * (glow * (0.35 * pow(d, 6.0) + 0.6 * pow(d, 64.0)) * (1.0 - 0.6 * clamp(h, 0.0, 1.0)));
      col = mix(col, sun * 6.0, disc * smoothstep(0.9993, 0.9996, d));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -1;
scene.add(sky);
const stars = (() => {
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, y = 0.04 + Math.random() * 0.96, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 280, y * 280, Math.sin(a) * r * 280], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
})();
const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe4ebff, transparent: true, fog: false, depthWrite: false }));
sky.add(stars, moon);

// flashlight held by the player; casts its own shadows
const torch = new THREE.SpotLight(0xfff2dc, 0, 45, 0.42, 0.5, 1.2);
torch.position.set(-0.35, -0.15, 0.15);
torch.target.position.set(-0.05, -0.1, -6);
torch.castShadow = true;
torch.shadow.mapSize.set(1024, 1024);
torch.shadow.bias = -0.0006;
torch.shadow.normalBias = 0.03;
torch.shadow.camera.near = 0.2;
camera.add(torch, torch.target);
let torchOn = false, lastAutoTorch = null;
function setTorch(on) { torchOn = on; beep(on ? 1500 : 900, 0.03, 0.04, 'square'); }

// lamps: [x, y, z] in voxels; the light hangs under voxel (x, y, z) and dies when it is destroyed.
// There are always LAMP_N lights so switching maps never recompiles shaders; unused ones stay dark.
const LAMP_N = 10;
const bulbGeo = new THREE.SphereGeometry(0.09, 10, 8);
const lamps = Array.from({ length: LAMP_N }, () => {
  const light = new THREE.SpotLight(0xffc27a, 0, 7, 1.15, 0.8, 1);
  const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  cord.position.y = 0.14;
  bulb.add(cord);
  scene.add(light, light.target, bulb);
  return { x: 0, y: 0, z: 0, light, bulb, dead: true, flick: 0 };
});
function placeLamps(spots) {
  lamps.forEach((l, i) => {
    const s = spots[i];
    l.flick = 0;
    l.dead = !s;
    l.bulb.visible = !!s;
    l.light.intensity = 0;
    if (!s) return;
    [l.x, l.y, l.z] = s;
    l.light.position.set((l.x + 0.5) * VS, l.y * VS - 0.25, (l.z + 0.5) * VS);
    l.light.target.position.copy(l.light.position).add(new THREE.Vector3(0, -3, 0));
    l.bulb.position.copy(l.light.position);
  });
}

// water surfaces, plus streets, rivers and buildings beyond the edge so maps don't float in a field
const scenery = new THREE.Group();
scene.add(scenery);
const waterMat = new THREE.MeshLambertMaterial({ color: 0x2c5d74, transparent: true, opacity: 0.8, depthWrite: false });
const farWaterMat = new THREE.MeshLambertMaterial({ color: 0x2c5d74 });
const asphaltMat = new THREE.MeshLambertMaterial({ color: MAT[M.asphalt].color });
const paveMat = new THREE.MeshLambertMaterial({ color: MAT[M.pavement].color });
function buildScenery(map) {
  for (const c of [...scenery.children]) { scenery.remove(c); c.geometry.dispose(); }
  const L = WX * VS, D = WZ * VS, gy = G * VS, FAR = 320;
  const plane = (x0, z0, x1, z1, y, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    scenery.add(m);
  };
  const bd = map.backdrop, strips = [];
  for (const wt of map.water) {
    plane(0, wt.z0 * VS, L, wt.z1 * VS, wt.y * VS, waterMat);
    for (const [x0, x1] of [[-FAR, 0], [L, L + FAR]]) plane(x0, wt.z0 * VS, x1, wt.z1 * VS, gy - 0.01, farWaterMat);
  }
  for (const [z0, z1] of bd.rivers ?? []) strips.push({ z0: z0 * VS - 2.5, z1: z1 * VS + 2.5 });
  for (const [z0, z1] of bd.roads ?? []) {
    for (const [x0, x1] of [[-FAR, 0], [L, L + FAR]]) {
      plane(x0, z0 * VS, x1, z1 * VS, gy - 0.01, asphaltMat);
      if (bd.style === 'town') { plane(x0, z0 * VS - 2, x1, z0 * VS, gy - 0.008, paveMat); plane(x0, z1 * VS, x1, z1 * VS + 2, gy - 0.008, paveMat); }
    }
    strips.push({ z0: z0 * VS - 2.5, z1: z1 * VS + 2.5 });
  }
  for (const [x0, x1] of bd.sideRoads ?? []) {
    plane(x0 * VS, D, x1 * VS, D + FAR, gy - 0.01, asphaltMat);
    strips.push({ x0: x0 * VS - 2.5, x1: x1 * VS + 2.5, zMin: D });
  }
  const blocked = (x0, z0, x1, z1) =>
    (x1 > -1.5 && x0 < L + 1.5 && z1 > -1.5 && z0 < D + 1.5) ||
    strips.some((s) => (s.z0 !== undefined ? z1 > s.z0 && z0 < s.z1 : x1 > s.x0 && x0 < s.x1 && z1 > s.zMin));

  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const boxes = [], roofs = [], trees = [];
  const CELL = 9;
  for (let cz = -54; cz < D + 54; cz += CELL)
    for (let cx = -54; cx < L + 54; cx += CELL) {
      if (blocked(cx, cz, cx + CELL, cz + CELL)) continue;
      if (bd.style === 'town') {
        const w = CELL - 0.6 - rnd() * 2, d = CELL - 0.6 - rnd() * 2, h = 4 + Math.floor(rnd() * 3) * 3 + (rnd() < 0.15 ? 6 : 0);
        boxes.push({ x: cx + CELL / 2, z: cz + CELL / 2, w, d, h, c: [0xa5553b, 0xe6d6a8, 0x9fc0d8, 0xe0a296, 0x9c9b96, 0xc9b79c][Math.floor(rnd() * 6)] });
        if (rnd() < 0.6) roofs.push({ x: cx + CELL / 2, z: cz + CELL / 2, w, d, y: gy + h, rot: rnd() < 0.5 });
        if (rnd() < 0.2) trees.push({ x: cx + rnd() * CELL, z: cz + rnd() * CELL, s: 0.8 + rnd() * 0.5 });
      } else {
        const n = rnd() < 0.08 ? 0 : 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) trees.push({ x: cx + rnd() * CELL, z: cz + rnd() * CELL, s: 0.8 + rnd() * 0.7 });
        if (n === 0) {
          const w = 8 + rnd() * 4, d = 6;
          boxes.push({ x: cx + CELL / 2, z: cz + CELL / 2, w: w * 0.9, d, h: 4, c: rnd() < 0.5 ? 0x8f6036 : 0xa5553b });
          roofs.push({ x: cx + CELL / 2, z: cz + CELL / 2, w: w * 0.9, d, y: gy + 4, rot: false });
        }
      }
    }
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const inst = (geo, list, set, color) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), list.length);
    list.forEach((o, i) => { set(o); m.setMatrixAt(i, mtx); m.setColorAt(i, col.set(color(o))); });
    m.castShadow = m.receiveShadow = true;
    scenery.add(m);
  };
  const up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  inst(new THREE.BoxGeometry(1, 1, 1), boxes, (o) => mtx.compose(pos.set(o.x, gy + o.h / 2, o.z), q.identity(), scl.set(o.w, o.h, o.d)), (o) => o.c);
  // triangular prism along x with its base at y = 0, 1 × 1 × 1
  const prism = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0.25, 0).scale(1, 1 / 0.75, 1 / 0.866);
  inst(prism, roofs, (o) => mtx.compose(pos.set(o.x, o.y, o.z), q.setFromAxisAngle(up, o.rot ? Math.PI / 2 : 0),
    scl.set((o.rot ? o.d : o.w) + 0.6, 2.4, (o.rot ? o.w : o.d) + 0.6)), () => 0x7b3a31);
  inst(new THREE.ConeGeometry(2.2, 5, 7).translate(0, 4.5, 0), trees, (o) => mtx.compose(pos.set(o.x, gy, o.z), q.identity(), scl.setScalar(o.s)), () => 0x41693a);
  inst(new THREE.CylinderGeometry(0.2, 0.25, 2.2, 5).translate(0, 1.1, 0), trees, (o) => mtx.compose(pos.set(o.x, gy, o.z), q.identity(), scl.setScalar(o.s)), () => 0x6b4a2c);
}

// rain that stops on roofs and only gets in through holes you make
const RAIN_N = 1800;
const rainPos = new Float32Array(RAIN_N * 6), rainStop = new Float32Array(RAIN_N);
const rain = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.4, depthWrite: false }));
rain.geometry.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);
function surfaceY(x, z) {
  const vx = Math.floor(x / VS), vz = Math.floor(z / VS);
  if (vx < 0 || vz < 0 || vx >= WX || vz >= WZ) return G * VS;
  for (let y = WY - 1; y >= 0; y--) if (wget(vx, y, vz)) return (y + 1) * VS;
  return 0;
}
function respawnDrop(i, fresh) {
  const x = camera.position.x + (Math.random() - 0.5) * 36, z = camera.position.z + (Math.random() - 0.5) * 36;
  const y = camera.position.y + (fresh ? Math.random() * 22 - 6 : 14 + Math.random() * 3);
  rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
  rainStop[i] = surfaceY(x, z);
}
for (let i = 0; i < RAIN_N; i++) respawnDrop(i, true);
let rainSound = null;
function noiseBuffer(sec) {
  const b = audio.createBuffer(1, audio.sampleRate * sec, audio.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function updateRainSound(level) {
  if (!audio) return;
  if (!rainSound) {
    const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = noiseBuffer(2); src.loop = true;
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.4;
    g.gain.value = 0;
    src.connect(f).connect(g).connect(audio.destination);
    src.start();
    rainSound = g;
  }
  rainSound.gain.value = level * 0.05;
}
function thunder(delay, vol) {
  if (!audio) return;
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain(), t = audio.currentTime + delay;
  src.buffer = noiseBuffer(4);
  f.type = 'lowpass'; f.frequency.value = 220;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
  g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
  src.connect(f).connect(g).connect(audio.destination);
  src.start(t);
}
let boltTimer = 6, bolt = 0, boltQueue = [];
const boltDir = new THREE.Vector3();

function setEnvironment(i, quiet = false) {
  envIndex = (i + ENVS.length) % ENVS.length;
  localStorage.setItem('vw-env', ENVS[envIndex].id);
  lastAutoTorch = null;
  envBlend = 0;
  document.querySelectorAll('.env-btn:not(.map-btn)').forEach((b) => b.classList.toggle('on', +b.dataset.i === envIndex));
  if (!quiet) toast(ENVS[envIndex].name, 1.4);
}

function blendEnv(a, b, k, out) {
  for (const key of ENV_KEYS_C) out[key].copy(a[key]).lerp(b[key], k);
  for (const key of ENV_KEYS_N) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}
const sunDirNow = new THREE.Vector3();
function cycleTarget(dt) {
  cycleTime = (cycleTime + dt) % CYCLE_LEN;
  const th = (cycleTime / CYCLE_LEN) * Math.PI * 2;
  sunDirNow.set(-Math.cos(th), Math.sin(th), -0.45).normalize();
  const e = sunDirNow.y, [day, set, night] = [ENVS[0].p, ENVS[1].p, ENVS[2].p];
  if (e > 0.4) blendEnv(day, day, 0, tmpEnv);
  else if (e > 0.06) blendEnv(set, day, (e - 0.06) / 0.34, tmpEnv);
  else if (e > -0.12) blendEnv(night, set, (e + 0.12) / 0.18, tmpEnv);
  else blendEnv(night, night, 0, tmpEnv);
  const up = e > -0.03;
  tmpEnv.dir.copy(sunDirNow);
  if (!up) tmpEnv.dir.set(-sunDirNow.x, -sunDirNow.y, sunDirNow.z);
  tmpEnv.li *= THREE.MathUtils.smoothstep(Math.abs(e + 0.03), 0, 0.08);
  tmpEnv.disc = up ? 1 : 0;
  tmpEnv.moon = up ? 0 : 1;
  return tmpEnv;
}

function updateEnvironment(dt) {
  const env = ENVS[envIndex];
  const target = env.p ?? cycleTarget(dt);
  envBlend = Math.min(1, envBlend + dt * 0.8);
  const k = env.p ? 1 - Math.exp(-dt * (1 + envBlend * 6)) : 1 - Math.exp(-dt * 8);
  blendEnv(cur, target, k, cur);
  if (env.p || cur.dir.dot(target.dir) > 0.5) cur.dir.lerp(target.dir, k).normalize();
  else cur.dir.copy(target.dir);

  // lightning
  if (cur.rain > 0.5) {
    boltTimer -= dt;
    if (boltTimer <= 0) {
      boltTimer = 5 + Math.random() * 10;
      boltDir.copy(dirFrom(55 + Math.random() * 30, Math.random() * 360));
      boltQueue = [0, 0.09 + Math.random() * 0.05, 0.25 + Math.random() * 0.2];
      thunder(0.4 + Math.random() * 1.6, 0.35 + Math.random() * 0.25);
    }
  }
  for (let i = boltQueue.length - 1; i >= 0; i--) {
    boltQueue[i] -= dt;
    if (boltQueue[i] <= 0) { bolt = 0.7 + Math.random() * 0.3; boltQueue.splice(i, 1); }
  }
  bolt *= Math.exp(-dt * 13);

  const d = bolt > 0.05 ? boltDir : cur.dir;
  sun.position.copy(CENTER).addScaledVector(d, 80);
  sun.color.copy(cur.light).lerp(_c.set(0xdfe8ff), bolt);
  sun.intensity = cur.li + bolt * 9;
  hemi.color.copy(cur.hs);
  hemi.groundColor.copy(cur.hg);
  hemi.intensity = cur.hi + bolt * 1.5;
  const u = sky.material.uniforms;
  u.top.value.copy(cur.top).lerp(_c.set(0x8c96b0), bolt * 0.7);
  u.hor.value.copy(cur.hor).lerp(_c.set(0xb0b8cc), bolt * 0.7);
  u.sun.value.copy(cur.sun);
  u.glow.value = cur.glow;
  u.disc.value = cur.disc;
  u.sunDir.value.copy(env.p ? cur.dir : sunDirNow.lengthSq() ? sunDirNow : cur.dir);
  scene.background.copy(u.hor.value);
  scene.fog.color.copy(u.hor.value);
  scene.fog.near = cur.fogNear;
  scene.fog.far = cur.fogFar;
  renderer.toneMappingExposure = cur.exp;
  sky.position.copy(camera.position);
  stars.material.opacity = cur.stars;
  stars.visible = cur.stars > 0.02;
  moon.position.copy(cur.dir).multiplyScalar(270);
  moon.material.opacity = cur.moon;
  moon.visible = cur.moon > 0.02 && cur.dir.y > 0;

  // flashlight comes on by itself when it gets dark (L overrides)
  const autoTorch = cur.night > 0.5;
  if (autoTorch !== lastAutoTorch) { if (lastAutoTorch !== null || autoTorch) torchOn = autoTorch; lastAutoTorch = autoTorch; }
  torch.intensity = torchOn ? 26 : 0;
  torch.shadow.autoUpdate = torchOn || !torch.shadow.map; // the map must exist or the shader's sampler breaks

  // ceiling lamps
  for (const l of lamps) {
    if (!l.dead && !wget(l.x, l.y, l.z)) {
      l.dead = true;
      l.bulb.visible = false;
      const p = l.light.position;
      for (let i = 0; i < 25; i++) sparkle.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.4 + Math.random() * 0.4, 0.7, 2, 1.6, 0.8);
      beep(2400, 0.05, 0.03, 'square');
    }
    if (!l.dead && shake > 0.25 && Math.random() < 0.3) l.flick = 0.15 + Math.random() * 0.3;
    l.flick = Math.max(0, l.flick - dt);
    const on = l.dead ? 0 : cur.lamps * (l.flick > 0 ? (Math.random() < 0.5 ? 0.1 : 1) : 1);
    l.light.intensity = on * 5;
    l.bulb.material.color.setRGB(0.25 + on * 1.75, 0.22 + on * 1.6, 0.18 + on * 1.1);
  }

  // rain
  rain.visible = cur.rain > 0.05;
  rain.material.opacity = cur.rain * 0.4;
  updateRainSound(cur.rain);
  if (rain.visible) {
    const fall = 24 * dt, wind = 3 * dt;
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6;
      rainPos[o] += wind; rainPos[o + 1] -= fall;
      const far = Math.abs(rainPos[o] - camera.position.x) > 20 || Math.abs(rainPos[o + 2] - camera.position.z) > 20;
      if (rainPos[o + 1] < rainStop[i] || far) {
        if (rainPos[o + 1] < rainStop[i] && Math.random() < 0.08 && !far) chips.spawn(rainPos[o], rainStop[i] + 0.02, rainPos[o + 2], (Math.random() - 0.5), 1.2, (Math.random() - 0.5), 0.15, 0.25, 0.65, 0.72, 0.8);
        respawnDrop(i, false);
      } else if ((i & 63) === (frameNo & 63)) rainStop[i] = surfaceY(rainPos[o], rainPos[o + 2]); // pick up new holes
      rainPos[o + 3] = rainPos[o] - 0.04; rainPos[o + 4] = rainPos[o + 1] + 0.45; rainPos[o + 5] = rainPos[o + 2];
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }
  frameNo++;
}
const _c = new THREE.Color();
let frameNo = 0;
document.querySelectorAll('.maps').forEach((box) => {
  box.innerHTML = MAPS.map((m, i) => `<button class="env-btn map-btn${i === mapIndex ? ' on' : ''}" data-i="${i}">${m.name}</button>`).join('');
  box.addEventListener('click', (ev) => { ev.stopPropagation(); const b = ev.target.closest('.map-btn'); if (b && +b.dataset.i !== mapIndex) setMap(+b.dataset.i); });
});
document.querySelectorAll('.map-desc').forEach((el) => (el.textContent = MAPS[mapIndex].desc));
document.querySelectorAll('.envs:not(.maps)').forEach((box) => {
  box.innerHTML = ENVS.map((e, i) => `<button class="env-btn" data-i="${i}">${e.name}</button>`).join('');
  box.addEventListener('click', (ev) => { ev.stopPropagation(); const b = ev.target.closest('.env-btn'); if (b) setEnvironment(+b.dataset.i, true); });
});
setEnvironment(envIndex, true);

// ---------- main loop ----------
let shake = 0, acc = 0, last = performance.now(), fpsT = 0, frames = 0, fps = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  cooldown -= dt;
  if (mouseDown && controls.isLocked) useTool();

  acc += dt;
  let steps = 0;
  while (acc >= physics.timestep && steps < 3) {
    updatePlayer(physics.timestep);
    physics.step();
    acc -= physics.timestep;
    steps++;
  }
  if (steps === 3) acc = 0;
  updateBombs(dt);
  updateProjectiles(dt);
  updateMiniMap(dt, now);
  updateToolbar(dt);
  if (steps) checkImpacts(dt);
  structuralTimer -= dt;
  if (structuralTimer <= 0 && pendingStructural.length) { runStructural(); structuralTimer = 0.15; }

  for (const d of [...debris]) {
    const t = d.body.translation(), r = d.body.rotation();
    d.mesh.position.set(t.x, t.y, t.z);
    d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    if (t.y < -20) removeDebris(d);
  }
  chips.update(dt);
  smoke.update(dt);
  updateItems(dt);
  updateHunt(dt);

  flash.intensity *= Math.exp(-dt * 12);
  beam.material.opacity *= Math.exp(-dt * 14);
  swing = Math.max(0, swing - dt * 4);
  const vm = viewmodels[tool];
  const sw = Math.sin(swing * Math.PI);
  const kick = tool === 5 ? 2.2 : tool === 4 ? 1.4 : 1;
  vm.rotation.set(tool === 0 ? -sw * 1.3 : sw * 0.25 * kick, 0, tool === 0 ? sw * 0.3 : 0);
  vm.position.z = -0.7 + (tool === 1 || tool >= 4 ? sw * 0.06 * kick : 0);
  const pulse = 0.5 + 0.5 * Math.sin(now / 120);
  viewmodels[3].userData.led.visible = pulse > 0.5;
  viewmodels[4].userData.core.scale.setScalar(0.8 + pulse * 0.5);
  viewmodels[5].userData.strip.material.color.setHSL(0.52, 1, tool === 5 && cooldown > 0 ? 0.2 : 0.55);
  viewmodels[6].userData.ring.rotation.z = now / 300;

  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.3;
    camera.position.y += (Math.random() - 0.5) * shake * 0.3;
    shake = Math.max(0, shake - dt * 1.5);
  }

  updateEnvironment(dt);
  renderer.render(scene, camera);

  frames++;
  fpsT += dt;
  if (fpsT > 0.5) {
    fps = Math.round(frames / fpsT);
    frames = 0; fpsT = 0;
    const pct = ((100 * destroyed) / initialDestructible).toFixed(1);
    hud.stats.innerHTML = `Destruction <b>${pct}%</b> · Debris bodies <b>${debris.length}</b> · Bombs <b>${bombs.length}</b> · ${fps} fps`;
  }
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

resetLevel();
setTool(0);
requestAnimationFrame(frame);
document.getElementById('loading').remove();

// test hooks
window.__game = {
  explode: (x, y, z, r) => explode(new THREE.Vector3(x, y, z), r),
  stats: () => ({ impacts: impactCount, maxDv: +maxImpactDv.toFixed(1), debris: debris.length, destroyed, pct: (100 * destroyed) / initialDestructible, fps }),
  look: (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); player.body.setTranslation({ x, y: y - 0.62, z }, true); player.body.setNextKinematicTranslation({ x, y: y - 0.62, z }); player.vy = 0; player.kick.set(0, 0, 0); },
  use: (i) => { setTool(i); cooldown = 0; useTool(); },
  env: (i, t) => { setEnvironment(i, true); if (t !== undefined) cycleTime = t * CYCLE_LEN; for (let k = 0; k < 120; k++) updateEnvironment(0.05); },
  lamps: () => lamps.filter((l) => !l.dead).length,
  projectiles: () => projectiles.map((p) => ({ kind: p.kind, stuck: p.stuck, fuse: +p.fuse.toFixed(2), onDebris: !!p.deb, x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) })),
  carve: (x, y, z, r, power = 3) => destroyAt(new THREE.Vector3(x, y, z), r, power),
  items: () => items.map((it) => { const t = it.taken ? it.home : it.body.translation(); return { id: it.id, kind: it.kind, where: it.where, taken: it.taken, x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2) }; }),
  hunt: () => ({ ...hunt }),
  board: () => loadBoard(),
  tp: (x, y, z) => { player.body.setTranslation({ x, y, z }, true); player.body.setNextKinematicTranslation({ x, y, z }); player.vy = 0; },
  setTime: (t) => (hunt.time = t),
  map: (i) => setMap(i),
  mapId: () => MAPS[mapIndex].id,
  VS, G,
};
