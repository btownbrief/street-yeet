// You: a Vermonter in a beanie and flannel. Movement is physics-driven (a
// sphere body with velocity set from input), the camera is a collision-aware
// third-person follow, throws are charged and aimed through the crosshair.
import * as THREE from '../vendor/three.module.min.js';
import { Rig, LOOKS, PART_INDEX } from './characters.js';
import { ITEMS } from './items.js';

const WALK = 4.2, SPRINT = 6.8, JUMP = 6.2;
const CAM_DIST = 4.4, CAM_H = 1.75, CAM_SIDE = 0.55, CAM_DIST_AIM = 2.9;
const _dir = new THREE.Vector3(), _want = new THREE.Vector3(), _from = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export class Player {
  constructor(scene, physics, world, camera) {
    this.scene = scene; this.physics = physics; this.world = world; this.camera = camera;
    this.rig = new Rig(LOOKS.player);
    scene.add(this.rig.group);
    this.body = physics.addPlayer(world.spawn.x, world.spawn.z);
    this.yaw = 0;                  // heading 0 = +z = south, down the long street
    this.camYaw = 0; this.camPitch = 0.18;
    this.charge = -1; this.releasing = 0;
    this.item = 0;
    this.speed = 0;
    this.vx = 0; this.vz = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.handPos = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.aimPoint = new THREE.Vector3();
    this.airborne = false;
    this.heldMesh = null;
    this.onThrow = null; this.onSwitch = null; this.onJump = null;
    this.snapCamera();
  }
  get x() { return this.body.position.x; }
  get z() { return this.body.position.z; }
  get pos() { return this.body.position; }
  get kind() { return ITEMS[this.item]; }

  reset(x, z) {
    this.body.position.set(x, 0.42, z); this.body.velocity.set(0, 0, 0);
    this.yaw = 0; this.camYaw = 0; this.camPitch = 0.18; this.charge = -1; this.releasing = 0;
    this.snapCamera();
  }

  snapCamera() {
    this.computeCamera(1);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  update(dt, inp, { allowInput = true } = {}) {
    const b = this.body;
    // ---- look ----
    if (allowInput) {
      this.camYaw -= inp.lookDX * 0.0022;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.lookDY * 0.0018, -0.5, 0.9);
    }
    // ---- move ----
    const fwdX = Math.sin(this.camYaw), fwdZ = Math.cos(this.camYaw);
    const rightX = fwdZ, rightZ = -fwdX;
    let mx = allowInput ? inp.mx : 0, my = allowInput ? inp.my : 0;
    const charging = this.charge >= 0;
    const target = (inp.sprint && !charging ? SPRINT : WALK) * (charging ? 0.55 : 1);
    const wx = (fwdX * my + rightX * mx) * target, wz = (fwdZ * my + rightZ * mx) * target;
    const k = Math.min(1, dt * (this.physics.playerGrounded ? 12 : 3));
    this.vx += (wx - this.vx) * k; this.vz += (wz - this.vz) * k;
    b.velocity.x = this.vx; b.velocity.z = this.vz;
    this.speed = Math.hypot(this.vx, this.vz);
    if (allowInput && inp.jump && this.physics.playerGrounded) { b.velocity.y = JUMP; if (this.onJump) this.onJump(); }
    this.airborne = !this.physics.playerGrounded && Math.abs(b.velocity.y) > 0.5;
    // heading: face movement, or face the camera direction while charging/throwing
    let wantYaw = this.yaw;
    if (charging || this.releasing > 0) wantYaw = this.camYaw;
    else if (this.speed > 0.3) wantYaw = Math.atan2(this.vx, this.vz);
    let dy = wantYaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 10);
    // ---- items ----
    if (allowInput && inp.selectIndex >= 0 && inp.selectIndex !== this.item) { this.item = inp.selectIndex; if (this.onSwitch) this.onSwitch(this.item); }
    if (allowInput && inp.switchDelta) { this.item = ((this.item + inp.switchDelta) % ITEMS.length + ITEMS.length) % ITEMS.length; if (this.onSwitch) this.onSwitch(this.item); }
    // ---- throw charge ----
    if (allowInput && inp.throwHeld) {
      if (this.charge < 0) this.charge = 0;
      else this.charge = Math.min(1, this.charge + dt / 0.85);
    } else if (this.charge >= 0) {
      this.throwNow();
    }
    if (this.releasing > 0) this.releasing = Math.max(0, this.releasing - dt * 4);
    // ---- rig ----
    this.rig.setPosition(b.position.x, b.position.y - 0.42, b.position.z);
    this.rig.setHeading(this.yaw);
    this.rig.updatePose(dt, { speed: this.speed, airborne: this.airborne, charge: this.charge, releasing: this.releasing });
    this.rig.jointWorld('larmR', this.handPos);
    // hand position: end of the right forearm
    this.handPos.y -= 0.2;
    // held item mesh follows the hand while charging
    if (this.heldMesh) {
      this.heldMesh.visible = this.charge >= 0;
      if (this.charge >= 0) {
        const m = this.rig.bones[PART_INDEX.larmR].matrixWorld;
        _tmp.set(0, -0.34, 0).applyMatrix4(m);
        this.heldMesh.position.copy(_tmp);
        this.heldMesh.quaternion.setFromRotationMatrix(m);
      }
    }
    // ---- camera ----
    this.computeCamera(dt);
  }

  computeCamera(dt) {
    const b = this.body;
    const charging = this.charge >= 0;
    const dist = charging ? CAM_DIST_AIM : CAM_DIST;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    _dir.set(-Math.sin(this.camYaw) * cp, sp, -Math.cos(this.camYaw) * cp); // from player back to camera
    const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
    _from.set(b.position.x + rightX * CAM_SIDE * (charging ? 1.3 : 1), b.position.y - 0.42 + CAM_H, b.position.z + rightZ * CAM_SIDE * (charging ? 1.3 : 1));
    _want.copy(_from).addScaledVector(_dir, dist);
    // keep the camera out of buildings: ray from the head toward the wanted spot
    let d = dist;
    if (this.world.cameraBlockers.length) {
      _ray.set(_from, _dir); _ray.far = dist + 0.3;
      const hits = _ray.intersectObjects(this.world.cameraBlockers, false);
      if (hits.length) d = Math.max(0.6, hits[0].distance - 0.3);
    }
    _want.copy(_from).addScaledVector(_dir, d);
    if (_want.y < 0.35) _want.y = 0.35;
    const k = dt >= 1 ? 1 : 1 - Math.pow(0.0005, dt); // snappy but smooth
    this.camPos.lerp(_want, k);
    // look at a point ahead of the player along the aim
    this.camLook.set(_from.x, _from.y - 0.1, _from.z).addScaledVector(_dir, -6);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // aim: crosshair ray from the camera; hit blockers or ground, else far point
    this.camera.getWorldDirection(this.aimDir);
    _ray.set(this.camera.position, this.aimDir); _ray.far = 60;
    let tgt = 60;
    const hits = this.world.cameraBlockers.length ? _ray.intersectObjects(this.world.cameraBlockers, false) : [];
    if (hits.length) tgt = hits[0].distance;
    // ground plane
    if (this.aimDir.y < -0.001) { const tg = -this.camera.position.y / this.aimDir.y; if (tg < tgt) tgt = tg; }
    this.aimPoint.copy(this.camera.position).addScaledVector(this.aimDir, Math.max(3, tgt));
  }

  throwNow() {
    const power = Math.max(0.12, this.charge);
    this.charge = -1; this.releasing = 1;
    const kind = this.kind;
    const speed = (10 + 19 * power) * kind.speed;
    const origin = this.handPos.clone();
    // nudge the origin forward so the item spawns clear of the player's body
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    origin.x += fx * 0.55; origin.z += fz * 0.55; origin.y = Math.max(origin.y, 1.1);
    const dir = this.aimPoint.clone().sub(origin);
    const flat = Math.hypot(dir.x, dir.z);
    dir.normalize();
    // a touch of loft so short throws still arc
    dir.y += 0.06 + (1 - power) * 0.04;
    dir.normalize();
    const vel = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
    const spin = kind.rolls ? { x: Math.cos(this.camYaw) * -speed / kind.r * 0.6, y: 0, z: Math.sin(this.camYaw) * speed / kind.r * 0.6 } : { x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 };
    if (this.onThrow) this.onThrow({ kind, pos: origin, vel, spin, power, flat });
  }

  // trajectory preview points (for the aim arc) — pure ballistic, no collisions
  previewArc(out, n = 22) {
    const kind = this.kind, power = Math.max(0.12, this.charge);
    const speed = (10 + 19 * power) * kind.speed;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const ox = this.handPos.x + fx * 0.55, oy = Math.max(this.handPos.y, 1.1), oz = this.handPos.z + fz * 0.55;
    _tmp.set(this.aimPoint.x - ox, this.aimPoint.y - oy, this.aimPoint.z - oz).normalize();
    _tmp.y += 0.06 + (1 - power) * 0.04; _tmp.normalize();
    const vx = _tmp.x * speed, vy = _tmp.y * speed, vz = _tmp.z * speed;
    const dt = 0.07;
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      out[i * 3] = ox + vx * t; out[i * 3 + 1] = Math.max(0.05, oy + vy * t - 4.91 * t * t); out[i * 3 + 2] = oz + vz * t;
    }
  }
}
