import * as THREE from 'three';
import { VS } from './world.js';

// Overhead wires as verlet ropes. An intact wire is a static curve; when it is cut or loses an
// anchor it is simulated (gravity, length constraints, voxel collisions) until it settles.
const SEG = 0.3; // metres between rope points
const RADIUS = 0.03;
const GRAVITY = -9.8;
const material = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.6, metalness: 0.3 });
const NEIGHBOURS = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

// closest points between segments p1-q1 and p2-q2; returns [squared distance, s, t]
function segSeg(p1, q1, p2, q2) {
  const d1 = _a.subVectors(q1, p1), d2 = _b.subVectors(q2, p2), r = _d.subVectors(p1, p2);
  const a = d1.lengthSq(), e = d2.lengthSq(), f = d2.dot(r);
  let s, t;
  if (a < 1e-9 && e < 1e-9) { s = t = 0; }
  else if (a < 1e-9) { s = 0; t = THREE.MathUtils.clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e < 1e-9) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  const dx = p1.x + d1.x * s - (p2.x + d2.x * t), dy = p1.y + d1.y * s - (p2.y + d2.y * t), dz = p1.z + d1.z * s - (p2.z + d2.z * t);
  return [dx * dx + dy * dy + dz * dz, s, t];
}

export class Wires {
  constructor(scene, world, onCut) {
    this.scene = scene;
    this.world = world;
    this.onCut = onCut;
    this.ropes = [];
    this.checkT = 0;
  }

  solidAt(v) { return this.world.get(Math.floor(v.x / VS), Math.floor(v.y / VS), Math.floor(v.z / VS)) !== 0; }
  anchored(cell) { return NEIGHBOURS.some(([dx, dy, dz]) => this.world.get(cell[0] + dx, cell[1] + dy, cell[2] + dz)); }

  clear() {
    for (const r of this.ropes) this.dropMesh(r);
    this.ropes = [];
  }

  build(defs) {
    this.clear();
    const centre = (c) => new THREE.Vector3((c[0] + 0.5) * VS, (c[1] + 0.5) * VS, (c[2] + 0.5) * VS);
    for (const d of defs) {
      const a = centre(d.p), b = centre(d.q);
      const n = Math.max(3, Math.ceil(a.distanceTo(b) / SEG) + 1);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -d.sag * 4 * t * (1 - t) * VS, 0)));
      }
      const rest = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
      this.add({ pts, prev: pts.map((p) => p.clone()), rest, pinA: d.p, pinB: d.q, active: false, still: 0 });
    }
  }

  add(r) {
    r.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    r.mesh.castShadow = true;
    this.scene.add(r.mesh);
    this.refresh(r);
    this.ropes.push(r);
  }

  dropMesh(r) {
    this.scene.remove(r.mesh);
    r.mesh.geometry.dispose();
  }

  refresh(r) {
    r.mesh.geometry.dispose();
    r.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r.pts), r.pts.length * 2, RADIUS, 5);
  }

  // drop points first+1..last; the halves keep their own anchors and start to swing
  splice(r, first, last) {
    this.dropMesh(r);
    this.ropes.splice(this.ropes.indexOf(r), 1);
    const parts = [
      { from: 0, to: first, pinA: r.pinA, pinB: null },
      { from: last + 1, to: r.pts.length - 1, pinA: null, pinB: r.pinB },
    ];
    for (const { from, to, pinA, pinB } of parts) {
      if (to - from < 1) continue;
      this.add({
        pts: r.pts.slice(from, to + 1), prev: r.prev.slice(from, to + 1), rest: r.rest.slice(from, to),
        pinA, pinB, active: true, still: 0,
      });
    }
  }

  // cut every wire within r of point p (or of segment p-end); returns the number of cuts
  cut(p, r, end = null) {
    const q = end ?? p;
    let cuts = 0;
    for (const rope of [...this.ropes]) {
      let first = -1, last = -1, at = null;
      for (let k = 0; k + 1 < rope.pts.length; k++) {
        const [d2, , t] = segSeg(p, q, rope.pts[k], rope.pts[k + 1]);
        if (d2 > r * r) continue;
        if (first < 0) { first = k; at = rope.pts[k].clone().lerp(rope.pts[k + 1], t); }
        last = k;
      }
      if (first < 0) continue;
      this.splice(rope, first, last);
      this.onCut?.(at);
      cuts++;
    }
    return cuts;
  }

  // nearest wire crossed by a ray within `tol`, as { dist, point }
  rayHit(origin, dir, maxDist, tol = 0.12) {
    const end = origin.clone().addScaledVector(dir, maxDist);
    let best = null;
    for (const rope of this.ropes)
      for (let k = 0; k + 1 < rope.pts.length; k++) {
        const [d2, s, t] = segSeg(origin, end, rope.pts[k], rope.pts[k + 1]);
        if (d2 < tol * tol && (!best || s * maxDist < best.dist))
          best = { dist: s * maxDist, point: rope.pts[k].clone().lerp(rope.pts[k + 1], t) };
      }
    return best;
  }

  // shove rope points away from a blast
  blast(p, R, push) {
    for (const rope of this.ropes) {
      let hit = false;
      rope.pts.forEach((v, i) => {
        if ((i === 0 && rope.pinA) || (i === rope.pts.length - 1 && rope.pinB)) return;
        const d = v.distanceTo(p);
        if (d > R) return;
        _d.subVectors(v, p).normalize().multiplyScalar(push * 0.02 * (1 - d / R));
        rope.prev[i].sub(_d);
        hit = true;
      });
      if (hit) { rope.active = true; rope.still = 0; }
    }
  }

  update(dt) {
    this.checkT += dt;
    if (this.checkT > 0.15) {
      this.checkT = 0;
      for (const r of this.ropes) {
        if (r.pinA && !this.anchored(r.pinA)) { r.pinA = null; r.active = true; r.still = 0; }
        if (r.pinB && !this.anchored(r.pinB)) { r.pinB = null; r.active = true; r.still = 0; }
      }
    }
    const h = Math.min(dt, 1 / 30);
    for (const r of [...this.ropes]) {
      if (!r.active) continue;
      const n = r.pts.length, last = n - 1;
      const pinned = (i) => (i === 0 && r.pinA) || (i === last && r.pinB);
      let moved = 0;
      for (let i = 0; i < n; i++) {
        if (pinned(i)) continue;
        const p = r.pts[i], o = r.prev[i];
        const vx = (p.x - o.x) * 0.98, vy = (p.y - o.y) * 0.98, vz = (p.z - o.z) * 0.98;
        o.copy(p);
        p.x += vx; p.y += vy + GRAVITY * h * h; p.z += vz;
      }
      for (let it = 0; it < 16; it++)
        for (let k = 0; k < last; k++) {
          const a = r.pts[k], b = r.pts[k + 1];
          const wa = pinned(k) ? 0 : 1, wb = pinned(k + 1) ? 0 : 1;
          if (!wa && !wb) continue;
          _d.subVectors(b, a);
          const len = _d.length() || 1e-6;
          _d.multiplyScalar((len - r.rest[k]) / len / (wa + wb));
          if (wa) a.add(_d);
          if (wb) b.sub(_d);
        }
      for (let i = 0; i < n; i++) {
        if (pinned(i)) continue;
        const p = r.pts[i], o = r.prev[i];
        if (this.solidAt(p)) {
          if (!this.solidAt(o)) { p.x = o.x; p.z = o.z; if (this.solidAt(p)) p.y = o.y; } // stop on contact, with friction
          else p.y = (Math.floor(p.y / VS) + 1) * VS + 0.01;
          o.copy(p); // resting contact: no sliding, lets the rope settle and sleep
        }
        moved = Math.max(moved, p.distanceToSquared(o));
      }
      if (r.pts.every((p) => p.y < -10)) { this.dropMesh(r); this.ropes.splice(this.ropes.indexOf(r), 1); continue; }
      r.moved = moved;
      r.still = moved < 4e-6 ? r.still + dt : 0;
      if (r.still > 1.5) r.active = false;
      this.refresh(r);
    }
  }
}
