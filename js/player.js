// You: a Vermonter in a beanie and flannel. Movement is physics-driven (a
// sphere body), the camera is a collision-aware third-person follow. There are
// two modes: YEET (grab the nearest person/thing and launch it, camera chases
// the flight) and THROW (sling a creemee/cheddar). The aim guide integrates the
// EXACT launch velocity so the dotted arc lands where the thing lands.
import * as THREE from '../vendor/three.module.min.js';
import { Rig, LOOKS, PART_INDEX } from './characters.js';
import { ITEMS } from './items.js';

const WALK = 6.8, SPRINT = 12.0, JUMP = 6.6, ACCEL_G = 18, ACCEL_A = 4;
const SKATE_CRUISE = 13.5, SKATE_PUSH = 22.0, SKATE_ACCEL = 7, SKATE_COAST = 0.55; // m/s, and how fast a coasting board bleeds speed (per second)
const CHARGE_HALF = 0.62; // seconds for the power meter to sweep low↔high once
const CAM_DIST = 4.6, CAM_H = 1.8, CAM_SIDE = 0.5, CAM_DIST_AIM = 3.1;
const GRAV = 9.82;
const _dir = new THREE.Vector3(), _want = new THREE.Vector3(), _from = new THREE.Vector3(), _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export class Player {
  constructor(scene, physics, world, camera) {
    this.scene = scene; this.physics = physics; this.world = world; this.camera = camera;
    this.rig = new Rig(LOOKS.player);
    scene.add(this.rig.group);
    this.body = physics.addPlayer(world.spawn.x, world.spawn.z);
    this.yaw = 0;
    this.camYaw = 0; this.camPitch = 0.16;
    this.charge = -1; this.chargeDir = 1; this.releasing = 0;
    this.item = 0;
    this.mode = 'yeet';               // 'yeet' | 'throw'
    this.speed = 0; this.vx = 0; this.vz = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.handPos = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.aimPoint = new THREE.Vector3();
    this.landPoint = new THREE.Vector3();
    this.airborne = false;
    this.heldMesh = null;
    this.watch = null;               // { body, t, dur } — follow-cam on a launched thing
    this.skating = false; this.onSkate = null;
    this.onThrow = null; this.onYeet = null; this.onSwitch = null; this.onJump = null;
    this.snapCamera();
  }
  get x() { return this.body.position.x; }
  get z() { return this.body.position.z; }
  get pos() { return this.body.position; }
  get kind() { return ITEMS[this.item]; }
  get charging() { return this.charge >= 0; }

  reset(x, z) {
    this.body.position.set(x, 0.42, z); this.body.velocity.set(0, 0, 0);
    this.yaw = 0; this.camYaw = 0; this.camPitch = 0.16; this.charge = -1; this.chargeDir = 1; this.releasing = 0; this.watch = null; this.skating = false;
    this.snapCamera();
  }
  snapCamera() { this.computeCamera(1); this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook); }

  // launch speed for the current mode, given charge 0..1. Big top end so a
  // well-timed release at the meter's peak really sends them.
  launchSpeed(power) {
    if (this.mode === 'throw') return (11 + 30 * power) * this.kind.speed;
    return 15 + 52 * power;          // people/things fly HARD (max ~67 m/s)
  }

  update(dt, inp, { allowInput = true } = {}) {
    // ---- follow-cam takes over while watching a launched thing ----
    if (this.watch) { this.updateWatch(dt); this.updateRigStanding(dt); return; }

    const b = this.body;
    if (allowInput) {
      this.camYaw -= inp.lookDX * 0.0024;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.lookDY * 0.0020, -0.55, 0.95);
    }
    if (allowInput && inp.skateToggle) { this.skating = !this.skating; if (this.onSkate) this.onSkate(this.skating); }
    const fwdX = Math.sin(this.camYaw), fwdZ = Math.cos(this.camYaw);
    const rightX = -fwdZ, rightZ = fwdX;   // camera-right (D strafes toward screen-right)
    let mx = allowInput ? inp.mx : 0, my = allowInput ? inp.my : 0;
    const charging = this.charging;
    const moving = Math.hypot(mx, my) > 0.05;
    const base = this.skating ? (inp.sprint ? SKATE_PUSH : SKATE_CRUISE) : (inp.sprint && !charging ? SPRINT : WALK);
    const target = base * (charging ? 0.6 : 1);
    const wx = (fwdX * my + rightX * mx) * target, wz = (fwdZ * my + rightZ * mx) * target;
    if (this.skating) {
      // a skateboard glides: push to accelerate, then coast (keep momentum)
      const accel = Math.min(1, dt * SKATE_ACCEL);
      if (moving) { this.vx += (wx - this.vx) * accel; this.vz += (wz - this.vz) * accel; }
      else { const decay = Math.max(0, 1 - SKATE_COAST * dt); this.vx *= decay; this.vz *= decay; }
    } else {
      const k = Math.min(1, dt * (this.physics.playerGrounded ? ACCEL_G : ACCEL_A));
      this.vx += (wx - this.vx) * k; this.vz += (wz - this.vz) * k;
    }
    b.velocity.x = this.vx; b.velocity.z = this.vz;
    this.speed = Math.hypot(this.vx, this.vz);
    if (allowInput && inp.jump && this.physics.playerGrounded && b.velocity.y < 1) { b.velocity.y = JUMP; if (this.onJump) this.onJump(); }
    this.airborne = !this.physics.playerGrounded && Math.abs(b.velocity.y) > 0.6;
    let wantYaw = this.yaw;
    if (charging || this.releasing > 0) wantYaw = this.camYaw;
    else if (this.speed > 0.3) wantYaw = Math.atan2(this.vx, this.vz);
    let dy = wantYaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * (this.skating ? 8 : 12));
    // items (throw mode only)
    if (this.mode === 'throw') {
      if (allowInput && inp.selectIndex >= 0 && inp.selectIndex !== this.item) { this.item = inp.selectIndex; if (this.onSwitch) this.onSwitch(this.item); }
      if (allowInput && inp.switchDelta) { this.item = ((this.item + inp.switchDelta) % ITEMS.length + ITEMS.length) % ITEMS.length; if (this.onSwitch) this.onSwitch(this.item); }
    }
    // charge / release: the power meter SWEEPS between low and high while held,
    // so you have to release near the peak for a big launch (not just hold max).
    if (allowInput && inp.throwHeld) {
      if (this.charge < 0) { this.charge = 0.08; this.chargeDir = 1; }
      else {
        this.charge += this.chargeDir * dt / CHARGE_HALF;
        if (this.charge >= 1) { this.charge = 1; this.chargeDir = -1; }
        else if (this.charge <= 0.08) { this.charge = 0.08; this.chargeDir = 1; }
      }
    } else if (this.charge >= 0) this.release();
    if (this.releasing > 0) this.releasing = Math.max(0, this.releasing - dt * 4);
    // rig
    this.rig.setPosition(b.position.x, b.position.y - 0.42, b.position.z);
    this.rig.setHeading(this.yaw);
    this.rig.updatePose(dt, { speed: this.speed, airborne: this.airborne, charge: this.charge, releasing: this.releasing, skating: this.skating });
    this.rig.jointWorld('larmR', this.handPos); this.handPos.y -= 0.2;
    if (this.heldMesh) {
      const show = this.charging && this.mode === 'throw';
      this.heldMesh.visible = show;
      if (show) {
        const m = this.rig.bones[PART_INDEX.larmR].matrixWorld;
        _tmp.set(0, -0.34, 0).applyMatrix4(m);
        this.heldMesh.position.copy(_tmp); this.heldMesh.quaternion.setFromRotationMatrix(m);
      }
    }
    this.computeCamera(dt);
  }

  updateRigStanding(dt) {
    const b = this.body;
    this.rig.setPosition(b.position.x, b.position.y - 0.42, b.position.z);
    this.rig.setHeading(this.yaw);
    this.rig.updatePose(dt, { speed: 0, releasing: this.releasing > 0 ? this.releasing : 0 });
    if (this.releasing > 0) this.releasing = Math.max(0, this.releasing - dt * 4);
  }

  // ---- aim ----
  computeCamera(dt) {
    const b = this.body;
    const charging = this.charging;
    const dist = charging ? CAM_DIST_AIM : CAM_DIST;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    _dir.set(-Math.sin(this.camYaw) * cp, sp, -Math.cos(this.camYaw) * cp);
    const rightX = -Math.cos(this.camYaw), rightZ = Math.sin(this.camYaw); // right shoulder
    _from.set(b.position.x + rightX * CAM_SIDE * (charging ? 1.25 : 1), b.position.y - 0.42 + CAM_H, b.position.z + rightZ * CAM_SIDE * (charging ? 1.25 : 1));
    let d = dist;
    if (this.world.cameraBlockers.length) {
      _ray.set(_from, _dir); _ray.far = dist + 0.3;
      const hits = _ray.intersectObjects(this.world.cameraBlockers, false);
      if (hits.length) d = Math.max(0.6, hits[0].distance - 0.3);
    }
    _want.copy(_from).addScaledVector(_dir, d);
    if (_want.y < 0.35) _want.y = 0.35;
    const kk = dt >= 1 ? 1 : 1 - Math.pow(0.0004, dt);
    this.camPos.lerp(_want, kk);
    this.camLook.set(_from.x, _from.y - 0.08, _from.z).addScaledVector(_dir, -6);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    // crosshair ray → aim point
    this.camera.getWorldDirection(this.aimDir);
    _ray.set(this.camera.position, this.aimDir); _ray.far = 80;
    let tgt = 80;
    const hits = this.world.cameraBlockers.length ? _ray.intersectObjects(this.world.cameraBlockers, false) : [];
    if (hits.length) tgt = hits[0].distance;
    if (this.aimDir.y < -0.001) { const tg = -this.camera.position.y / this.aimDir.y; if (tg < tgt) tgt = tg; }
    this.aimPoint.copy(this.camera.position).addScaledVector(this.aimDir, Math.max(4, tgt));
  }

  // origin the launch/throw leaves from
  launchOrigin(out) {
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    return out.set(this.handPos.x + fx * 0.5, Math.max(this.handPos.y, 1.15), this.handPos.z + fz * 0.5);
  }
  // shared launch velocity: fling along where you're LOOKING, plus a loft so
  // things arc up nicely. Look up → they fly high (angle of attack matters).
  // The preview integrates this exact vector, so the guide always matches.
  launchVel(speed, out) {
    out.copy(this.aimDir);
    const loft = this.mode === 'throw' ? 0.12 : 0.34;   // yeet launches arc higher
    out.y = Math.max(out.y, -0.1) + loft;               // never fire steeply into the ground
    out.normalize().multiplyScalar(speed);
    return out;
  }

  release() {
    const power = Math.max(0.14, this.charge);
    this.charge = -1; this.releasing = 1;
    const speed = this.launchSpeed(power);
    const origin = this.launchOrigin(new THREE.Vector3());
    const vel = this.launchVel(speed, new THREE.Vector3());
    if (this.mode === 'throw') {
      const kind = this.kind;
      const spin = kind.rolls
        ? { x: Math.cos(this.camYaw) * -speed / kind.r * 0.6, y: 0, z: Math.sin(this.camYaw) * speed / kind.r * 0.6 }
        : { x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 };
      if (this.onThrow) this.onThrow({ kind, pos: origin, vel: { x: vel.x, y: vel.y, z: vel.z }, spin, power });
    } else {
      if (this.onYeet) this.onYeet({ dir: vel.clone().normalize(), speed, power, origin });
    }
  }

  // ballistic preview using the SAME velocity the launch uses → guide is accurate.
  // Records where it hits the ground in this.landPoint (the aim dot sits there).
  previewArc(out, n = 30) {
    const power = Math.max(0.14, this.charge);
    const speed = this.launchSpeed(power);
    const o = this.launchOrigin(_tmp2);
    const v = this.launchVel(speed, _tmp);
    const dt = 0.05;
    let px = o.x, py = o.y, pz = o.z, vx = v.x, vy = v.y, vz = v.z;
    let landed = false;
    for (let i = 0; i < n; i++) {
      out[i * 3] = px; out[i * 3 + 1] = Math.max(0.05, py); out[i * 3 + 2] = pz;
      vy -= GRAV * dt; px += vx * dt; py += vy * dt; pz += vz * dt;
      if (!landed && py < 0.05) { landed = true; this.landPoint.set(px, 0.06, pz); for (let j = i + 1; j < n; j++) { out[j * 3] = px; out[j * 3 + 1] = 0.05; out[j * 3 + 2] = pz; } break; }
    }
    if (!landed) this.landPoint.set(px, 0.06, pz);
  }

  // ---- follow-cam on a launched body ----
  startWatch(body, dur = 3.6) { this.watch = { body, t: 0, dur, camV: new THREE.Vector3() }; }
  stopWatch() { this.watch = null; this.releasing = 0; this.snapCamera(); }
  updateWatch(dt) {
    const w = this.watch; w.t += dt;
    const p = w.body.position, v = w.body.velocity;
    // trail behind the flight direction and pull back with speed + height so a
    // fast, high launch stays fully framed (never flies off-screen).
    const speed = Math.hypot(v.x, v.z);
    _dir.set(v.x, 0, v.z); if (_dir.lengthSq() < 0.01) _dir.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)); _dir.normalize();
    const back = 6 + speed * 0.32 + p.y * 0.35;
    _want.set(p.x - _dir.x * back, Math.max(2.2, p.y * 0.55 + 4), p.z - _dir.z * back);
    const kk = 1 - Math.pow(0.00003, dt);   // snappy — keep up with a fast body
    this.camPos.lerp(_want, kk);
    this.camLook.lerp(_tmp.set(p.x, p.y + 0.2, p.z), 1 - Math.pow(0.00005, dt));
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    this.camYaw = Math.atan2(_dir.x, _dir.z);
  }
}
