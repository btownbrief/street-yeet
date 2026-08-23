// cannon-es world: static street colliders, the player's body, pooled
// projectiles, pooled ragdolls (11 bodies + 10 cone-twist joints each), the
// tippable cows and the church-bell trigger. Body removals are queued and
// flushed between steps — cannon corrupts the step if you remove inside a
// 'collide' callback.
import * as CANNON from '../vendor/cannon-es.js';
import { PARTS, REST } from './characters.js';

export const GROUP = { STATIC: 1, PLAYER: 2, PROJ: 4, COW: 8, TRIGGER: 16, PROP: 1 << 15 };
const RAGDOLL_POOL = 10;
const RAG_BITS = Array.from({ length: RAGDOLL_POOL }, (_, i) => 1 << (5 + i));
const ALL_RAG = RAG_BITS.reduce((a, b) => a | b, 0);
export const PROJ_POOL = 28;

export class Physics {
  constructor() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 8;
    world.defaultContactMaterial.friction = 0.4;
    world.defaultContactMaterial.restitution = 0.1;
    this.world = world;
    this.matGround = new CANNON.Material('ground');
    this.matRag = new CANNON.Material('rag');
    this.matProj = new CANNON.Material('proj');
    this.matBouncy = new CANNON.Material('bouncy');
    this.matPlayer = new CANNON.Material('player');
    world.addContactMaterial(new CANNON.ContactMaterial(this.matGround, this.matRag, { friction: 0.6, restitution: 0.05 }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.matGround, this.matProj, { friction: 0.5, restitution: 0.35 }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.matGround, this.matBouncy, { friction: 0.4, restitution: 0.7 }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.matRag, this.matProj, { friction: 0.4, restitution: 0.2 }));
    // the player slides freely — WE drive its velocity, so the solver must not
    // fight it with friction (a non-rotating sphere would otherwise stick).
    world.addContactMaterial(new CANNON.ContactMaterial(this.matPlayer, this.matGround, { friction: 0, restitution: 0 }));
    this.removeQueue = [];
    this.onBell = null;
    this.onCow = null;
    this.projectiles = [];
    this.ragdolls = [];
    this.cows = [];
    this.props = [];
    this.accum = 0;
    this.fixed = 1 / 60;
    this.time = 0;
  }

  addStatics(colliders) {
    for (const c of colliders) {
      const body = new CANNON.Body({ mass: 0, material: this.matGround, collisionFilterGroup: GROUP.STATIC, collisionFilterMask: -1 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(c.sx / 2, c.sy / 2, c.sz / 2)));
      body.position.set(c.x, c.y, c.z);
      if (c.ry) body.quaternion.setFromEuler(0, c.ry, 0);
      this.world.addBody(body);
    }
    const ground = new CANNON.Body({ mass: 0, material: this.matGround, collisionFilterGroup: GROUP.STATIC, collisionFilterMask: -1 });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    this.ground = ground;
  }

  addBell(bell) {
    const b = new CANNON.Body({ mass: 0, isTrigger: true, collisionFilterGroup: GROUP.TRIGGER, collisionFilterMask: GROUP.PROJ });
    b.addShape(new CANNON.Sphere(bell.r));
    b.position.set(bell.x, bell.y, bell.z);
    b.addEventListener('collide', (e) => { if (this.onBell) this.onBell(e.body); });
    this.world.addBody(b);
  }

  addPlayer(x, z) {
    const body = new CANNON.Body({ mass: 75, material: this.matPlayer, fixedRotation: true, linearDamping: 0.0,
      collisionFilterGroup: GROUP.PLAYER, collisionFilterMask: GROUP.STATIC | GROUP.COW | GROUP.PROP | ALL_RAG | GROUP.PROJ });
    body.addShape(new CANNON.Sphere(0.42));
    body.position.set(x, 0.42, z);
    body.allowSleep = false;
    this.world.addBody(body);
    this.player = body;
    this.playerGrounded = false;
    this.world.addEventListener('postStep', () => {
      let grounded = false;
      for (const c of this.world.contacts) {
        if (c.bi === body || c.bj === body) {
          const other = c.bi === body ? c.bj : c.bi;
          // ni points from bi to bj
          const ny = c.bi === body ? -c.ni.y : c.ni.y;
          if (ny > 0.5 && other.mass === 0) grounded = true;
        }
      }
      this.playerGrounded = grounded || (body.position.y < 0.5 && Math.abs(body.velocity.y) < 2.2);
    });
    return body;
  }

  addCows(cows) {
    for (const c of cows) {
      const body = new CANNON.Body({ mass: 60, material: this.matGround, collisionFilterGroup: GROUP.COW, collisionFilterMask: -1, linearDamping: 0.1, angularDamping: 0.3 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.95, 0.55, 0.5)), new CANNON.Vec3(0, 0.95, 0));
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.95, 0.05, 0.5)), new CANNON.Vec3(0, 0.05, 0));
      body.position.set(c.x, 0, c.z);
      body.quaternion.setFromEuler(0, c.ry, 0);
      body.sleepSpeedLimit = 0.2; body.sleepTimeLimit = 0.6;
      this.world.addBody(body);
      body.sleep();
      const entry = { body, mesh: c.mesh, tipped: false, home: { x: c.x, z: c.z, ry: c.ry } };
      this.cows.push(entry);
    }
  }

  addProps(list, defs) {
    this.props = [];
    for (const p of list) {
      const def = defs[p.kind];
      const body = new CANNON.Body({ mass: def.mass, material: this.matGround, collisionFilterGroup: GROUP.PROP, collisionFilterMask: -1, linearDamping: 0.06, angularDamping: 0.5 });
      for (const sh of def.shapes) {
        let shape;
        if (sh.t === 'box') shape = new CANNON.Box(new CANNON.Vec3(sh.a[0], sh.a[1], sh.a[2]));
        else if (sh.t === 'cyl') shape = new CANNON.Cylinder(sh.a[0], sh.a[1], sh.a[2], 10);
        else shape = new CANNON.Sphere(sh.a[0]);
        body.addShape(shape, new CANNON.Vec3(sh.o[0], sh.o[1], sh.o[2]));
      }
      body.position.set(p.x, 0, p.z);
      body.quaternion.setFromEuler(0, p.ry || 0, 0);
      body.sleepSpeedLimit = 0.25; body.sleepTimeLimit = 0.5;
      this.world.addBody(body); body.sleep();
      this.props.push({ body, kind: p.kind, home: { x: p.x, z: p.z, ry: p.ry || 0 }, launched: false, scored: false, prevPos: new CANNON.Vec3(p.x, 0.5, p.z), start: null });
    }
  }

  // ---------- projectiles ----------
  initProjectiles() {
    for (let i = 0; i < PROJ_POOL; i++) {
      const body = new CANNON.Body({ mass: 1, material: this.matProj, collisionFilterGroup: GROUP.PROJ,
        collisionFilterMask: GROUP.STATIC | GROUP.COW | GROUP.PROP | ALL_RAG | GROUP.PROJ | GROUP.TRIGGER | GROUP.PLAYER, linearDamping: 0.02, angularDamping: 0.2 });
      body.addShape(new CANNON.Sphere(0.15));
      body.sleepSpeedLimit = 0.3; body.sleepTimeLimit = 1.0;
      const p = { body, active: false, item: null, age: 0, kind: null, lastSpeed: 0, hitCount: 0, id: i, prev: new CANNON.Vec3(), framePrev: new CANNON.Vec3(), splatted: false };
      body.userData = { proj: p };
      body.addEventListener('collide', (e) => {
        if (!p.active) return;
        const other = e.body;
        const rel = e.contact.getImpactVelocityAlongNormal();
        p.lastImpact = { other, speed: Math.abs(rel), time: this.time };
        if (this.onProjectileHit) this.onProjectileHit(p, other, Math.abs(rel));
      });
      this.projectiles.push(p);
    }
  }
  launch(kind, pos, vel, spin) {
    let p = this.projectiles.find((q) => !q.active);
    if (!p) { // recycle the oldest
      p = this.projectiles.reduce((a, b) => (a.age > b.age ? a : b));
      this.retire(p);
    }
    const b = p.body;
    // swap shape for the item's radius/mass
    b.shapes.length = 0; b.shapeOffsets.length = 0; b.shapeOrientations.length = 0;
    if (kind.shape === 'cyl') b.addShape(new CANNON.Cylinder(kind.r, kind.r, kind.h, 10));
    else b.addShape(new CANNON.Sphere(kind.r));
    b.mass = kind.mass; b.updateMassProperties();
    b.material = kind.bouncy ? this.matBouncy : this.matProj;
    b.position.set(pos.x, pos.y, pos.z);
    b.previousPosition.copy(b.position);
    b.velocity.set(vel.x, vel.y, vel.z);
    b.angularVelocity.set(spin.x, spin.y, spin.z);
    b.quaternion.set(0, 0, 0, 1);
    // the cheddar wheel flies rim-first: cannon cylinders stand on their Y axis,
    // so lay the axis sideways to the throw direction and it rolls on landing
    if (kind.shape === 'cyl') { const yaw = Math.atan2(vel.x, vel.z); b.quaternion.setFromEuler(0, yaw, Math.PI / 2); }
    b.wakeUp();
    p.active = true; p.kind = kind; p.age = 0; p.hitCount = 0; p.splatted = false; p.lastImpact = null;
    p.prev.copy(b.position); p.framePrev.copy(b.position);
    if (!this.world.bodies.includes(b)) this.world.addBody(b);
    return p;
  }
  retire(p) {
    if (!p.active) return;
    p.active = false;
    this.removeQueue.push(p.body);
  }

  // ---------- ragdolls ----------
  initRagdolls() {
    for (let i = 0; i < RAGDOLL_POOL; i++) this.ragdolls.push(this.makeRagdoll(i));
  }
  makeRagdoll(i) {
    const group = RAG_BITS[i];
    const mask = GROUP.STATIC | GROUP.PLAYER | GROUP.PROJ | GROUP.COW | GROUP.PROP | (ALL_RAG & ~group);
    const bodies = [];
    const massOf = { hips: 8, torso: 14, head: 4, uarmL: 2, uarmR: 2, larmL: 1.5, larmR: 1.5, ulegL: 5, ulegR: 5, llegL: 3, llegR: 3 };
    for (const p of PARTS) {
      const body = new CANNON.Body({ mass: massOf[p.n], material: this.matRag, collisionFilterGroup: group, collisionFilterMask: mask, linearDamping: 0.08, angularDamping: 0.4 });
      let shape;
      if (p.s === 'head') shape = new CANNON.Sphere(p.d[0]);
      else if (p.s === 'caph') shape = new CANNON.Box(new CANNON.Vec3(p.d[1] / 2 + p.d[0] * 0.8, p.d[0] * 0.9, p.d[0] * 0.8));
      else shape = new CANNON.Box(new CANNON.Vec3(p.d[0] * 0.85, p.d[1] / 2 + p.d[0] * 0.8, p.d[0] * 0.85));
      body.addShape(shape);
      body.sleepSpeedLimit = 0.35; body.sleepTimeLimit = 1.2;
      const c = REST.centre[p.n];
      body.position.set(c[0], c[1], c[2]);
      bodies.push(body);
    }
    const constraints = [];
    PARTS.forEach((p, ci) => {
      if (!p.p) return;
      const pi = PARTS.findIndex((q) => q.n === p.p);
      const J = REST.joint[p.n], CP = REST.centre[p.p], CC = REST.centre[p.n];
      const pivotA = new CANNON.Vec3(J[0] - CP[0], J[1] - CP[1], J[2] - CP[2]);
      const pivotB = new CANNON.Vec3(J[0] - CC[0], J[1] - CC[1], J[2] - CC[2]);
      const isLeg = p.n.includes('leg'), isArm = p.n.includes('arm'), isHead = p.n === 'head';
      const axis = new CANNON.Vec3(0, isLeg || isArm ? -1 : 1, 0);
      const c = new CANNON.ConeTwistConstraint(bodies[pi], bodies[ci], {
        pivotA, pivotB, axisA: axis, axisB: axis,
        angle: isHead ? Math.PI / 6 : p.n.startsWith('l') && isLeg ? Math.PI / 10 : isArm ? Math.PI / 2.2 : Math.PI / 3.2,
        twistAngle: isHead ? Math.PI / 4 : Math.PI / 6,
        collideConnected: false,
      });
      constraints.push(c);
    });
    return { bodies, constraints, active: false, group, npc: null, age: 0, settled: 0, id: i, hitPos: new CANNON.Vec3(), peak: 0, travel: 0, scale: 1 };
  }
  // place ragdoll parts at the rig's current part transforms (pos/quat per part) and launch
  activateRagdoll(parts, scale, impulse, hitPoint, hitPartIndex) {
    let r = this.ragdolls.find((q) => !q.active);
    if (!r) { r = this.ragdolls.reduce((a, b) => (a.age > b.age ? a : b)); this.releaseRagdoll(r); this.flushRemovals(); }
    // rescale shapes for this character (kids are small)
    if (Math.abs(r.scale - scale) > 0.01) {
      r.bodies.forEach((b, i) => {
        const p = PARTS[i];
        b.shapes.length = 0; b.shapeOffsets.length = 0; b.shapeOrientations.length = 0;
        if (p.s === 'head') b.addShape(new CANNON.Sphere(p.d[0] * scale));
        else if (p.s === 'caph') b.addShape(new CANNON.Box(new CANNON.Vec3((p.d[1] / 2 + p.d[0] * 0.8) * scale, p.d[0] * 0.9 * scale, p.d[0] * 0.8 * scale)));
        else b.addShape(new CANNON.Box(new CANNON.Vec3(p.d[0] * 0.85 * scale, (p.d[1] / 2 + p.d[0] * 0.8) * scale, p.d[0] * 0.85 * scale)));
        b.updateMassProperties();
      });
      r.constraints.forEach((c, k) => {
        const p = PARTS.filter((q) => q.p)[k];
        const J = REST.joint[p.n], CP = REST.centre[p.p], CC = REST.centre[p.n];
        c.pivotA.set((J[0] - CP[0]) * scale, (J[1] - CP[1]) * scale, (J[2] - CP[2]) * scale);
        c.pivotB.set((J[0] - CC[0]) * scale, (J[1] - CC[1]) * scale, (J[2] - CC[2]) * scale);
      });
      r.scale = scale;
    }
    r.bodies.forEach((b, i) => {
      const t = parts[i];
      b.position.set(t.pos.x, t.pos.y, t.pos.z);
      b.previousPosition.copy(b.position);
      b.quaternion.set(t.quat.x, t.quat.y, t.quat.z, t.quat.w);
      b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
      b.wakeUp();
      this.world.addBody(b);
    });
    for (const c of r.constraints) this.world.addConstraint(c);
    // whole-body base velocity + extra kick at the hit part
    const per = 1 / r.bodies.length;
    r.bodies.forEach((b, i) => {
      b.velocity.set(impulse.x * 0.55, impulse.y * 0.55 + 1.5, impulse.z * 0.55);
      if (i === hitPartIndex) b.applyImpulse(new CANNON.Vec3(impulse.x * b.mass * 0.9, impulse.y * b.mass * 0.9, impulse.z * b.mass * 0.9), new CANNON.Vec3(hitPoint.x - b.position.x, hitPoint.y - b.position.y, hitPoint.z - b.position.z));
    });
    r.active = true; r.age = 0; r.settled = 0; r.peak = 0; r.travel = 0;
    r.hitPos.set(parts[0].pos.x, parts[0].pos.y, parts[0].pos.z);
    return r;
  }
  releaseRagdoll(r) {
    if (!r.active) return;
    r.active = false;
    for (const c of r.constraints) this.world.removeConstraint(c);
    for (const b of r.bodies) this.removeQueue.push(b);
    r.npc = null;
  }
  flushRemovals() {
    for (const b of this.removeQueue) if (this.world.bodies.includes(b)) this.world.removeBody(b);
    this.removeQueue.length = 0;
  }

  // ---------- stepping ----------
  step(dt, timeScale = 1) {
    this.accum += dt * timeScale;
    for (const p of this.projectiles) if (p.active) p.framePrev.copy(p.body.position);
    let n = 0;
    while (this.accum >= this.fixed && n < 4) {
      this.flushRemovals();
      for (const p of this.projectiles) if (p.active) { p.prev.copy(p.body.position); }
      this.world.step(this.fixed);
      this.time += this.fixed;
      this.accum -= this.fixed; n++;
      // bookkeeping
      for (const p of this.projectiles) if (p.active) {
        p.age += this.fixed;
        const b = p.body;
        if (p.age > 9 || b.position.y < -5 || (b.sleepState === CANNON.Body.SLEEPING && p.age > 2)) this.retire(p);
      }
      for (const r of this.ragdolls) if (r.active) {
        r.age += this.fixed;
        const hips = r.bodies[0];
        const v = hips.velocity.length();
        if (hips.position.y > r.peak) r.peak = hips.position.y;
        const dx = hips.position.x - r.hitPos.x, dz = hips.position.z - r.hitPos.z;
        r.travel = Math.hypot(dx, dz);
        r.settled = v < 0.4 ? r.settled + this.fixed : 0;
      }
    }
    if (n === 4) this.accum = 0;
  }
}
