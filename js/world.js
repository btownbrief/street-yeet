// Church Street, Burlington VT — built from boxes, canvases and love.
// Produces the three.js scene content plus a plain list of static colliders
// for physics.js and obstacle circles for npcs.js. Nothing here knows about
// scoring or input.
import * as THREE from '../vendor/three.module.min.js';
import { STREET, ROSTER } from './roster.js';
import * as T from './textures.js';

const HW = STREET.halfWidth;
const GROUND_H = 4.4;       // storefront floor height
const FLOOR_H = 3.5;
const DEPTH = 14;

// ---------- merge helper: many static geometries → one mesh per material ----------
class Merger {
  constructor() { this.groups = new Map(); }
  add(key, material, geo, matrix, tile = 0) {
    const g = geo.clone();
    if (tile && matrix && geo === BOX) scaleBoxUVs(g, matrix, tile);
    if (matrix) g.applyMatrix4(matrix);
    if (!this.groups.has(key)) this.groups.set(key, { material, geos: [] });
    this.groups.get(key).geos.push(g);
  }
  build(parent, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [key, { material, geos }] of this.groups) {
      const merged = mergeIndexed(geos);
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'merged:' + key;
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      meshes.push(mesh);
      for (const g of geos) g.dispose();
    }
    return meshes;
  }
}
// BoxGeometry faces in order +x,-x,+y,-y,+z,-z (4 verts each). Scale each
// face's uv by its world size so a tiling texture repeats every `tile` metres.
const _sc = new THREE.Vector3();
function scaleBoxUVs(g, matrix, tile) {
  _sc.setFromMatrixScale(matrix);
  const uv = g.attributes.uv;
  const sizes = [[_sc.z, _sc.y], [_sc.z, _sc.y], [_sc.x, _sc.z], [_sc.x, _sc.z], [_sc.x, _sc.y], [_sc.x, _sc.y]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = sizes[f];
    for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * su / tile, uv.getY(k) * sv / tile); }
  }
}
function mergeIndexed(geos) {
  const names = ['position', 'normal', 'uv'];
  let vcount = 0, icount = 0;
  for (const g of geos) { vcount += g.attributes.position.count; icount += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(vcount * size);
    let off = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, off); off += g.attributes[name].count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const idx = new (vcount > 65535 ? Uint32Array : Uint16Array)(icount);
  let io = 0, vo = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
    else for (let i = 0; i < n; i++) idx[io++] = vo + i;
    vo += n;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function mat(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return _m4.compose(_p, _q, _s);
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const SPH = new THREE.SphereGeometry(1, 10, 8);

export function buildWorld(scene, { quality = 'high' } = {}) {
  const rng = T.mulberry(2026);
  const out = {
    colliders: [],      // { x, y, z, sx, sy, sz, ry } static boxes (centre + size)
    obstacles: [],      // { x, z, r } circles NPCs steer around
    cameraBlockers: [], // meshes the camera ray-tests against
    cafeSpots: [],
    cows: [],           // { mesh, x, z } painted cows (dynamic bodies in physics.js)
    bell: null,
    pigeonSpots: [],
    carts: [],
    spawn: { x: 0, z: 40 },
    lights: {},
    animated: [],       // objects with .update(dt)
  };
  const M = new Merger();

  // ---------- materials ----------
  const paverMap = T.paverTexture(); paverMap.repeat.set(1, 1);
  const asphaltMap = T.asphaltTexture();
  const concreteMap = T.concreteTexture();
  const grassMap = T.grassTexture();
  const MATS = {
    paver: new THREE.MeshStandardMaterial({ map: paverMap, roughness: 0.95 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asphaltMap, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteMap, roughness: 0.95 }),
    grass: new THREE.MeshStandardMaterial({ map: grassMap, roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ color: '#1f2023', roughness: 0.6, metalness: 0.5 }),
    ironRust: new THREE.MeshStandardMaterial({ color: '#5a3a2a', roughness: 0.9, metalness: 0.2 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.85 }),
    granite: new THREE.MeshStandardMaterial({ color: '#9a9691', roughness: 0.8 }),
    graniteDark: new THREE.MeshStandardMaterial({ color: '#6c6a66', roughness: 0.85 }),
    marble: new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.7 }),
    trimWhite: new THREE.MeshStandardMaterial({ color: '#f1ebdd', roughness: 0.8 }),
    greenTrim: new THREE.MeshStandardMaterial({ color: '#2f5d50', roughness: 0.8 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#5c4a2a', roughness: 0.45, metalness: 0.7 }),
    bronzeLight: new THREE.MeshStandardMaterial({ color: '#7a6438', roughness: 0.4, metalness: 0.7 }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3a2e', roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: '#9dc4dd', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.55 }),
    globe: new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffe7b0', emissiveIntensity: 0.9, roughness: 0.4 }),
    slate: new THREE.MeshStandardMaterial({ color: '#3e4652', roughness: 0.9 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d9b23a', roughness: 0.3, metalness: 0.8 }),
    darkRed: new THREE.MeshStandardMaterial({ color: '#6b1f1f', roughness: 0.8 }),
    trash: new THREE.MeshStandardMaterial({ color: '#1f4d3a', roughness: 0.7 }),
    planter: new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.9 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#4f8a3a', roughness: 1 }),
    flowers: new THREE.MeshStandardMaterial({ color: '#e84a8a', roughness: 1 }),
    blackMetal: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.5, metalness: 0.4 }),
    cart: new THREE.MeshStandardMaterial({ color: '#f3e9d2', roughness: 0.8 }),
    cartGreen: new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: 0.8 }),
    umbrellaRed: new THREE.MeshStandardMaterial({ color: '#c8322b', roughness: 0.8, side: THREE.DoubleSide }),
    umbrellaGreen: new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: 0.8, side: THREE.DoubleSide }),
    umbrellaYellow: new THREE.MeshStandardMaterial({ color: '#e8b84a', roughness: 0.8, side: THREE.DoubleSide }),
    umbrellaBlue: new THREE.MeshStandardMaterial({ color: '#2a5ea8', roughness: 0.8, side: THREE.DoubleSide }),
    car: [new THREE.MeshStandardMaterial({ color: '#b8312a', roughness: 0.4, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.4, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#2a4a8a', roughness: 0.4, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.4, metalness: 0.4 })],
    tire: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 }),
  };
  const brickMats = T.FACADE_STYLES.map((_, i) => new THREE.MeshStandardMaterial({ map: T.brickTexture(i, i * 7), roughness: 0.95 }));
  const facadeMats = T.FACADE_STYLES.map((_, i) => new THREE.MeshStandardMaterial({ map: T.facadeTexture(i, 100 + i * 13), roughness: 0.9 }));
  const trimMatFor = (i) => { const s = T.FACADE_STYLES[i]; return new THREE.MeshStandardMaterial({ color: s.trim, roughness: 0.85 }); };
  const trimMats = T.FACADE_STYLES.map((_, i) => trimMatFor(i));
  const awningMats = new Map();
  const awningMat = (color, stripes) => {
    const key = color + (stripes ? 's' : '');
    if (!awningMats.has(key)) awningMats.set(key, new THREE.MeshStandardMaterial({ map: T.awningTexture(color, stripes, 1), roughness: 0.9, side: THREE.DoubleSide }));
    return awningMats.get(key);
  };

  // ---------- ground ----------
  const zLen = STREET.zSouth - STREET.zNorth;
  {
    // Church St pavers
    const g = new THREE.PlaneGeometry(HW * 2, zLen + 90);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (HW * 2 / 4), uv.getY(i) * ((zLen + 90) / 4));
    const mesh = new THREE.Mesh(g, MATS.paver);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, 0, (STREET.zNorth + STREET.zSouth) / 2 + 20);
    mesh.receiveShadow = true; scene.add(mesh);
    // far ground (dark, fogged) under everything else
    const far = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: '#50564a', roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(0, -0.05, 220); far.receiveShadow = true; scene.add(far);
  }
  // cross streets: asphalt + concrete sidewalks + crosswalk stripes
  const crosswalkMat = new THREE.MeshStandardMaterial({ map: T.crosswalkTexture(), transparent: true, roughness: 1, depthWrite: false });
  for (const c of STREET.crosses) {
    const g = new THREE.PlaneGeometry(120, STREET.crossWidth - 4);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 30, uv.getY(i) * 2.5);
    const road = new THREE.Mesh(g, MATS.asphalt);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, c.z); road.receiveShadow = true; scene.add(road);
    for (const side of [-1, 1]) {
      const sg = new THREE.PlaneGeometry(120, 2.2);
      const suv = sg.attributes.uv; for (let i = 0; i < suv.count; i++) suv.setXY(i, suv.getX(i) * 40, suv.getY(i));
      const sw = new THREE.Mesh(sg, MATS.concrete);
      sw.rotation.x = -Math.PI / 2; sw.position.set(0, 0.02, c.z + side * (STREET.crossWidth / 2 - 1)); sw.receiveShadow = true; scene.add(sw);
    }
    // crosswalks where the bricks meet the asphalt, both sides of Church St
    for (const sx of [-1, 1]) {
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(3.2, STREET.crossWidth - 4), crosswalkMat);
      cw.rotation.x = -Math.PI / 2; cw.rotation.z = 0; cw.position.set(sx * (HW + 2.2), 0.03, c.z); scene.add(cw);
    }
    // parked cars down the side streets (static props)
    for (const sx of [-1, 1]) {
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const x = sx * (HW + 22 + i * 9 + rng() * 3), z = c.z + (rng() < 0.5 ? -1 : 1) * 3.6;
        addCar(scene, M, MATS, out, x, z, rng);
      }
    }
  }
  // church lawn at the head of the street
  {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(44, 30), MATS.grass);
    lawn.material.map.repeat.set(11, 7);
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.015, STREET.zNorth - 17); lawn.receiveShadow = true; scene.add(lawn);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(4, 12), MATS.concrete);
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.03, STREET.zNorth - 6); path.receiveShadow = true; scene.add(path);
  }

  // ---------- buildings along Church St ----------
  let sfSeed = 1;
  const addBuilding = (b) => {
    // b: { side, z0, z1, spec, floors, style }
    const len = b.z1 - b.z0, zc = (b.z0 + b.z1) / 2;
    const side = b.side;
    const upperH = b.floors * FLOOR_H;
    const totalH = GROUND_H + upperH + 0.7;
    const xFace = side * HW;
    const xc = side * (HW + DEPTH / 2);
    const si = b.style;
    // body (plain brick)
    M.add('brick' + si, brickMats[si], BOX, mat(xc, totalH / 2, zc, 0, DEPTH, totalH, len), 1.3);
    // uv-scaled front window plane for the upper floors
    const bays = Math.max(1, Math.round(len / 3.8));
    const front = new THREE.PlaneGeometry(len, upperH);
    const uv = front.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * bays, uv.getY(i) * b.floors);
    M.add('facade' + si, facadeMats[si], front, mat(xFace - side * 0.04, GROUND_H + upperH / 2, zc, side > 0 ? -Math.PI / 2 : Math.PI / 2));
    // cornice + parapet cap + belt course
    M.add('trim' + si, trimMats[si], BOX, mat(xFace - side * 0.25, totalH - 0.35, zc, 0, 0.6, 0.7, len + 0.2));
    M.add('trim' + si, trimMats[si], BOX, mat(xFace - side * 0.1, GROUND_H + 0.1, zc, 0, 0.3, 0.25, len));
    // storefront strip
    const spec = b.spec;
    if (spec.landmark) return; // civic buildings are built separately
    const sfTex = spec.kind === 'plain' ? T.plainStorefrontTexture(sfSeed++) : T.storefrontTexture({ ...spec, number: spec.number, doorRight: (sfSeed++ % 2) === 0 }, sfSeed * 7 + 3);
    const sfMat = new THREE.MeshStandardMaterial({ map: sfTex, roughness: 0.85 });
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(len, GROUND_H), sfMat);
    sf.position.set(xFace - side * 0.03, GROUND_H / 2, zc); sf.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    sf.matrixAutoUpdate = false; sf.updateMatrix(); sf.receiveShadow = true; scene.add(sf);
    // awning
    if (spec.a) {
      const am = awningMat(spec.a, !!spec.s);
      const aw = Math.min(len - 0.6, 7.5), proj = 1.5;
      // sloped top (a thin box tilted down away from the wall) + hanging valance
      M.add('awn' + spec.a + (spec.s ? 's' : ''), am, BOX, mat(xFace - side * proj / 2, 3.35, zc, 0, proj, 0.05, aw, 0, side * 0.42));
      M.add('awn' + spec.a + (spec.s ? 's' : ''), am, BOX, mat(xFace - side * proj, 2.95, zc, 0, 0.04, 0.35, aw));
      // hidden collision? awnings are decor; projectiles pass through (keeps throws readable)
    }
    // café seating
    if (spec.tables) out.cafeSpots.push({ side, z0: b.z0 + 1, z1: b.z1 - 1 });
    if (spec.joe) out.joe = { side, z: zc };
    if (spec.cow) out.cowSpot = { side, z0: b.z0, z1: b.z1 };
  };

  const buildings = [];
  ROSTER.forEach((blk, bi) => {
    const { z0, z1 } = STREET.blocks[bi];
    for (const sideKey of ['east', 'west']) {
      const list = blk[sideKey];
      const side = sideKey === 'east' ? 1 : -1;
      const weights = list.map((s) => s.wide || 1);
      const totalW = weights.reduce((a, b) => a + b, 0);
      let z = z0;
      list.forEach((spec, i) => {
        const len = (z1 - z0) * weights[i] / totalW;
        const floors = spec.kind === 'big' ? 3 : spec.landmark ? 0 : 2 + Math.floor(rng() * 3);
        const style = Math.floor(rng() * T.FACADE_STYLES.length);
        const b = { side, z0: z, z1: z + len, spec, floors: Math.max(1, floors), style };
        buildings.push(b);
        if (!spec.landmark) addBuilding(b);
        z += len;
      });
      // collider for the whole block face (one box per side per block)
      out.colliders.push({ x: side * (HW + DEPTH / 2), y: 10, z: (z0 + z1) / 2, sx: DEPTH, sy: 20, sz: z1 - z0 });
    }
  });

  // side-street buildings (generic) + corners
  for (const c of STREET.crosses) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      // skip corners that are the church lawn (north of Pearl)
      if (c.z === 0 && sz < 0) continue;
      let x = sx * (HW + DEPTH);
      const zFace = c.z + sz * (STREET.crossWidth / 2);
      for (let i = 0; i < 4; i++) {
        const len = 8 + rng() * 8;
        const floors = 2 + Math.floor(rng() * 2);
        const style = Math.floor(rng() * T.FACADE_STYLES.length);
        const upperH = floors * FLOOR_H, totalH = GROUND_H + upperH + 0.7;
        const xc = x + sx * len / 2, zc = zFace + sz * DEPTH / 2;
        M.add('brick' + style, brickMats[style], BOX, mat(xc, totalH / 2, zc, 0, len, totalH, DEPTH), 1.3);
        const bays = Math.max(1, Math.round(len / 3.8));
        const front = new THREE.PlaneGeometry(len, upperH);
        const uv = front.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * bays, uv.getY(k) * floors);
        M.add('facade' + style, facadeMats[style], front, mat(xc, GROUND_H + upperH / 2, zFace - sz * 0.04, sz > 0 ? Math.PI : 0));
        M.add('trim' + style, trimMats[style], BOX, mat(xc, totalH - 0.35, zFace - sz * 0.25, 0, len + 0.2, 0.7, 0.6));
        const sfTex = T.plainStorefrontTexture(sfSeed++);
        const sf = new THREE.Mesh(new THREE.PlaneGeometry(len, GROUND_H), new THREE.MeshStandardMaterial({ map: sfTex, roughness: 0.85 }));
        sf.position.set(xc, GROUND_H / 2, zFace - sz * 0.03); sf.rotation.y = sz > 0 ? Math.PI : 0;
        sf.matrixAutoUpdate = false; sf.updateMatrix(); scene.add(sf);
        x += sx * len;
      }
      out.colliders.push({ x: sx * (HW + DEPTH + 25), y: 10, z: zFace + sz * DEPTH / 2, sx: 50, sy: 20, sz: DEPTH });
    }
    // invisible end walls down each side street
    for (const sx of [-1, 1]) out.colliders.push({ x: sx * (HW + DEPTH + 34), y: 5, z: c.z, sx: 1, sy: 10, sz: STREET.crossWidth + 2, invisible: true });
  }
  // south of Main: the street keeps going (generic), then an invisible wall
  for (const side of [-1, 1]) {
    let z = STREET.zSouth;
    for (let i = 0; i < 5; i++) {
      const len = 10 + rng() * 8, floors = 2 + Math.floor(rng() * 3), style = Math.floor(rng() * T.FACADE_STYLES.length);
      const upperH = floors * FLOOR_H, totalH = GROUND_H + upperH + 0.7, zc = z + len / 2, xc = side * (HW + DEPTH / 2), xFace = side * HW;
      M.add('brick' + style, brickMats[style], BOX, mat(xc, totalH / 2, zc, 0, DEPTH, totalH, len), 1.3);
      const front = new THREE.PlaneGeometry(len, upperH);
      const uv = front.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.round(len / 3.8), uv.getY(k) * floors);
      M.add('facade' + style, facadeMats[style], front, mat(xFace - side * 0.04, GROUND_H + upperH / 2, zc, side > 0 ? -Math.PI / 2 : Math.PI / 2));
      const sf = new THREE.Mesh(new THREE.PlaneGeometry(len, GROUND_H), new THREE.MeshStandardMaterial({ map: T.plainStorefrontTexture(sfSeed++), roughness: 0.85 }));
      sf.position.set(xFace - side * 0.03, GROUND_H / 2, zc); sf.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; sf.matrixAutoUpdate = false; sf.updateMatrix(); scene.add(sf);
      z += len;
    }
    out.colliders.push({ x: side * (HW + DEPTH / 2), y: 10, z: STREET.zSouth + 40, sx: DEPTH, sy: 20, sz: 80 });
  }
  out.colliders.push({ x: 0, y: 5, z: STREET.zSouth + 52, sx: HW * 2 + 2, sy: 10, sz: 1, invisible: true });

  // ---------- civic landmarks ----------
  for (const b of buildings) {
    if (b.spec.landmark === 'cityhall') buildCityHall(scene, M, MATS, out, b);
    if (b.spec.landmark === 'firehouse') buildFirehouse(scene, M, MATS, out, b, brickMats, trimMats);
  }
  buildChurch(scene, M, MATS, out, brickMats);

  // ---------- street furniture ----------
  buildFurniture(scene, M, MATS, out, rng);

  // ---------- far backdrop: Lake Champlain + Adirondacks to the west, hill to the east ----------
  buildBackdrop(scene, M, brickMats, rng);

  const merged = M.build(scene);
  out.cameraBlockers.push(...merged.filter((m) => m.name.startsWith('merged:brick')));
  return out;
}

// ---------- cars (parked on side streets) ----------
function addCar(scene, M, MATS, out, x, z, rng) {
  const body = MATS.car[Math.floor(rng() * MATS.car.length)];
  const key = 'car' + MATS.car.indexOf(body);
  M.add(key, body, BOX, mat(x, 0.55, z, 0, 4.2, 0.7, 1.8));
  M.add(key, body, BOX, mat(x - 0.2, 1.15, z, 0, 2.2, 0.6, 1.7));
  M.add('glass', MATS.glass, BOX, mat(x - 0.2, 1.15, z, 0, 2.25, 0.5, 1.72));
  for (const dx of [-1.3, 1.3]) for (const dz of [-0.85, 0.85]) M.add('tire', MATS.tire, CYL, mat(x + dx, 0.33, z + dz, 0, 0.33, 0.25, 0.33, Math.PI / 2));
  out.colliders.push({ x, y: 0.8, z, sx: 4.2, sy: 1.6, sz: 1.8 });
  out.obstacles.push({ x, z, r: 2.4 });
}

// ---------- City Hall (149 Church): brick, marble pilasters, cupola, double stair, Stout bronzes ----------
function buildCityHall(scene, M, MATS, out, b) {
  const side = b.side, len = b.z1 - b.z0, zc = (b.z0 + b.z1) / 2;
  const setback = 3.5, xFace = side * (HW + setback), xc = side * (HW + setback + 8);
  const H = 15;
  const brick = new THREE.MeshStandardMaterial({ map: T.brickTexture(0, 404), roughness: 0.95 });
  M.add('cityhall-brick', brick, BOX, mat(xc, H / 2, zc, 0, 16, H, len - 1), 1.3);
  // marble base + pilasters + cornice
  M.add('marble', MATS.marble, BOX, mat(xc, 1.5, zc, 0, 16.2, 3, len - 0.8));
  const nPil = 9;
  for (let i = 0; i < nPil; i++) {
    const z = b.z0 + 1.5 + i * ((len - 3) / (nPil - 1));
    M.add('marble', MATS.marble, BOX, mat(xFace - side * 0.25, 3 + 5.5, z, 0, 0.5, 11, 1.1));
    // tall windows between pilasters
    if (i < nPil - 1) {
      const zw = z + (len - 3) / (nPil - 1) / 2;
      for (const y of [5.5, 9.8]) M.add('glass', MATS.glass, BOX, mat(xFace - side * 0.1, y, zw, 0, 0.2, 2.8, 1.6));
    }
  }
  M.add('marble', MATS.marble, BOX, mat(xFace - side * 0.3, H - 0.6, zc, 0, 0.9, 1.2, len - 0.6));
  M.add('marble', MATS.marble, BOX, mat(xc, H + 0.3, zc, 0, 16.4, 0.6, len - 0.6));
  // entrance: arch + "CITY HALL" plate, balcony
  M.add('marble', MATS.marble, BOX, mat(xFace - side * 0.4, 6.5, zc, 0, 0.8, 6, 4.4));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), new THREE.MeshStandardMaterial({ map: T.textPlateTexture('CITY HALL', { bg: '#efe9dc', fg: '#2b2b2b', font: '700 54px Georgia, serif' }), roughness: 0.7 }));
  plate.position.set(xFace - side * 0.82, 8.3, zc); plate.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(plate);
  M.add('glass', MATS.glass, BOX, mat(xFace - side * 0.7, 6.2, zc, 0, 0.2, 3.2, 2.6));
  M.add('iron', MATS.iron, BOX, mat(xFace - side * 1.6, 4.4, zc, 0, 2.4, 0.08, 5.5)); // balcony floor
  M.add('iron', MATS.iron, BOX, mat(xFace - side * 2.8, 4.9, zc, 0, 0.06, 1.0, 5.5)); // railing
  // double staircase: two ramps of granite steps
  for (const dz of [-1, 1]) for (let s = 0; s < 8; s++) {
    M.add('granite', MATS.granite, BOX, mat(xFace - side * (3 + s * 0.45), 0.25 + s * 0.5 * 0.75 + 0.2, zc + dz * (3.2 + s * 0.15), 0, 0.5, 0.5 * 0.75 * (s + 1) + 0.4, 2.2));
  }
  // granite plaza
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(setback + 1, len), MATS.granite);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(side * (HW + setback / 2), 0.02, zc); plaza.receiveShadow = true; scene.add(plaza);
  // cupola
  const cx = xc, cz = zc;
  M.add('white', MATS.white, BOX, mat(cx, H + 1.8, cz, 0, 3.2, 3, 3.2));
  M.add('white', MATS.white, CYL, mat(cx, H + 4.2, cz, 0, 1.4, 2, 1.4));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; M.add('white', MATS.white, CYL, mat(cx + Math.cos(a) * 1.35, H + 4.2, cz + Math.sin(a) * 1.35, 0, 0.12, 2.2, 0.12)); }
  M.add('gold', MATS.gold, SPH, mat(cx, H + 5.8, cz, 0, 1.2, 0.9, 1.2));
  M.add('gold', MATS.gold, CYL, mat(cx, H + 6.9, cz, 0, 0.05, 1.4, 0.05));
  // Frank Stout bronzes: deer on the left, bear on the right of the stairs
  buildDeer(M, MATS, side * (HW + 1.2), zc - len / 2 + 4, side > 0 ? 0.6 : Math.PI - 0.6);
  buildBear(M, MATS, side * (HW + 1.2), zc + len / 2 - 4);
  out.obstacles.push({ x: side * (HW + 1.2), z: zc - len / 2 + 4, r: 1.4 }, { x: side * (HW + 1.2), z: zc + len / 2 - 4, r: 1.4 });
  out.colliders.push({ x: side * (HW + setback + 8), y: 8, z: zc, sx: 16, sy: 16, sz: len - 1 });
  out.colliders.push({ x: side * (HW + 1.2), y: 0.6, z: zc - len / 2 + 4, sx: 1.4, sy: 1.2, sz: 2.2 });
  out.colliders.push({ x: side * (HW + 1.2), y: 0.6, z: zc + len / 2 - 4, sx: 1.6, sy: 1.2, sz: 1.6 });
  for (const dz of [-1, 1]) out.colliders.push({ x: xFace - side * 2.5, y: 1.2, z: zc + dz * 3.6, sx: 4, sy: 2.4, sz: 2.4 });
}
function buildDeer(M, MATS, x, z, ry) {
  M.add('granite', MATS.granite, BOX, mat(x, 0.3, z, 0, 1.2, 0.6, 2.0));
  M.add('bronze', MATS.bronze, BOX, mat(x, 1.25, z, ry, 0.5, 0.55, 1.3));
  M.add('bronze', MATS.bronze, BOX, mat(x, 1.75, z - 0.7, ry, 0.25, 0.7, 0.3)); // neck
  M.add('bronze', MATS.bronze, BOX, mat(x, 2.05, z - 0.95, ry, 0.22, 0.22, 0.5)); // head
  for (const dx of [-0.18, 0.18]) for (const dz of [-0.45, 0.45]) M.add('bronze', MATS.bronze, BOX, mat(x + dx, 0.8, z + dz, 0, 0.1, 0.6, 0.1));
  for (const dx of [-0.12, 0.12]) M.add('bronze', MATS.bronze, BOX, mat(x + dx, 2.4, z - 0.95, 0, 0.04, 0.5, 0.2)); // antlers
}
function buildBear(M, MATS, x, z) {
  M.add('granite', MATS.granite, BOX, mat(x, 0.3, z, 0, 1.5, 0.6, 1.5));
  M.add('bronze', MATS.bronze, SPH, mat(x, 1.15, z, 0, 0.6, 0.55, 0.75));
  M.add('bronze', MATS.bronze, SPH, mat(x, 1.55, z - 0.55, 0, 0.32, 0.3, 0.35));
  M.add('bronze', MATS.bronze, SPH, mat(x, 1.45, z - 0.82, 0, 0.14, 0.12, 0.16));
  for (const dx of [-0.2, 0.2]) M.add('bronze', MATS.bronze, SPH, mat(x + dx, 1.8, z - 0.55, 0, 0.1, 0.1, 0.06));
}

// ---------- BCA Center (135 Church): the old firehouse ----------
function buildFirehouse(scene, M, MATS, out, b, brickMats, trimMats) {
  const side = b.side, len = b.z1 - b.z0, zc = (b.z0 + b.z1) / 2;
  const xFace = side * HW, xc = side * (HW + DEPTH / 2), H = 15.5;
  M.add('brick1', brickMats[1], BOX, mat(xc, H / 2, zc, 0, DEPTH, H, len), 1.3);
  // three big arched bays on the ground floor (green trim + glass)
  for (let i = 0; i < 3; i++) {
    const z = b.z0 + len * (0.2 + i * 0.3);
    M.add('greenTrim', MATS.greenTrim, BOX, mat(xFace - side * 0.15, 2.6, z, 0, 0.3, 5.2, 3.2));
    M.add('greenTrim', MATS.greenTrim, CYL, mat(xFace - side * 0.15, 5.2, z, 0, 1.6, 0.3, 1.6, 0, Math.PI / 2));
    M.add('glass', MATS.glass, BOX, mat(xFace - side * 0.05, 2.6, z, 0, 0.1, 4.6, 2.6));
  }
  // upper arched windows
  for (let i = 0; i < 4; i++) for (const y of [8.2, 12]) {
    const z = b.z0 + len * (0.14 + i * 0.24);
    M.add('trim1', trimMats[1], BOX, mat(xFace - side * 0.1, y, z, 0, 0.2, 2.6, 1.4));
    M.add('trim1', trimMats[1], CYL, mat(xFace - side * 0.1, y + 1.3, z, 0, 0.7, 0.2, 0.7, 0, Math.PI / 2));
    M.add('glass', MATS.glass, BOX, mat(xFace - side * 0.02, y, z, 0, 0.1, 2.2, 1.0));
  }
  M.add('trim1', trimMats[1], BOX, mat(xFace - side * 0.3, H - 0.4, zc, 0, 0.7, 0.8, len + 0.2));
  M.add('greenTrim', MATS.greenTrim, BOX, mat(xFace - side * 0.12, GROUND_H + 0.9, zc, 0, 0.25, 0.5, len));
  // BCA sign
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.9), new THREE.MeshStandardMaterial({ map: T.textPlateTexture('BCA CENTER', { bg: '#2f5d50', fg: '#f6f0dc', font: '800 54px "Trebuchet MS", Arial' }), roughness: 0.7 }));
  plate.position.set(xFace - side * 0.35, GROUND_H + 1.7, zc); plate.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(plate);
  // cupola
  M.add('white', MATS.white, BOX, mat(xc, H + 1.4, zc, 0, 2.6, 2.6, 2.6));
  M.add('slate', MATS.slate, CYL, mat(xc, H + 3.6, zc, 0, 0.01, 2.2, 2.0)); // pointed cap (cone via cylinder top radius→0)
  M.add('gold', MATS.gold, CYL, mat(xc, H + 5.2, zc, 0, 0.04, 1.2, 0.04));
  // "park peek": the gap between BCA and City Hall shows trees + lawn
}

// ---------- Unitarian church at the head of Church Street ----------
function buildChurch(scene, M, MATS, out, brickMats) {
  const zF = STREET.zNorth - 24; // front wall
  const brick = new THREE.MeshStandardMaterial({ map: T.brickTexture(1, 909), roughness: 0.95 });
  const W = 19, D = 32, H = 11;
  const zc = zF - D / 2;
  M.add('church-brick', brick, BOX, mat(0, H / 2, zc, 0, W, H, D), 1.3);
  // gable roof: two slanted slabs
  const roofH = 5.5, half = W / 2;
  const pitch = Math.atan2(roofH, half), slant = Math.hypot(roofH, half);
  M.add('slate', MATS.slate, BOX, mat(-half / 2, H + roofH / 2, zc, 0, slant + 0.4, 0.35, D + 1, 0, pitch));
  M.add('slate', MATS.slate, BOX, mat(half / 2, H + roofH / 2, zc, 0, slant + 0.4, 0.35, D + 1, 0, -pitch));
  // front pediment (white) + pilasters
  const ped = new THREE.Shape(); ped.moveTo(-half - 0.3, H); ped.lineTo(half + 0.3, H); ped.lineTo(0, H + roofH); ped.closePath();
  const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: 0.5, bevelEnabled: false });
  M.add('white', MATS.white, pedGeo, mat(0, 0, zF + 0.05));
  for (let i = 0; i < 4; i++) {
    const x = -6 + i * 4;
    M.add('white', MATS.white, BOX, mat(x, H / 2, zF + 0.35, 0, 0.9, H, 0.7));
  }
  M.add('white', MATS.white, BOX, mat(0, H - 0.3, zF + 0.35, 0, W + 0.6, 0.7, 0.8));
  // doors + tall windows on the front
  for (const x of [-4, 0, 4]) {
    M.add('darkRed', MATS.darkRed, BOX, mat(x, 1.6, zF + 0.35, 0, 1.7, 3.2, 0.3));
    M.add('glass', MATS.glass, BOX, mat(x, 6.5, zF + 0.35, 0, 1.4, 3.4, 0.3));
    M.add('white', MATS.white, CYL, mat(x, 8.2, zF + 0.35, 0, 0.7, 0.35, 0.7, Math.PI / 2));
  }
  // side windows
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
    M.add('glass', MATS.glass, BOX, mat(sx * (W / 2 + 0.05), 5.5, zF - 4 - i * 4.5, 0, 0.2, 4.5, 1.6));
    M.add('white', MATS.white, CYL, mat(sx * (W / 2 + 0.05), 7.8, zF - 4 - i * 4.5, 0, 0.8, 0.25, 0.8, 0, Math.PI / 2));
  }
  // tower: brick base, white clock stage, belfry, spire
  const tz = zF - 4;
  M.add('church-brick', brick, BOX, mat(0, (H + 4) / 2, tz, 0, 6.5, H + 4, 6.5), 1.3);
  M.add('white', MATS.white, BOX, mat(0, H + 4 + 2.5, tz, 0, 6.9, 5, 6.9));
  const clockTex = T.clockTexture();
  const clockMat = new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.6 });
  for (const [dx, dz, ry] of [[0, 3.5, 0], [0, -3.5, Math.PI], [3.5, 0, Math.PI / 2], [-3.5, 0, -Math.PI / 2]]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), clockMat);
    c.position.set(dx, H + 4 + 2.5, tz + dz); c.rotation.y = ry; scene.add(c);
  }
  const belfryY = H + 9;
  M.add('white', MATS.white, CYL, mat(0, belfryY + 2.2, tz, 0, 2.6, 4.4, 2.6)); // octagonal-ish (10 seg)
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; M.add('white', MATS.white, CYL, mat(Math.cos(a) * 2.9, belfryY + 2.2, tz + Math.sin(a) * 2.9, 0, 0.18, 4.6, 0.18)); }
  M.add('white', MATS.white, CYL, mat(0, belfryY + 4.8, tz, 0, 3.3, 0.6, 3.3));
  M.add('white', MATS.white, CYL, mat(0, belfryY + 5.3 + 6.5, tz, 0, 0.02, 13, 2.4)); // spire
  M.add('gold', MATS.gold, CYL, mat(0, belfryY + 19.2, tz, 0, 0.05, 1.8, 0.05));
  M.add('gold', MATS.gold, SPH, mat(0, belfryY + 18.4, tz, 0, 0.35, 0.35, 0.35));
  // the bell: a trigger volume inside the belfry. Hit it for BELL RINGER.
  out.bell = { x: 0, y: belfryY + 2.2, z: tz, r: 2.6 };
  // iron fence along Pearl, with a gap for the path
  for (const sx of [-1, 1]) M.add('iron', MATS.iron, BOX, mat(sx * 12, 0.6, STREET.zNorth - 0.5, 0, 18, 1.1, 0.06));
  // a few maples on the lawn (red — it's October)
  out.lawnTrees = [[-10, STREET.zNorth - 14], [10, STREET.zNorth - 14], [-16, STREET.zNorth - 28], [16, STREET.zNorth - 28]];
  out.colliders.push({ x: 0, y: 8, z: zc, sx: W, sy: 16, sz: D });
  out.colliders.push({ x: 0, y: 8, z: tz, sx: 6.5, sy: 30, sz: 6.5 });
  out.colliders.push({ x: 0, y: 5, z: zF - 1, sx: 60, sy: 10, sz: 1, invisible: true }); // can't walk past the church
  for (const sx of [-1, 1]) out.colliders.push({ x: sx * 12, y: 0.55, z: STREET.zNorth - 0.5, sx: 18, sy: 1.1, sz: 0.2 });
  out.colliders.push({ x: 0, y: 5, z: STREET.zNorth - 40, sx: 200, sy: 10, sz: 1, invisible: true });
  for (const sx of [-1, 1]) out.colliders.push({ x: sx * 34, y: 5, z: STREET.zNorth - 20, sx: 1, sy: 10, sz: 40, invisible: true });
}

// ---------- furniture: trees, lamps, benches, bollards, carts, tables, cows, statues ----------
function buildFurniture(scene, M, MATS, out, rng) {
  const treeSpots = [], lampSpots = [], benchSpots = [], bollardSpots = [], trashSpots = [], planterSpots = [], guardSpots = [], rackSpots = [];
  const TX = HW - 2.6; // trees/lamps line, 2.6 m off the facades
  for (const blk of STREET.blocks) {
    const len = blk.z1 - blk.z0;
    // bollards at both block ends (cars stay out)
    for (const z of [blk.z0 + 0.8, blk.z1 - 0.8]) for (const x of [-6.2, -2.1, 2.1, 6.2]) bollardSpots.push([x, z]);
    // trees every ~11 m, staggered per side; lamps in between
    for (const side of [-1, 1]) {
      const n = Math.floor(len / 11);
      const start = side > 0 ? 7 : 12.5;
      for (let i = 0; i < n; i++) {
        const z = blk.z0 + start + i * (len - 12) / Math.max(1, n - 1) * 0.98;
        if (z > blk.z1 - 4) continue;
        treeSpots.push([side * TX, z, 0.85 + rng() * 0.35]);
        guardSpots.push([side * TX, z]);
        if (i % 2 === 0) benchSpots.push([side * (TX - 1.2), z + 3.2, side]);
        if (i % 2 === 1) { lampSpots.push([side * TX, z - 5.2]); }
        if (i % 3 === 2) trashSpots.push([side * (TX - 0.2), z - 2.2]);
        if (i % 3 === 1) planterSpots.push([side * (TX - 1.6), z - 3.6]);
        if (i % 4 === 0) rackSpots.push([side * (TX + 1.2), z + 5.5]);
      }
    }
  }
  // instanced trees: trunk + 4 canopy blobs each
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 3.6, 8);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 2);
  { // organic bumps
    const pos = canopyGeo.attributes.position; const jr = T.mulberry(77);
    for (let i = 0; i < pos.count; i++) { const k = 0.86 + jr() * 0.28; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k); }
    canopyGeo.computeVertexNormals();
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, MATS.bark, treeSpots.length + (out.lawnTrees?.length || 0));
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, (treeSpots.length + (out.lawnTrees?.length || 0)) * 5);
  trunks.castShadow = canopies.castShadow = true; canopies.receiveShadow = false;
  const palette = ['#d9a63a', '#c98b2a', '#e2b84c', '#a9a13a', '#8fa63a', '#d98a3a'];
  const mapleRed = ['#c8452a', '#d9622a', '#b83a2a', '#e07a2a'];
  const col = new THREE.Color();
  let ti = 0, ci = 0;
  const placeTree = (x, z, sc, red = false) => {
    trunks.setMatrixAt(ti++, mat(x, 1.8 * sc, z, 0, sc, sc, sc));
    for (let k = 0; k < 5; k++) {
      const a = rng() * Math.PI * 2, r = rng() * 1.4;
      const cs = (1.5 + rng() * 0.9) * sc;
      canopies.setMatrixAt(ci, mat(x + Math.cos(a) * r, (5.0 + rng() * 1.4) * sc, z + Math.sin(a) * r, rng() * 3, cs, cs * (0.8 + rng() * 0.3), cs));
      col.set((red ? mapleRed : palette)[Math.floor(rng() * (red ? mapleRed : palette).length)]);
      canopies.setColorAt(ci, col);
      ci++;
    }
    out.colliders.push({ x, y: 1.8, z, sx: 0.45, sy: 3.6, sz: 0.45 });
    out.obstacles.push({ x, z, r: 0.6 });
  };
  for (const [x, z, sc] of treeSpots) placeTree(x, z, sc);
  for (const [x, z] of out.lawnTrees || []) placeTree(x, z, 1.3, true);
  trunks.count = ti; canopies.count = ci;
  trunks.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true; canopies.instanceColor.needsUpdate = true;
  scene.add(trunks, canopies);
  // iron tree guards: ring of 8 bars + top ring
  for (const [x, z] of guardSpots) {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; M.add('ironRust', MATS.ironRust, BOX, mat(x + Math.cos(a) * 0.75, 0.55, z + Math.sin(a) * 0.75, -a, 0.05, 1.1, 0.05)); }
    M.add('ironRust', MATS.ironRust, CYL, mat(x, 1.1, z, 0, 0.78, 0.05, 0.78));
    M.add('ironRust', MATS.ironRust, CYL, mat(x, 0.06, z, 0, 0.8, 0.04, 0.8));
    M.add('granite', MATS.graniteDark, CYL, mat(x, 0.03, z, 0, 1.1, 0.06, 1.1));
  }
  // lamp posts: black post, curved arm, globe + two banners
  const bannerMat = new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.9, side: THREE.DoubleSide, map: T.bannerTexture(0) });
  const bannerTexs = [0, 1, 2, 3, 4].map((i) => T.bannerTexture(i));
  const bannerMats = bannerTexs.map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
  lampSpots.forEach(([x, z], i) => {
    M.add('iron', MATS.iron, CYL, mat(x, 2.9, z, 0, 0.09, 5.8, 0.09));
    M.add('iron', MATS.iron, CYL, mat(x, 0.25, z, 0, 0.22, 0.5, 0.22));
    M.add('iron', MATS.iron, CYL, mat(x, 5.9, z, 0, 0.16, 0.3, 0.16));
    const dir = x > 0 ? -1 : 1; // arm reaches over the street
    M.add('iron', MATS.iron, BOX, mat(x + dir * 0.6, 5.95, z, 0, 1.2, 0.07, 0.07));
    M.add('globe', MATS.globe, SPH, mat(x + dir * 1.1, 5.65, z, 0, 0.32, 0.38, 0.32));
    M.add('iron', MATS.iron, CYL, mat(x + dir * 1.1, 5.98, z, 0, 0.22, 0.12, 0.22));
    // banners
    const bm = bannerMats[i % bannerMats.length];
    M.add('banner' + (i % bannerMats.length), bm, PLANE, mat(x, 4.3, z + 0.45, 0, 0.6, 1.2, 1));
    M.add('banner' + ((i + 2) % bannerMats.length), bannerMats[(i + 2) % bannerMats.length], PLANE, mat(x, 4.3, z - 0.45, 0, 0.6, 1.2, 1));
    M.add('iron', MATS.iron, BOX, mat(x, 4.95, z, 0, 0.05, 0.05, 1.6));
    out.colliders.push({ x, y: 3, z, sx: 0.25, sy: 6, sz: 0.25 });
    out.obstacles.push({ x, z, r: 0.35 });
  });
  // benches: iron frame + wood slats
  for (const [x, z, side] of benchSpots) {
    const ry = side > 0 ? Math.PI / 2 : -Math.PI / 2; // face the street
    const L = 1.8;
    const local = (dx, dy, dz, sx, sy, sz) => mat(x + Math.cos(ry) * dx + Math.sin(ry) * dz, dy, z - Math.sin(ry) * dx + Math.cos(ry) * dz, ry, sx, sy, sz);
    for (let s = 0; s < 4; s++) M.add('wood', MATS.wood, BOX, local(0, 0.45, -0.22 + s * 0.12, L, 0.04, 0.09));
    for (let s = 0; s < 3; s++) M.add('wood', MATS.wood, BOX, local(0, 0.62 + s * 0.14, 0.26 + s * 0.04, L, 0.09, 0.04));
    for (const dx of [-L / 2 + 0.1, L / 2 - 0.1]) {
      M.add('iron', MATS.iron, BOX, local(dx, 0.22, 0, 0.06, 0.44, 0.5));
      M.add('iron', MATS.iron, BOX, local(dx, 0.7, 0.3, 0.06, 0.5, 0.06));
    }
    out.colliders.push({ x, y: 0.4, z, sx: side ? 0.6 : L, sy: 0.8, sz: side ? L : 0.6 });
    out.obstacles.push({ x, z, r: 1.0 });
  }
  // pyramid-top bollards (the rust-brown posts at every block end)
  for (const [x, z] of bollardSpots) {
    M.add('ironRust', MATS.ironRust, BOX, mat(x, 0.45, z, 0, 0.22, 0.9, 0.22));
    M.add('ironRust', MATS.ironRust, CYL, mat(x, 0.98, z, Math.PI / 4, 0.01, 0.18, 0.18));
    out.colliders.push({ x, y: 0.5, z, sx: 0.24, sy: 1.0, sz: 0.24 });
    out.obstacles.push({ x, z, r: 0.3 });
  }
  for (const [x, z] of trashSpots) {
    M.add('trash', MATS.trash, CYL, mat(x, 0.5, z, 0, 0.32, 1.0, 0.32));
    M.add('iron', MATS.iron, CYL, mat(x, 1.02, z, 0, 0.34, 0.06, 0.34));
    out.colliders.push({ x, y: 0.5, z, sx: 0.6, sy: 1, sz: 0.6 });
    out.obstacles.push({ x, z, r: 0.45 });
  }
  for (const [x, z] of planterSpots) {
    M.add('planter', MATS.planter, BOX, mat(x, 0.3, z, 0, 1.2, 0.6, 0.8));
    M.add('foliage', MATS.foliage, SPH, mat(x, 0.75, z, 0, 0.6, 0.35, 0.45));
    for (let k = 0; k < 5; k++) M.add('flowers', MATS.flowers, SPH, mat(x - 0.4 + rng() * 0.8, 0.95, z - 0.25 + rng() * 0.5, 0, 0.08, 0.08, 0.08));
    out.colliders.push({ x, y: 0.3, z, sx: 1.2, sy: 0.6, sz: 0.8 });
    out.obstacles.push({ x, z, r: 0.8 });
  }
  for (const [x, z] of rackSpots) {
    for (let k = 0; k < 3; k++) M.add('iron', MATS.iron, CYL, mat(x, 0.45, z + k * 0.5, 0, 0.4, 0.05, 0.4, Math.PI / 2, 0, Math.PI / 2));
    out.colliders.push({ x, y: 0.4, z: z + 0.5, sx: 0.8, sy: 0.8, sz: 1.5 });
    out.obstacles.push({ x, z: z + 0.5, r: 0.8 });
  }
  // vendor carts in the middle of the street
  const carts = [
    { z: 62, label: 'FLOWERS', umb: MATS.umbrellaGreen, body: MATS.cart },
    { z: 168, label: 'HOT DOGS', umb: MATS.umbrellaYellow, body: MATS.cart, hotdog: true },
    { z: 278, label: 'MAPLE SYRUP', umb: MATS.umbrellaRed, body: MATS.cartGreen },
    { z: 395, label: 'LEMONADE', umb: MATS.umbrellaBlue, body: MATS.cart },
  ];
  for (const c of carts) {
    const x = (rng() < 0.5 ? -1 : 1) * 1.6, z = c.z;
    M.add('cartbody' + c.label, c.body, BOX, mat(x, 0.75, z, 0, 1.3, 0.9, 2.2));
    M.add('iron', MATS.iron, BOX, mat(x, 1.25, z, 0, 1.4, 0.08, 2.4));
    for (const dz of [-0.7, 0.7]) M.add('tire', MATS.tire, CYL, mat(x + 0.7, 0.3, z + dz, 0, 0.3, 0.12, 0.3, 0, Math.PI / 2));
    M.add('iron', MATS.iron, CYL, mat(x, 2.0, z, 0, 0.04, 1.6, 0.04));
    M.add('umb' + c.label, c.umb, new THREE.ConeGeometry(1.7, 0.6, 10, 1, true), mat(x, 2.75, z));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.4), new THREE.MeshStandardMaterial({ map: T.textPlateTexture(c.label, { bg: '#fffaf0', fg: '#7a1f1f', font: '900 48px "Arial Black", Arial' }), roughness: 0.8, side: THREE.DoubleSide }));
    plate.position.set(x - 0.7, 1.0, z); plate.rotation.y = -Math.PI / 2; scene.add(plate);
    const plate2 = plate.clone(); plate2.position.x = x + 0.7; plate2.rotation.y = Math.PI / 2; scene.add(plate2);
    out.colliders.push({ x, y: 0.7, z, sx: 1.4, sy: 1.4, sz: 2.4 });
    out.obstacles.push({ x, z, r: 1.7 });
    out.carts.push({ x, z, label: c.label, hotdog: !!c.hotdog });
  }
  // café tables + chairs in front of the restaurants
  for (const spot of out.cafeSpots) {
    const n = Math.max(1, Math.floor((spot.z1 - spot.z0) / 3));
    for (let i = 0; i < n; i++) {
      const z = spot.z0 + 1.5 + i * 3, x = spot.side * (HW - 1.3);
      M.add('iron', MATS.iron, CYL, mat(x, 0.7, z, 0, 0.45, 0.04, 0.45));
      M.add('iron', MATS.iron, CYL, mat(x, 0.35, z, 0, 0.03, 0.7, 0.03));
      for (const dz of [-0.6, 0.6]) {
        M.add('iron', MATS.iron, BOX, mat(x, 0.44, z + dz, 0, 0.4, 0.04, 0.4));
        M.add('iron', MATS.iron, BOX, mat(x, 0.65, z + dz + (dz > 0 ? 0.18 : -0.18), 0, 0.4, 0.45, 0.04));
        for (const dx of [-0.16, 0.16]) M.add('iron', MATS.iron, BOX, mat(x + dx, 0.22, z + dz, 0, 0.03, 0.44, 0.03));
      }
      out.colliders.push({ x, y: 0.4, z, sx: 1.0, sy: 0.8, sz: 1.8 });
      out.obstacles.push({ x, z, r: 1.2 });
    }
    // velvet rope posts along the seating edge
    for (let i = 0; i <= n; i++) M.add('iron', MATS.iron, CYL, mat(spot.side * (HW - 2.2), 0.45, spot.z0 + i * 3, 0, 0.04, 0.9, 0.04));
  }
  // Big Joe Burrell (bronze, sax) in front of Halvorson's
  if (out.joe) {
    const x = out.joe.side * (HW - 1.4), z = out.joe.z + 2;
    M.add('granite', MATS.granite, BOX, mat(x, 0.25, z, 0, 1.6, 0.5, 1.6));
    const ry = out.joe.side > 0 ? Math.PI / 2 + 0.4 : -Math.PI / 2 - 0.4;
    const L = (dx, dy, dz, sx, sy, sz, geo = BOX, m = MATS.bronze, rx = 0) => M.add('bronze', m, geo, mat(x + Math.cos(ry) * dx + Math.sin(ry) * dz, 0.5 + dy, z - Math.sin(ry) * dx + Math.cos(ry) * dz, ry, sx, sy, sz, rx));
    L(0, 1.05, 0, 0.62, 0.8, 0.4); L(0, 1.5, 0, 0.7, 0.14, 0.44); L(0, 1.72, -0.05, 0.26, 0.28, 0.26, SPH); L(0, 1.9, -0.03, 0.34, 0.08, 0.34, CYL);
    for (const sx of [-1, 1]) { L(sx * 0.2, 0.38, 0, 0.2, 0.78, 0.22); L(sx * 0.4, 1.2, -0.2, 0.15, 0.55, 0.15, BOX, MATS.bronze, -0.9); }
    L(0.05, 1.0, -0.35, 0.1, 0.7, 0.1, CYL, MATS.bronzeLight, 0.3); L(0.02, 0.66, -0.45, 0.2, 0.18, 0.2, SPH, MATS.bronzeLight);
    out.colliders.push({ x, y: 1.2, z, sx: 1.6, sy: 2.4, sz: 1.6 });
    out.obstacles.push({ x, z, r: 1.2 });
    out.joePos = { x, z };
  }
  // painted cows near Ben & Jerry's (dynamic bodies — they tip!)
  if (out.cowSpot) {
    const side = out.cowSpot.side;
    for (let i = 0; i < 2; i++) {
      const x = side * (HW - 2.2), z = out.cowSpot.z0 + 2 + i * 4;
      const cow = makeCow(i);
      cow.position.set(x, 0, z); cow.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(cow);
      out.cows.push({ mesh: cow, x, z, ry: cow.rotation.y });
      out.obstacles.push({ x, z, r: 1.3 });
    }
  }
  // the Leapfroggers (bronze kids) near the Bank St corner, west side
  {
    const x = -(HW - 1.6), z = STREET.blocks[1].z1 - 4;
    M.add('granite', MATS.granite, BOX, mat(x, 0.15, z, 0, 1.6, 0.3, 1.6));
    M.add('bronze', MATS.bronze, BOX, mat(x, 0.75, z, 0, 0.4, 0.3, 0.6));
    M.add('bronze', MATS.bronze, SPH, mat(x, 0.72, z - 0.38, 0, 0.17, 0.19, 0.17));
    for (const dx of [-0.12, 0.12]) M.add('bronze', MATS.bronze, BOX, mat(x + dx, 0.45, z + 0.2, 0, 0.14, 0.6, 0.14));
    M.add('bronze', MATS.bronze, BOX, mat(x, 1.45, z + 0.1, 0, 0.4, 0.55, 0.3));
    M.add('bronze', MATS.bronze, SPH, mat(x, 1.85, z + 0.05, 0, 0.18, 0.2, 0.18));
    for (const dx of [-0.3, 0.3]) { M.add('bronze', MATS.bronze, BOX, mat(x + dx, 1.05, z + 0.3, 0, 0.13, 0.6, 0.14, 0.5)); M.add('bronze', MATS.bronze, BOX, mat(x + dx * 0.8, 1.3, z - 0.1, 0, 0.1, 0.5, 0.1, 0.9)); }
    out.colliders.push({ x, y: 1, z, sx: 1.6, sy: 2, sz: 1.6 });
    out.obstacles.push({ x, z, r: 1.2 });
  }
  // fallen leaves on the bricks (instanced decals)
  {
    const leafGeo = new THREE.PlaneGeometry(0.28, 0.28);
    const leafMat = new THREE.MeshStandardMaterial({ map: T.leafTexture(), transparent: true, alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide });
    const N = 900;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
    const c = new THREE.Color();
    const cols = ['#d8742a', '#c94a2a', '#e0a23a', '#b85a1a', '#f0c04a'];
    for (let i = 0; i < N; i++) {
      const z = STREET.zNorth + rng() * (STREET.zSouth - STREET.zNorth);
      const x = (rng() - 0.5) * 2 * (HW - 0.4);
      leaves.setMatrixAt(i, mat(x, 0.012 + rng() * 0.01, z, rng() * Math.PI * 2, 0.8 + rng() * 0.6, 1, 0.8 + rng() * 0.6, -Math.PI / 2));
      leaves.setColorAt(i, c.set(cols[Math.floor(rng() * cols.length)]));
    }
    leaves.instanceMatrix.needsUpdate = true; leaves.instanceColor.needsUpdate = true;
    leaves.receiveShadow = true;
    scene.add(leaves);
  }
  // pigeon spots (flocks live in critters.js)
  out.pigeonSpots.push({ x: -3, z: 95 }, { x: 3.5, z: 205 }, { x: -2, z: 300 }, { x: 2, z: 420 });
}

export function makeCow(i) {
  const g = new THREE.Group();
  const texm = new THREE.MeshStandardMaterial({ map: T.cowTexture(i), roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.7), texm); body.position.y = 1.0; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.4), texm); head.position.set(0.9, 1.15, 0); head.castShadow = true; g.add(head);
  const legMat = new THREE.MeshStandardMaterial({ color: '#e8e4da', roughness: 0.9 });
  for (const dx of [-0.55, 0.55]) for (const dz of [-0.22, 0.22]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), legMat); l.position.set(dx, 0.31, dz); g.add(l); }
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.0), new THREE.MeshStandardMaterial({ color: '#5fa84a', roughness: 0.9 })); base.position.y = 0.05; g.add(base);
  return g;
}

// ---------- backdrop ----------
function buildBackdrop(scene, M, brickMats, rng) {
  // filler downtown blocks so the aerial shots read as a town, not a film set
  const fillerMats = [new THREE.MeshStandardMaterial({ color: '#8c5a48', roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: '#b9ada0', roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: '#6f6a66', roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: '#a8473a', roughness: 0.95 })];
  const roofMat = new THREE.MeshStandardMaterial({ color: '#3e4046', roughness: 1 });
  for (let i = 0; i < 260; i++) {
    const x = (rng() - 0.5) * 700, z = -160 + rng() * 820;
    if (Math.abs(x) < 62 && z > -60 && z < 520) continue;           // keep the street corridor + side streets clear
    if (z < -45 && Math.abs(x) < 40) continue;                       // church lawn
    const w = 10 + rng() * 22, d = 10 + rng() * 22, h = 6 + rng() * (Math.abs(x) > 200 ? 8 : 16);
    const m = fillerMats[Math.floor(rng() * fillerMats.length)];
    M.add('filler' + fillerMats.indexOf(m), m, BOX, mat(x, h / 2, z, rng() * 0.3, w, h, d), 1.3);
    M.add('roof', roofMat, BOX, mat(x, h + 0.15, z, 0, w + 0.4, 0.3, d + 0.4));
  }
  // Lake Champlain: a big blue plane far to the west, slightly below street level
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2400), new THREE.MeshStandardMaterial({ color: '#4f86b5', roughness: 0.25, metalness: 0.1 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(-1000, -4, 220); scene.add(lake);
  // Adirondacks (west) and the Green Mountain foothills (east): long jagged ridges
  const ridge = (len, base, amp, color, x, y, z, ry, scaleY = 1) => {
    const n = 60, pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([t * len - len / 2, Math.max(12, base + Math.sin(t * 19.3) * amp * 0.5 + Math.sin(t * 7.1 + 1) * amp * 0.8 + Math.cos(t * 3.3) * amp * 0.6)]); }
    const shape = new THREE.Shape(); shape.moveTo(-len / 2, -40);
    for (const [px, py] of pts) shape.lineTo(px, py);
    shape.lineTo(len / 2, -40); shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, fog: true }));
    mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.scale.y = scaleY; scene.add(mesh);
  };
  ridge(2600, 70, 45, '#6d7ea0', -760, -10, 220, Math.PI / 2);
  ridge(3000, 95, 55, '#8a97b3', -900, -14, 260, Math.PI / 2, 1.2);
  ridge(2600, 40, 22, '#5f7a4a', 520, -10, 220, -Math.PI / 2);
}
