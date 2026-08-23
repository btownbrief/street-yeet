// The people of Church Street: wander, get yeeted, get up dazed, carry on.
// Also the pigeons. Scoring decisions live in main.js; this file reports facts.
import * as THREE from '../vendor/three.module.min.js';
import { Rig, LOOKS, makeProp, PART_INDEX, PARTS } from './characters.js';
import { STREET, YELPS } from './roster.js';

const LANES = [-5.2, -2.6, 0, 2.6, 5.2];
const HW = STREET.halfWidth;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

const CAST = [
  ['leafPeeper', 4], ['uvmStudent', 4], ['phishFan', 2], ['flannelGuy', 3], ['creemeeKid', 3],
  ['lunchWalker', 3], ['hockeyDad', 2], ['mittensGuy', 1], ['yogaPerson', 2], ['skater', 2],
];

export class NPCs {
  constructor(scene, world, physics, { count = 30 } = {}) {
    this.scene = scene; this.world = world; this.physics = physics;
    this.list = [];
    this.obstacles = world.obstacles;
    this.onYelp = null;
    const rng = () => Math.random();
    const types = [];
    for (const [t, n] of CAST) for (let i = 0; i < n; i++) types.push(t);
    while (types.length < count) types.push(CAST[Math.floor(rng() * CAST.length)][0]);
    // stationary locals
    this.spawnOne('busker', { x: -3.8, z: 298, stationary: true, yaw: Math.PI / 2 });
    this.spawnOne('syrupSeller', { x: world.carts[2] ? world.carts[2].x + (world.carts[2].x > 0 ? -2.2 : 2.2) : 2, z: 278, stationary: true, yaw: 0 });
    // bias the crowd toward the top of the street (where the player starts) so
    // there's always a scrum to yeet, thinning out toward Main St.
    for (let i = 0; i < count; i++) {
      const t = types[i % types.length];
      const bias = Math.pow(rng(), 1.6); // 0 near the church, 1 toward Main
      const z = STREET.zNorth + 12 + bias * (STREET.zSouth - STREET.zNorth - 26);
      this.spawnOne(t, { x: LANES[Math.floor(rng() * LANES.length)] + (rng() - 0.5), z });
    }
  }

  spawnOne(type, { x, z, stationary = false, yaw = Math.random() * Math.PI * 2 }) {
    const look = LOOKS[type];
    const rig = new Rig(look);
    // handheld props
    if (look.camera) rig.addAccessory(makeProp('camera'), 'larmR', [0, -0.3, -0.08]);
    if (look.creemee) rig.addAccessory(makeProp('creemee'), 'larmR', [0, -0.3, -0.05], [0.3, 0, 0]);
    if (look.guitar) rig.addAccessory(makeProp('guitar'), 'torso', [0.05, 0.1, -0.28], [0, 0, 0.5]);
    if (look.mat) rig.addAccessory(makeProp('mat'), 'torso', [0.15, 0.1, 0.2], [0, 0, 0]);
    if (look.board) rig.addAccessory(makeProp('board'), 'larmL', [0, -0.25, 0], [0, 0, Math.PI / 2]);
    this.scene.add(rig.group);
    const npc = {
      type, look, rig, x, z, yaw, state: 'walk', speed: 0, maxSpeed: stationary ? 0 : 1.0 + Math.random() * 0.8,
      target: null, idleT: 0, stationary, rag: null, dazeT: 0, hits: 0, spawnYaw: yaw, id: this.list.length,
    };
    if (stationary) npc.state = 'idle';
    this.pickTarget(npc);
    this.list.push(npc);
    return npc;
  }

  pickTarget(npc) {
    if (npc.stationary) return;
    const lane = LANES[Math.floor(Math.random() * LANES.length)] + (Math.random() - 0.5) * 0.8;
    let z = npc.z + (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 45);
    z = Math.min(STREET.zSouth - 3, Math.max(STREET.zNorth + 3, z));
    npc.target = { x: lane, z };
  }

  // ---- per frame ----
  update(dt, player) {
    const list = this.list;
    for (const npc of list) {
      if (npc.state === 'ragdoll') { this.updateRagdoll(npc, dt, player); continue; }
      if (npc.state === 'dazed') {
        npc.dazeT -= dt;
        npc.rig.setPosition(npc.x, 0, npc.z); npc.rig.setHeading(npc.yaw);
        npc.rig.updatePose(dt, { speed: 0, dizzy: Math.min(1, npc.dazeT) });
        if (npc.dazeT <= 0) { npc.state = npc.stationary ? 'idle' : 'walk'; this.pickTarget(npc); }
        continue;
      }
      if (npc.state === 'idle') {
        npc.idleT -= dt;
        npc.speed = Math.max(0, npc.speed - dt * 3);
        if (!npc.stationary && npc.idleT <= 0) { npc.state = 'walk'; this.pickTarget(npc); }
        npc.rig.setPosition(npc.x, 0, npc.z); npc.rig.setHeading(npc.yaw);
        npc.rig.updatePose(dt, { speed: 0, idleStyle: npc.id });
        continue;
      }
      // walking: steer to target with obstacle + crowd avoidance
      const t = npc.target;
      let dx = t.x - npc.x, dz = t.z - npc.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        if (Math.random() < 0.35) { npc.state = 'idle'; npc.idleT = 1 + Math.random() * 4; } else this.pickTarget(npc);
        continue;
      }
      dx /= dist; dz /= dist;
      // obstacles
      for (const o of this.obstacles) {
        const ox = npc.x - o.x, oz = npc.z - o.z;
        const d = Math.hypot(ox, oz), rr = o.r + 0.6;
        if (d < rr + 1.2 && d > 0.001) {
          const push = (rr + 1.2 - d) / (rr + 1.2);
          dx += ox / d * push * 1.6; dz += oz / d * push * 1.6;
        }
      }
      // other people + the player
      for (const other of list) {
        if (other === npc || other.state === 'ragdoll') continue;
        const ox = npc.x - other.x, oz = npc.z - other.z, d = Math.hypot(ox, oz);
        if (d < 1.0 && d > 0.001) { dx += ox / d * (1.0 - d) * 1.5; dz += oz / d * (1.0 - d) * 1.5; }
      }
      if (player) {
        const ox = npc.x - player.x, oz = npc.z - player.z, d = Math.hypot(ox, oz);
        if (d < 1.4 && d > 0.001) { dx += ox / d * (1.4 - d) * 2.5; dz += oz / d * (1.4 - d) * 2.5; }
      }
      // stay on the bricks
      if (Math.abs(npc.x) > HW - 1.2) dx -= Math.sign(npc.x) * 1.5;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const wantYaw = Math.atan2(dx, dz);
      // smooth heading
      let dy = wantYaw - npc.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      npc.yaw += dy * Math.min(1, dt * 6);
      npc.speed += (npc.maxSpeed - npc.speed) * Math.min(1, dt * 3);
      npc.x += Math.sin(npc.yaw) * npc.speed * dt;
      npc.z += Math.cos(npc.yaw) * npc.speed * dt;
      npc.x = Math.max(-HW + 0.6, Math.min(HW - 0.6, npc.x));
      npc.z = Math.max(STREET.zNorth + 1, Math.min(STREET.zSouth - 1, npc.z));
      npc.rig.setPosition(npc.x, 0, npc.z);
      npc.rig.setHeading(npc.yaw);
      npc.rig.updatePose(dt, { speed: npc.speed });
    }
  }

  updateRagdoll(npc, dt, player) {
    const r = npc.rag;
    npc.rig.updateFromBodies(r.bodies);
    const hips = r.bodies[0].position;
    npc.x = hips.x; npc.z = hips.z;
    const far = player ? Math.hypot(hips.x - player.x, hips.z - player.z) > 75 : false;
    if (r.settled > 1.4 || r.age > 9 || far || hips.y < -3) this.standUp(npc);
  }

  standUp(npc) {
    const r = npc.rag;
    const hips = r.bodies[0].position;
    npc.x = Math.max(-HW + 0.7, Math.min(HW - 0.7, hips.x));
    npc.z = Math.max(STREET.zNorth + 2, Math.min(STREET.zSouth - 2, hips.z));
    // if they landed inside a building footprint on a side street, pull them back to the bricks
    this.physics.releaseRagdoll(r);
    npc.rag = null;
    npc.state = 'dazed'; npc.dazeT = 2.2 + Math.random();
    npc.yaw = Math.random() * Math.PI * 2;
    npc.rig.setPosition(npc.x, 0, npc.z); npc.rig.setHeading(npc.yaw);
    npc.rig.updatePose(0, { speed: 0, dizzy: 1 });
  }

  // segment (a→b) vs this NPC's standing capsule. returns {part, point} or null
  hitTest(npc, ax, ay, az, bx, by, bz, radius) {
    if (npc.state === 'ragdoll') return null;
    const sc = npc.rig.scale;
    const cx = npc.x, cz = npc.z;
    const R = 0.36 * sc + radius;
    // closest approach in xz between segment and the vertical line (cx,cz)
    const dx = bx - ax, dz = bz - az, dy = by - ay;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 1e-6 ? ((cx - ax) * dx + (cz - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t, py = ay + dy * t;
    const d = Math.hypot(px - cx, pz - cz);
    if (d > R) return null;
    const top = 1.95 * sc + radius, bottom = 0.05;
    if (py < bottom || py > top) return null;
    // which part? by height
    const h = py / sc;
    let part = 'torso';
    if (h > 1.55) part = 'head'; else if (h > 1.05) part = 'torso'; else if (h > 0.8) part = 'hips'; else if (h > 0.45) part = Math.random() < 0.5 ? 'ulegL' : 'ulegR'; else part = Math.random() < 0.5 ? 'llegL' : 'llegR';
    return { part, point: { x: px, y: py, z: pz }, t };
  }

  // knock an NPC into ragdoll. dir = unit-ish vector, power = m/s of launch
  knock(npc, dir, power, point, partName, cause) {
    if (npc.state === 'ragdoll') return null;
    const rig = npc.rig;
    // parts' current world transforms from the posed rig
    const parts = [];
    for (let i = 0; i < PARTS.length; i++) {
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
      rig.partWorld(i, pos, quat);
      parts.push({ pos, quat });
    }
    const imp = { x: dir.x * power, y: dir.y * power + power * 0.35, z: dir.z * power };
    const r = this.physics.activateRagdoll(parts, rig.scale, imp, point, PART_INDEX[partName] ?? 1);
    r.npc = npc;
    npc.rag = r; npc.state = 'ragdoll'; npc.hits++;
    rig.updateFromBodies(r.bodies);
    if (this.onYelp) {
      const ys = YELPS[npc.type] || ['Ope.'];
      this.onYelp(npc, ys[Math.floor(Math.random() * ys.length)]);
    }
    return r;
  }

  resetAll() {
    for (const npc of this.list) {
      if (npc.state === 'ragdoll') { this.physics.releaseRagdoll(npc.rag); npc.rag = null; }
      npc.state = npc.stationary ? 'idle' : 'walk'; npc.hits = 0; npc.dazeT = 0;
      if (!npc.stationary) { npc.x = LANES[Math.floor(Math.random() * LANES.length)]; npc.z = STREET.zNorth + 12 + Math.pow(Math.random(), 1.6) * (STREET.zSouth - STREET.zNorth - 26); }
      npc.rig.setPosition(npc.x, 0, npc.z); npc.rig.setHeading(npc.yaw); npc.rig.updatePose(0, {});
      this.pickTarget(npc);
    }
  }
}

// ---------- pigeons ----------
export class Pigeons {
  constructor(scene, spots) {
    this.flocks = [];
    const body = new THREE.SphereGeometry(0.09, 8, 6); body.scale(1, 0.8, 1.4);
    const head = new THREE.SphereGeometry(0.05, 6, 5); head.translate(0, 0.07, -0.12);
    const geo = mergeSimple([body, head]);
    this.mat = new THREE.MeshStandardMaterial({ color: '#6f7280', roughness: 0.9 });
    const N = spots.length * 7;
    this.mesh = new THREE.InstancedMesh(geo, this.mat, N);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.birds = [];
    const c = new THREE.Color();
    spots.forEach((s, fi) => {
      const flock = { x: s.x, z: s.z, state: 'ground', t: 0, birds: [] };
      for (let k = 0; k < 7; k++) {
        const b = { flock, x: s.x + (Math.random() - 0.5) * 2.4, z: s.z + (Math.random() - 0.5) * 2.4, y: 0.08, yaw: Math.random() * Math.PI * 2, vx: 0, vz: 0, vy: 0, phase: Math.random() * 6, idx: this.birds.length };
        this.birds.push(b); flock.birds.push(b);
        this.mesh.setColorAt(b.idx, c.set(['#6f7280', '#55585f', '#8a8c94', '#4a4c55'][k % 4]));
      }
      this.flocks.push(flock);
    });
    this.mesh.instanceColor.needsUpdate = true;
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(1, 1, 1);
    this.onFlush = null;
  }
  // threats: array of {x,y,z}
  update(dt, threats) {
    for (const f of this.flocks) {
      if (f.state === 'ground') {
        for (const th of threats) {
          if (Math.abs(th.x - f.x) < 3.2 && Math.abs(th.z - f.z) < 3.2 && th.y < 2.5) { f.state = 'fly'; f.t = 0; if (this.onFlush) this.onFlush(f); break; }
        }
      }
      f.t += dt;
      for (const b of f.birds) {
        b.phase += dt * 2;
        if (f.state === 'ground') {
          // peck + shuffle
          if (Math.random() < dt * 0.6) { b.yaw += (Math.random() - 0.5) * 2; }
          const sp = Math.sin(b.phase) > 0.6 ? 0.4 : 0;
          b.x += Math.sin(b.yaw) * sp * dt; b.z += Math.cos(b.yaw) * sp * dt;
          if (Math.hypot(b.x - f.x, b.z - f.z) > 2.2) b.yaw = Math.atan2(f.x - b.x, f.z - b.z);
          b.y = 0.08 + (Math.sin(b.phase * 4) > 0.9 ? -0.03 : 0);
        } else if (f.state === 'fly') {
          // scatter up and out, then circle back
          if (f.t < 0.05) { const a = Math.atan2(b.x - f.x, b.z - f.z) + (Math.random() - 0.5); b.vx = Math.sin(a) * 4; b.vz = Math.cos(a) * 4; b.vy = 3.5 + Math.random() * 2; }
          if (f.t < 2.5) { b.vy += (2.2 - b.y) * dt * 2; }
          else { // head home
            const hx = f.x + Math.sin(b.idx) * 1.2, hz = f.z + Math.cos(b.idx) * 1.2;
            b.vx += (hx - b.x) * dt * 1.5; b.vz += (hz - b.z) * dt * 1.5; b.vy += (0.08 - b.y) * dt * 2.5;
            b.vx *= 0.98; b.vz *= 0.98;
          }
          b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
          b.yaw = Math.atan2(b.vx, b.vz);
          if (f.t > 7) { f.state = 'ground'; b.y = 0.08; b.vx = b.vz = b.vy = 0; }
        }
        this._p.set(b.x, b.y, b.z);
        this._e.set(f.state === 'fly' ? -0.3 : 0, b.yaw + Math.PI, f.state === 'fly' ? Math.sin(b.phase * 9) * 0.5 : 0);
        this._q.setFromEuler(this._e);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(b.idx, this._m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function mergeSimple(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    let total = 0; for (const g of list) total += g.attributes[name].count;
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size); let off = 0;
    for (const g of list) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
