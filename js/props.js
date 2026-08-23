// Yeetable street furniture. Each prop is a dynamic cannon body that SLEEPS
// until disturbed. For rendering, all props of one KIND share a single
// vertex-coloured geometry drawn as ONE InstancedMesh — so every bench in town
// is one draw call, every trash can another, etc. (7 kinds → 7 draws total).
// Collision shapes are plain data so physics.js builds bodies without three.
import * as THREE from '../vendor/three.module.min.js';

// ---- a compact scene-graph → single vertex-coloured geometry baker ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(_m);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(color); const lin = _c.clone().convertSRGBToLinear();
  for (let i = 0; i < n; i++) { col[i * 3] = lin.r; col[i * 3 + 1] = lin.g; col[i * 3 + 2] = lin.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function bake(parts) {
  const geos = parts;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    let total = 0; for (const g of geos) total += g.attributes[name].count;
    const arr = new Float32Array(total * 3); let off = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (r1, r2, h, s = 10) => new THREE.CylinderGeometry(r1, r2, h, s);
const CONE = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);
const SPH = (r) => new THREE.SphereGeometry(r, 8, 6);

const WOOD = '#8a5a32', IRON = '#22241f', GREEN = '#1f4d3a';

// each def: mass, label, collision shapes, and geo() → baked geometry
export const PROP_DEFS = {
  bench: {
    mass: 16, label: 'BENCH',
    shapes: [{ t: 'box', a: [0.9, 0.22, 0.28], o: [0, 0.45, 0] }, { t: 'box', a: [0.9, 0.26, 0.05], o: [0, 0.72, -0.24] }, { t: 'box', a: [0.06, 0.42, 0.28], o: [-0.84, 0.22, 0] }, { t: 'box', a: [0.06, 0.42, 0.28], o: [0.84, 0.22, 0] }],
    geo() {
      const p = [];
      for (let s = 0; s < 4; s++) p.push(part(BOX(1.8, 0.04, 0.09), WOOD, 0, 0.45, -0.22 + s * 0.12));
      for (let s = 0; s < 3; s++) p.push(part(BOX(1.8, 0.09, 0.04), WOOD, 0, 0.62 + s * 0.14, -0.26 - s * 0.04, s * 0.28));
      for (const dx of [-0.8, 0.8]) { p.push(part(BOX(0.06, 0.44, 0.5), IRON, dx, 0.22, 0)); p.push(part(BOX(0.06, 0.5, 0.06), IRON, dx, 0.7, -0.24)); }
      return bake(p);
    },
  },
  trashcan: {
    mass: 9, label: 'TRASH CAN',
    shapes: [{ t: 'cyl', a: [0.32, 0.32, 1.0], o: [0, 0.5, 0] }],
    geo() { return bake([part(CYL(0.3, 0.28, 1.0, 12), GREEN, 0, 0.5, 0), part(CYL(0.34, 0.34, 0.06, 12), IRON, 0, 1.02, 0), part(CYL(0.28, 0.28, 0.05, 12), '#163a2a', 0, 1.06, 0)]); },
  },
  planter: {
    mass: 24, label: 'PLANTER',
    shapes: [{ t: 'box', a: [0.6, 0.3, 0.4], o: [0, 0.3, 0] }],
    geo() {
      const p = [part(BOX(1.2, 0.6, 0.8), '#5a4a3a', 0, 0.3, 0), part(SPH(0.6), '#4f8a3a', 0, 0.78, 0, 0, 0, 0, 1, 0.55, 0.75)];
      for (let k = 0; k < 6; k++) p.push(part(SPH(0.09), k % 2 ? '#e84a8a' : '#f2c744', -0.4 + (k / 6) * 0.8, 0.98, -0.2 + (k % 3) * 0.2));
      return bake(p);
    },
  },
  table: {
    mass: 7, label: 'CAFÉ TABLE',
    shapes: [{ t: 'cyl', a: [0.45, 0.45, 0.08], o: [0, 0.7, 0] }, { t: 'box', a: [0.05, 0.7, 0.05], o: [0, 0.35, 0] }, { t: 'box', a: [0.28, 0.03, 0.28], o: [0, 0.02, 0] }],
    geo() { return bake([part(CYL(0.45, 0.45, 0.05, 14), IRON, 0, 0.7, 0), part(CYL(0.03, 0.03, 0.7, 8), IRON, 0, 0.35, 0), part(CYL(0.24, 0.3, 0.05, 12), IRON, 0, 0.03, 0)]); },
  },
  chair: {
    mass: 4, label: 'CHAIR',
    shapes: [{ t: 'box', a: [0.2, 0.22, 0.2], o: [0, 0.46, 0] }, { t: 'box', a: [0.2, 0.22, 0.04], o: [0, 0.7, -0.18] }],
    geo() {
      const p = [part(BOX(0.4, 0.04, 0.4), IRON, 0, 0.44, 0), part(BOX(0.4, 0.44, 0.04), IRON, 0, 0.66, -0.18)];
      for (const dx of [-0.16, 0.16]) for (const dz of [-0.16, 0.16]) p.push(part(BOX(0.03, 0.44, 0.03), IRON, dx, 0.22, dz));
      return bake(p);
    },
  },
  aframe: {
    mass: 6, label: 'SANDWICH SIGN',
    shapes: [{ t: 'box', a: [0.45, 0.5, 0.32], o: [0, 0.5, 0] }],
    geo() {
      const p = [part(BOX(0.9, 0.06, 0.34), '#5a3a1f', 0, 0.06, 0)];
      for (const s of [-1, 1]) p.push(part(BOX(0.9, 1.0, 0.04), '#2b2b2b', 0, 0.55, s * 0.16, s * 0.28));
      for (let i = 0; i < 3; i++) p.push(part(BOX(0.6, 0.03, 0.01), '#e9e4d4', 0, 0.78 - i * 0.18, 0.15, 0.28));
      return bake(p);
    },
  },
  cone: {
    mass: 2, label: 'TRAFFIC CONE',
    shapes: [{ t: 'cyl', a: [0.06, 0.22, 0.55], o: [0, 0.28, 0] }, { t: 'box', a: [0.24, 0.03, 0.24], o: [0, 0.03, 0] }],
    geo() { return bake([part(CONE(0.2, 0.55, 12), '#e0561f', 0, 0.32, 0), part(BOX(0.42, 0.05, 0.42), '#e0561f', 0, 0.03, 0), part(CONE(0.15, 0.12, 12), '#f3f0e6', 0, 0.42, 0)]); },
  },
  newsbox: {
    mass: 11, label: 'NEWS BOX',
    shapes: [{ t: 'box', a: [0.25, 0.4, 0.22], o: [0, 0.5, 0] }],
    geo() {
      const p = [part(BOX(0.5, 0.7, 0.44), '#2a5ea8', 0, 0.75, 0), part(BOX(0.44, 0.55, 0.03), '#173a2a', 0, 0.8, 0.22), part(BOX(0.46, 0.1, 0.02), '#f2c744', 0, 1.06, 0.22)];
      for (const dx of [-0.18, 0.18]) p.push(part(BOX(0.05, 0.4, 0.05), IRON, dx, 0.2, 0));
      return bake(p);
    },
  },
};

export const YEETABLE_KINDS = Object.keys(PROP_DEFS);

// shared material for every prop (vertex colours carry per-part colour)
export function propMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08, flatShading: true });
}
