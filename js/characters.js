// Character rig. One shared skinned geometry (capsule limbs, sphere head) with
// 11 rigid "bones". A Rig owns a tiny joint hierarchy for posing (walk cycle,
// throw wind-up) and writes each bone's WORLD matrix directly — the bones are
// deliberately not in the scene graph, so nothing overwrites them. That same
// path lets the ragdoll physics bodies drive the bones once a person is yeeted.
import * as THREE from '../vendor/three.module.min.js';
import { ATLAS, characterAtlas } from './textures.js';

// ---- rig definition: joint offsets (from parent joint), mesh offset (from joint), shape ----
// y-up, character faces -Z by default (three convention), we rotate the group for heading.
export const PARTS = [
  // name, parent, joint offset, mesh centre offset from joint, shape, dims, atlas slot
  { n: 'hips',  p: null,   j: [0, 0.98, 0],      m: [0, 0.02, 0],  s: 'caph', d: [0.12, 0.14], slot: 3 },
  { n: 'torso', p: 'hips', j: [0, 0.10, 0],      m: [0, 0.25, 0],  s: 'cap',  d: [0.165, 0.26], slot: 'shirt' },
  { n: 'head',  p: 'torso', j: [0, 0.50, 0],     m: [0, 0.19, 0],  s: 'head', d: [0.16], slot: 0 },
  { n: 'uarmL', p: 'torso', j: [-0.245, 0.42, 0], m: [0, -0.15, 0], s: 'cap', d: [0.06, 0.2], slot: 'shirt' },
  { n: 'uarmR', p: 'torso', j: [0.245, 0.42, 0],  m: [0, -0.15, 0], s: 'cap', d: [0.06, 0.2], slot: 'shirt' },
  { n: 'larmL', p: 'uarmL', j: [0, -0.29, 0],    m: [0, -0.15, 0], s: 'arm',  d: [0.052, 0.2], slot: 7 },
  { n: 'larmR', p: 'uarmR', j: [0, -0.29, 0],    m: [0, -0.15, 0], s: 'arm',  d: [0.052, 0.2], slot: 7 },
  { n: 'ulegL', p: 'hips', j: [-0.1, -0.04, 0],  m: [0, -0.22, 0], s: 'cap',  d: [0.085, 0.3], slot: 3 },
  { n: 'ulegR', p: 'hips', j: [0.1, -0.04, 0],   m: [0, -0.22, 0], s: 'cap',  d: [0.085, 0.3], slot: 3 },
  { n: 'llegL', p: 'ulegL', j: [0, -0.45, 0],    m: [0, -0.21, 0], s: 'leg',  d: [0.07, 0.3], slot: 3 },
  { n: 'llegR', p: 'ulegR', j: [0, -0.45, 0],    m: [0, -0.21, 0], s: 'leg',  d: [0.07, 0.3], slot: 3 },
];
export const PART_INDEX = Object.fromEntries(PARTS.map((p, i) => [p.n, i]));

// rest-pose world positions of joints and mesh centres (character-local, unscaled)
export const REST = (() => {
  const joint = {}, centre = {};
  for (const p of PARTS) {
    const base = p.p ? joint[p.p] : [0, 0, 0];
    joint[p.n] = [base[0] + p.j[0], base[1] + p.j[1], base[2] + p.j[2]];
    centre[p.n] = [joint[p.n][0] + p.m[0], joint[p.n][1] + p.m[1], joint[p.n][2] + p.m[2]];
  }
  return { joint, centre };
})();

// ---- build the shared skinned geometry ----
function setUVsToSlot(geo, slot) {
  const uv = geo.attributes.uv;
  const [u, v] = ATLAS.slot(slot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
}
function setUVsToPatch(geo, rect, { faceOnly = false } = {}) {
  // map geometry's own uvs into the atlas patch rectangle
  const uv = geo.attributes.uv;
  const [px, py, pw, ph] = rect;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (px + u * pw) / 64, 1 - (py + (1 - v) * ph) / 64);
  }
}

function partGeometry(p) {
  let g;
  switch (p.s) {
    case 'head': {
      g = new THREE.SphereGeometry(p.d[0], 14, 10);
      // sphere uv: u wraps around, v top→bottom. Put the face on the front (-Z):
      // the sphere's u=0.75 faces -Z... simpler: map whole sphere to skin slot, then
      // remap the front cap (normal.z < -0.35) to the face patch by its own uv.
      const uv = g.attributes.uv, nrm = g.attributes.normal;
      const [su, sv] = ATLAS.slot(0);
      const [fx, fy, fw, fh] = ATLAS.face;
      for (let i = 0; i < uv.count; i++) {
        const nz = nrm.getZ(i), nx = nrm.getX(i), ny = nrm.getY(i);
        if (nz < -0.45 && Math.abs(nx) < 0.75 && ny < 0.65 && ny > -0.5) {
          // project onto face patch
          const fu = 0.5 + nx * 0.62, fv = 0.5 + ny * 0.62;
          uv.setXY(i, (fx + fu * fw) / 64, 1 - (fy + (1 - fv) * fh) / 64);
        } else uv.setXY(i, su, sv);
      }
      // hair cap: top of the head slightly bigger, drawn as separate geometry below
      break;
    }
    case 'caph': {
      g = new THREE.CapsuleGeometry(p.d[0], p.d[1], 4, 10);
      g.rotateZ(Math.PI / 2);
      setUVsToSlot(g, p.slot);
      break;
    }
    case 'arm': {
      g = new THREE.CapsuleGeometry(p.d[0], p.d[1], 4, 8);
      setUVsToSlot(g, 2); // sleeve colour = shirt
      // hand
      const hand = new THREE.SphereGeometry(0.055, 8, 6);
      hand.translate(0, -p.d[1] / 2 - 0.03, 0);
      setUVsToSlot(hand, 7);
      g = merge([g, hand]);
      break;
    }
    case 'leg': {
      g = new THREE.CapsuleGeometry(p.d[0], p.d[1], 4, 8);
      setUVsToSlot(g, 3);
      const shoe = new THREE.BoxGeometry(0.11, 0.08, 0.24);
      shoe.translate(0, -p.d[1] / 2 - 0.06, -0.05);
      setUVsToSlot(shoe, 4);
      g = merge([g, shoe]);
      break;
    }
    default: {
      g = new THREE.CapsuleGeometry(p.d[0], p.d[1], 4, 12);
      if (p.slot === 'shirt') {
        // torso + upper arms use the drawable shirt patch (plaid / tie-dye / logo)
        setUVsToPatch(g, ATLAS.shirt);
      } else setUVsToSlot(g, p.slot);
    }
  }
  return g;
}

// minimal non-indexed merge (the vendored three has no BufferGeometryUtils)
function merge(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'uv'];
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = list[0].attributes[name].itemSize;
    let total = 0;
    for (const g of list) total += g.attributes[name].count;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of list) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

let SHARED_GEO = null;
export function sharedGeometry() {
  if (SHARED_GEO) return SHARED_GEO;
  const pieces = [];
  PARTS.forEach((p, bi) => {
    const g = partGeometry(p);
    const ng = g.index ? g.toNonIndexed() : g;
    const c = REST.centre[p.n];
    ng.translate(c[0], c[1], c[2]);
    const n = ng.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    ng.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    ng.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    pieces.push(ng);
  });
  // hair cap (bone = head) and a hat variant are separate optional geometries (see makeAccessory)
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    const size = pieces[0].attributes[name].itemSize;
    let total = 0;
    for (const g of pieces) total += g.attributes[name].count;
    const Arr = name === 'skinIndex' ? Uint16Array : Float32Array;
    const arr = new Arr(total * size);
    let off = 0;
    for (const g of pieces) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  SHARED_GEO = out;
  return out;
}

// hair / hats / props attach to a bone and are ordinary meshes we place each frame.
const HAIR_GEO = (() => {
  const g = new THREE.SphereGeometry(0.168, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
  g.translate(0, 0.005, 0.01);
  return g;
})();
const BEANIE_GEO = (() => {
  const g = new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const band = new THREE.CylinderGeometry(0.178, 0.178, 0.06, 12, 1, true);
  band.translate(0, 0.01, 0);
  const out = merge([g, band]);
  out.translate(0, 0.02, 0);
  return out;
})();
const CAP_GEO = (() => {
  const g = new THREE.SphereGeometry(0.168, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const brim = new THREE.BoxGeometry(0.2, 0.02, 0.14);
  brim.translate(0, 0.0, -0.17);
  return merge([g, brim]);
})();
const SUNHAT_GEO = (() => {
  const g = new THREE.SphereGeometry(0.165, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const brim = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 14);
  brim.translate(0, 0.0, 0);
  return merge([g, brim]);
})();
const BUN_GEO = (() => { const g = new THREE.SphereGeometry(0.07, 8, 6); g.translate(0, 0.12, 0.12); return merge([HAIR_GEO.clone(), g]); })();
const LONGHAIR_GEO = (() => {
  const g = new THREE.SphereGeometry(0.172, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const back = new THREE.BoxGeometry(0.26, 0.28, 0.1);
  back.translate(0, -0.1, 0.12);
  return merge([g, back]);
})();
export const HEAD_GEAR = { hair: HAIR_GEO, beanie: BEANIE_GEO, cap: CAP_GEO, sunhat: SUNHAT_GEO, bun: BUN_GEO, long: LONGHAIR_GEO, none: null };

// ---- looks (Burlington archetypes) ----
export const LOOKS = {
  leafPeeper:  { skin: '#e7b98f', hair: '#9a8a74', shirt: '#c9c0a6', pants: '#8a6f4e', shoes: '#3b3b3b', accent: '#3c5a8a', pattern: 'plain', gear: 'sunhat', hat: '#e0d6b8', camera: true, label: 'Leaf Peeper' },
  uvmStudent:  { skin: '#c98a63', hair: '#3a2a1f', shirt: '#1f6b4a', pants: '#2e3a4f', shoes: '#f1f1f1', accent: '#f2c744', pattern: 'logo', logo: 'UVM', gear: 'cap', hat: '#f2c744', label: 'UVM Student' },
  phishFan:    { skin: '#f0c7a3', hair: '#6b4a2a', shirt: '#e7d8ff', pants: '#6f5a3c', shoes: '#7d4f2f', accent: '#ff6b9a', pattern: 'tiedye', gear: 'long', beard: true, label: 'Phish Fan' },
  flannelGuy:  { skin: '#d9a783', hair: '#2b1d14', shirt: '#a8322b', pants: '#2a3550', shoes: '#6b4a2a', accent: '#e8c15a', pattern: 'plaid', gear: 'beanie', hat: '#3c3c3c', beard: true, label: 'Flannel Guy' },
  creemeeKid:  { skin: '#f2cfae', hair: '#d99a3a', shirt: '#ff8a3d', pants: '#3a66b5', shoes: '#ff3b3b', accent: '#fff', pattern: 'stripes', gear: 'hair', scale: 0.68, creemee: true, label: 'Creemee Kid' },
  busker:      { skin: '#8e5a3a', hair: '#1a1a1a', shirt: '#2b2b2b', pants: '#1f1f1f', shoes: '#c9c9c9', accent: '#ffd36b', pattern: 'plain', gear: 'hair', guitar: true, label: 'Busker', stationary: true },
  lunchWalker: { skin: '#f1d2b6', hair: '#5b3b2a', shirt: '#dfe5ee', pants: '#2a2f3a', shoes: '#1a1a1a', accent: '#7a1f1f', pattern: 'plain', gear: 'bun', glasses: true, label: 'On Lunch Break' },
  hockeyDad:   { skin: '#d7a27e', hair: '#7a6a5a', shirt: '#0f6b3f', pants: '#35475f', shoes: '#3b3b3b', accent: '#f2c744', pattern: 'jersey', logo: '9', gear: 'cap', hat: '#0f6b3f', label: 'Hockey Dad' },
  mittensGuy:  { skin: '#f0cdb0', hair: '#e6e6e6', shirt: '#6b4a2a', pants: '#4a4a4a', shoes: '#2a2a2a', accent: '#c9b7a0', pattern: 'plain', gear: 'hair', glasses: true, hands: '#b49a7d', mittens: true, label: 'Mittens Guy' },
  yogaPerson:  { skin: '#c48a6a', hair: '#1f1410', shirt: '#d95a8f', pants: '#1d1d1d', shoes: '#e6e6e6', accent: '#fff', pattern: 'plain', gear: 'bun', mat: true, label: 'Yoga Person' },
  skater:      { skin: '#e9b992', hair: '#b56b2a', shirt: '#2f2f2f', pants: '#7a7a7a', shoes: '#f1f1f1', accent: '#fff', pattern: 'logo', logo: '802', gear: 'cap', hat: '#1a1a1a', label: 'Skater' },
  syrupSeller: { skin: '#d8a17c', hair: '#4a3324', shirt: '#f2e8d5', pants: '#2b3b2a', shoes: '#5a3e2a', accent: '#8a2f1f', pattern: 'plaid', gear: 'hair', apron: true, label: 'Syrup Seller' },
  player:      { skin: '#e2b48f', hair: '#2c1d13', shirt: '#1f6b4a', pants: '#3a4b6b', shoes: '#f1ead9', accent: '#f2c744', pattern: 'plaid', gear: 'beanie', hat: '#b5332a', label: 'You' },
};

// ---- Rig ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class Rig {
  constructor(look, { scale = 1 } = {}) {
    this.look = look;
    this.scale = scale * (look.scale || 1);
    this.atlas = characterAtlas(look);
    this.material = new THREE.MeshStandardMaterial({ map: this.atlas, roughness: 0.8, metalness: 0.0 });
    const geo = sharedGeometry();
    this.mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh.castShadow = true; this.mesh.receiveShadow = false;
    this.bones = PARTS.map((p) => { const b = new THREE.Bone(); b.name = p.n; return b; });
    // bind pose = rest joints, identity rotation
    const inverses = PARTS.map((p) => new THREE.Matrix4().makeTranslation(...REST.joint[p.n]).invert());
    this.skeleton = new THREE.Skeleton(this.bones, inverses);
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4 * this.scale);
    // joint hierarchy for posing
    this.root = new THREE.Object3D();           // character origin (feet), heading
    this.joints = {};
    for (const p of PARTS) {
      const j = new THREE.Object3D();
      j.position.set(...p.j);
      (p.p ? this.joints[p.p] : this.root).add(j);
      this.joints[p.n] = j;
    }
    this.root.scale.setScalar(this.scale);
    // accessories: head gear (hair/hat), mittens, props — plain meshes placed each frame
    this.accessories = [];
    const gear = HEAD_GEAR[look.gear || 'hair'];
    if (gear) {
      const isHat = ['beanie', 'cap', 'sunhat'].includes(look.gear);
      const mat = new THREE.MeshStandardMaterial({ color: isHat ? (look.hat || '#333') : look.hair, roughness: isHat ? 0.9 : 0.7 });
      const m = new THREE.Mesh(gear, mat);
      m.castShadow = true;
      this.addAccessory(m, 'head', [0, REST.centre.head[1] - REST.joint.head[1] + 0.04, 0]);
    }
    if (look.mittens) {
      const mat = new THREE.MeshStandardMaterial({ color: '#b49a7d', roughness: 1 });
      for (const side of ['L', 'R']) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), mat);
        m.scale.set(1, 1.2, 0.8);
        this.addAccessory(m, 'larm' + side, [0, -0.28, 0]);
      }
    }
    this.time = Math.random() * 10;
    this.pose = 'idle';
    this.throwPhase = 0; // 0 none, charge [0..1], release negative countdown
    this.armSwing = 1;
    this.ragdoll = null;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    for (const a of this.accessories) this.group.add(a.mesh);
  }

  addAccessory(mesh, bone, offset, rot = null) {
    mesh.matrixAutoUpdate = false;
    this.accessories.push({ mesh, bone: PART_INDEX[bone], off: new THREE.Vector3(...offset), rot: rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)) : null });
    if (this.group) this.group.add(mesh);
  }

  // yaw is the movement heading: direction = (sin yaw, 0, cos yaw). The rig faces -Z locally.
  setHeading(yaw) { this.root.rotation.y = yaw + Math.PI; }
  setPosition(x, y, z) { this.root.position.set(x, y, z); }

  // ---- posing ----
  updatePose(dt, { speed = 0, airborne = false, charge = -1, releasing = 0, dizzy = 0, idleStyle = 0 } = {}) {
    this.time += dt * (1 + speed * 0.9);
    const J = this.joints, t = this.time;
    const walk = THREE.MathUtils.clamp(speed / 3, 0, 1.6);
    const cyc = t * 7.5;
    const sw = Math.sin(cyc) * 0.55 * Math.min(1, walk);
    const sw2 = Math.sin(cyc + Math.PI) * 0.55 * Math.min(1, walk);
    const bob = Math.abs(Math.sin(cyc)) * 0.035 * Math.min(1, walk);
    J.hips.position.y = PARTS[0].j[1] + (airborne ? 0.06 : bob) - (walk > 0 ? 0.02 : 0);
    J.hips.rotation.set(walk > 0 ? 0.08 * walk : 0, Math.sin(cyc) * 0.08 * walk, 0);
    J.torso.rotation.set(walk * 0.06 + (airborne ? -0.15 : 0), -Math.sin(cyc) * 0.1 * walk, 0);
    // idle breathing
    if (walk < 0.05) {
      J.torso.rotation.x = Math.sin(t * 1.6) * 0.02;
      J.head.rotation.set(Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.45 + idleStyle) * 0.35, 0);
    } else J.head.rotation.set(0.05, Math.sin(cyc * 0.5) * 0.05, 0);
    // legs
    const kneeL = Math.max(0, -Math.sin(cyc)) * 0.9 * walk, kneeR = Math.max(0, -Math.sin(cyc + Math.PI)) * 0.9 * walk;
    if (airborne) {
      J.ulegL.rotation.set(-0.5, 0, 0); J.ulegR.rotation.set(0.3, 0, 0);
      J.llegL.rotation.set(1.1, 0, 0); J.llegR.rotation.set(0.6, 0, 0);
    } else {
      J.ulegL.rotation.set(sw, 0, 0); J.ulegR.rotation.set(sw2, 0, 0);
      J.llegL.rotation.set(kneeL, 0, 0); J.llegR.rotation.set(kneeR, 0, 0);
    }
    // arms
    const armAmp = 0.45 * walk * this.armSwing;
    J.uarmL.rotation.set(sw2 * armAmp / 0.55, 0, 0.12);
    J.uarmR.rotation.set(sw * armAmp / 0.55, 0, -0.12);
    J.larmL.rotation.set(-0.35 - Math.max(0, sw2) * 0.4 * walk, 0, 0);
    J.larmR.rotation.set(-0.35 - Math.max(0, sw) * 0.4 * walk, 0, 0);
    if (airborne) { J.uarmL.rotation.x = -1.2; J.uarmR.rotation.x = -1.2; J.uarmL.rotation.z = 0.6; J.uarmR.rotation.z = -0.6; }
    // throw: right arm winds back during charge, whips forward on release
    if (charge >= 0) {
      const c = Math.min(1, charge);
      J.uarmR.rotation.set(-2.2 - c * 0.9, 0.35, -0.5 - c * 0.4);
      J.larmR.rotation.set(-0.9 - c * 0.6, 0, 0);
      J.torso.rotation.y = 0.35 * c;
      J.uarmL.rotation.set(-1.0 + c * -0.3, -0.3, 0.5); // left arm points at the target
      J.larmL.rotation.set(-0.2, 0, 0);
    } else if (releasing > 0) {
      const r = releasing; // 1 → 0
      J.uarmR.rotation.set(-1.2 + (1 - r) * 0.9, -0.2, -0.3);
      J.larmR.rotation.set(-0.2, 0, 0);
      J.torso.rotation.y = -0.4 * r;
    }
    if (dizzy > 0) {
      J.torso.rotation.z = Math.sin(t * 9) * 0.12 * dizzy;
      J.head.rotation.y = Math.sin(t * 6) * 0.6 * dizzy;
      J.uarmL.rotation.set(-1.5, 0, 0.8); J.uarmR.rotation.set(-1.5, 0, -0.8);
    }
    // busker: arms hold the guitar
    if (this.look.guitar) { J.uarmL.rotation.set(-0.9, 0.5, 0.9); J.larmL.rotation.set(-1.2, 0, 0); J.uarmR.rotation.set(-0.6, 0, -0.2); J.larmR.rotation.set(-1.3, 0, 0); }
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < PARTS.length; i++) this.bones[i].matrixWorld.copy(this.joints[PARTS[i].n].matrixWorld);
    this.afterBones();
  }

  // drive from physics bodies: bodies[i] has .position/.quaternion for part i's mesh centre
  updateFromBodies(bodies) {
    for (let i = 0; i < PARTS.length; i++) {
      const b = bodies[i], p = PARTS[i];
      _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      // joint = centre − R·(meshOffset·scale)
      _v.set(p.m[0], p.m[1], p.m[2]).multiplyScalar(this.scale).applyQuaternion(_q);
      _v.set(b.position.x - _v.x, b.position.y - _v.y, b.position.z - _v.z);
      _s.setScalar(this.scale);
      this.bones[i].matrixWorld.compose(_v, _q, _s);
    }
    this.afterBones();
  }

  afterBones() {
    // accessories follow their bone; bounding sphere follows the hips
    for (const a of this.accessories) {
      _m.makeTranslation(a.off.x, a.off.y, a.off.z);
      a.mesh.matrix.copy(this.bones[a.bone].matrixWorld).multiply(_m);
      if (a.rot) a.mesh.matrix.multiply(_m.makeRotationFromQuaternion(a.rot));
      a.mesh.matrixWorld.copy(a.mesh.matrix);
    }
    const hm = this.bones[PART_INDEX.hips].matrixWorld.elements;
    this.mesh.boundingSphere.center.set(hm[12], hm[13], hm[14]);
  }

  // world position of a joint (after update)
  jointWorld(name, out) {
    const e = this.bones[PART_INDEX[name]].matrixWorld.elements;
    return out.set(e[12], e[13], e[14]);
  }
  // world transform of a part's mesh centre → {pos, quat}
  partWorld(i, pos, quat) {
    const m = this.bones[i].matrixWorld;
    m.decompose(pos, quat, _s);
    _v.set(PARTS[i].m[0], PARTS[i].m[1], PARTS[i].m[2]).multiplyScalar(this.scale).applyQuaternion(quat);
    pos.add(_v);
    return { pos, quat };
  }

  setVisible(v) { this.group.visible = v; }
  dispose() { this.material.dispose(); this.atlas.dispose(); }
}

// simple handheld props, built once
export function makeProp(kind) {
  const g = new THREE.Group();
  const m = (geo, color, rough = 0.7) => { const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough })); mesh.castShadow = true; g.add(mesh); return mesh; };
  if (kind === 'camera') {
    m(new THREE.BoxGeometry(0.14, 0.09, 0.08), '#222');
    const lens = m(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 10), '#111'); lens.rotation.x = Math.PI / 2; lens.position.z = -0.06;
  } else if (kind === 'creemee') {
    const cone = m(new THREE.ConeGeometry(0.045, 0.14, 10), '#d9a35a'); cone.rotation.x = Math.PI; cone.position.y = -0.02;
    const swirl = m(new THREE.SphereGeometry(0.05, 10, 8), '#f3e2bf', 0.5); swirl.position.y = 0.07; swirl.scale.set(1, 1.3, 1);
  } else if (kind === 'guitar') {
    const body = m(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 12), '#c98a3a'); body.rotation.x = Math.PI / 2;
    const neck = m(new THREE.BoxGeometry(0.04, 0.55, 0.03), '#4a2e1a'); neck.position.set(0.1, 0.3, 0); neck.rotation.z = -0.3;
  } else if (kind === 'mat') {
    const mat = m(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 10), '#7a4fc2'); mat.rotation.x = Math.PI / 2;
  } else if (kind === 'board') {
    const b = m(new THREE.BoxGeometry(0.22, 0.02, 0.8), '#3b2a2a'); b.position.y = 0.04;
    for (const z of [-0.25, 0.25]) for (const x of [-0.08, 0.08]) { const w = m(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), '#eee'); w.rotation.z = Math.PI / 2; w.position.set(x, 0.0, z); }
  }
  return g;
}
