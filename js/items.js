// The throwables. Physics numbers live here so balance is one file.
// r = collision radius, mass drives knock-back, speed scales throw velocity,
// knock = extra punch on people, splat = disappears on first hard hit.
import * as THREE from '../vendor/three.module.min.js';
import * as T from './textures.js';

export const ITEMS = [
  { id: 'creemee', name: 'Maple Creemee', emoji: '🍦', r: 0.12, mass: 0.6, speed: 1.15, knock: 0.75, splat: true, shape: 'sphere', splatColor: '#f3e2bf', tip: 'fast + light · splats' },
  { id: 'pint', name: 'Pint of Ice Cream', emoji: '🍨', r: 0.12, mass: 1.0, speed: 1.05, knock: 0.95, splat: false, shape: 'sphere', bouncy: true, splatColor: '#bfe3f2', tip: 'bouncy · ricochets' },
  { id: 'syrup', name: 'Maple Syrup Jug', emoji: '🍁', r: 0.17, mass: 2.4, speed: 0.95, knock: 1.25, splat: false, shape: 'sphere', splatColor: '#b8651a', tip: 'heavy · big knockback' },
  { id: 'cheddar', name: 'Cheddar Wheel', emoji: '🧀', r: 0.32, h: 0.14, mass: 5.0, speed: 0.72, knock: 1.6, splat: false, shape: 'cyl', rolls: true, splatColor: '#e9b93b', tip: 'rolls down the bricks · bowling' },
  { id: 'pumpkin', name: 'Pumpkin', emoji: '🎃', r: 0.27, mass: 3.6, speed: 0.82, knock: 1.45, splat: true, shape: 'sphere', splatColor: '#e0782a', tip: 'heavy · splats on impact' },
];

const MATS = {};
function mm(key, make) { return MATS[key] || (MATS[key] = make()); }

export function makeItemMesh(kind) {
  const g = new THREE.Group();
  const add = (geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  switch (kind.id) {
    case 'creemee': {
      const cone = mm('cone', () => new THREE.MeshStandardMaterial({ map: T.coneTexture(), roughness: 0.9 }));
      const cream = mm('cream', () => new THREE.MeshStandardMaterial({ color: '#f6e7c6', roughness: 0.45 }));
      const maple = mm('maple', () => new THREE.MeshStandardMaterial({ color: '#d9a35a', roughness: 0.45 }));
      add(new THREE.ConeGeometry(0.07, 0.22, 12), cone, 0, -0.08, 0, Math.PI);
      add(new THREE.SphereGeometry(0.085, 12, 10), cream, 0, 0.06, 0);
      add(new THREE.SphereGeometry(0.065, 12, 10), maple, 0, 0.14, 0);
      add(new THREE.SphereGeometry(0.04, 10, 8), cream, 0, 0.2, 0);
      break;
    }
    case 'pint': {
      const label = mm('pint', () => new THREE.MeshStandardMaterial({ map: T.pintTexture(), roughness: 0.6 }));
      const lid = mm('lid', () => new THREE.MeshStandardMaterial({ color: '#f6f1e3', roughness: 0.6 }));
      add(new THREE.CylinderGeometry(0.1, 0.085, 0.16, 16), label, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.105, 0.105, 0.03, 16), lid, 0, 0.09, 0);
      break;
    }
    case 'syrup': {
      const jug = mm('jug', () => new THREE.MeshStandardMaterial({ map: T.jugTexture(), roughness: 0.5 }));
      const amber = mm('amber', () => new THREE.MeshStandardMaterial({ color: '#c77a2a', roughness: 0.4 }));
      add(new THREE.CylinderGeometry(0.12, 0.13, 0.24, 14), jug, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.05, 0.09, 0.08, 12), amber, 0, 0.15, 0);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), mm('cap', () => new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.6 })), 0, 0.2, 0);
      const handle = add(new THREE.TorusGeometry(0.06, 0.015, 8, 12, Math.PI), amber, 0.1, 0.07, 0, 0, 0, -Math.PI / 2);
      break;
    }
    case 'cheddar': {
      const cheese = mm('cheese', () => new THREE.MeshStandardMaterial({ map: T.cheeseTexture(), roughness: 0.7 }));
      const rind = mm('rind', () => new THREE.MeshStandardMaterial({ color: '#8a2b1f', roughness: 0.8 }));
      add(new THREE.CylinderGeometry(0.31, 0.31, 0.14, 20), cheese, 0, 0, 0);
      add(new THREE.TorusGeometry(0.31, 0.018, 8, 24), rind, 0, 0.07, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(0.31, 0.018, 8, 24), rind, 0, -0.07, 0, Math.PI / 2);
      break;
    }
    case 'pumpkin': {
      const pk = mm('pumpkin', () => new THREE.MeshStandardMaterial({ color: '#e0782a', roughness: 0.55 }));
      const stem = mm('stem', () => new THREE.MeshStandardMaterial({ color: '#4a6b2a', roughness: 0.9 }));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        add(new THREE.SphereGeometry(0.2, 12, 10), pk, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08).scale.set(1, 0.85, 1);
      }
      add(new THREE.CylinderGeometry(0.025, 0.04, 0.1, 8), stem, 0, 0.2, 0, 0.2);
      break;
    }
  }
  return g;
}

// pool of visual meshes per item kind
export class ItemVisuals {
  constructor(scene) { this.scene = scene; this.pools = new Map(); }
  take(kind) {
    if (!this.pools.has(kind.id)) this.pools.set(kind.id, []);
    const pool = this.pools.get(kind.id);
    let v = pool.find((x) => !x.busy);
    if (!v) { v = { mesh: makeItemMesh(kind), busy: false }; this.scene.add(v.mesh); pool.push(v); }
    v.busy = true; v.mesh.visible = true;
    return v;
  }
  release(v) { if (!v) return; v.busy = false; v.mesh.visible = false; }
}
