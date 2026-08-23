// Juice: splat particles (one instanced mesh, CPU-simulated), floating score
// text (HTML, projected), hit-stop/slow-mo and camera shake helpers.
import * as THREE from '../vendor/three.module.min.js';

const MAXP = 320;
export class Particles {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    this.mat = new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.8 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAXP);
    this.mesh.castShadow = false; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = [];
    for (let i = 0; i < MAXP; i++) this.p.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, col: new THREE.Color() });
    this.next = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAXP; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
    scene.add(this.mesh);
  }
  burst(x, y, z, color, n = 14, speed = 3.5, size = 1) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const q = this.p[this.next]; this.next = (this.next + 1) % MAXP;
      q.life = 0.7 + Math.random() * 0.6;
      q.x = x; q.y = y; q.z = z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.5, sp = speed * (0.4 + Math.random() * 0.9);
      q.vx = Math.cos(a) * Math.cos(e) * sp; q.vz = Math.sin(a) * Math.cos(e) * sp; q.vy = Math.sin(e) * sp + 1;
      q.s = size * (0.6 + Math.random() * 0.9);
      q.col.copy(c).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
    }
  }
  update(dt) {
    const m = this.mesh;
    for (let i = 0; i < MAXP; i++) {
      const q = this.p[i];
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { m.setMatrixAt(i, this.zero); continue; }
      q.vy -= 9.8 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.04) { q.y = 0.04; q.vy *= -0.3; q.vx *= 0.7; q.vz *= 0.7; }
      const s = q.s * Math.min(1, q.life * 2.5);
      this._v.set(q.x, q.y, q.z); this._s.setScalar(s); this._q.setFromAxisAngle(this._v.clone().normalize(), q.life * 4);
      this._m.compose(this._v, this._q, this._s);
      m.setMatrixAt(i, this._m);
      m.setColorAt(i, q.col);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

// floating labels: "+100 YEET", NPC yelps. HTML divs projected each frame.
export class Floaters {
  constructor(container, camera) {
    this.el = container; this.camera = camera; this.items = [];
    this._v = new THREE.Vector3();
  }
  add(text, x, y, z, { cls = '', life = 1.4, rise = 1.2 } = {}) {
    const d = document.createElement('div');
    d.className = 'floater ' + cls;
    d.textContent = text;
    this.el.appendChild(d);
    this.items.push({ d, x, y, z, life, max: life, rise });
    if (this.items.length > 24) { const old = this.items.shift(); old.d.remove(); }
  }
  update(dt, w, h) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      if (f.life <= 0) { f.d.remove(); this.items.splice(i, 1); continue; }
      const t = 1 - f.life / f.max;
      this._v.set(f.x, f.y + t * f.rise, f.z).project(this.camera);
      if (this._v.z > 1 || this._v.z < -1) { f.d.style.opacity = 0; continue; }
      const sx = (this._v.x * 0.5 + 0.5) * w, sy = (-this._v.y * 0.5 + 0.5) * h;
      f.d.style.transform = `translate(-50%,-50%) translate(${sx}px,${sy}px) scale(${0.8 + Math.min(1, t * 6) * 0.3})`;
      f.d.style.opacity = t < 0.75 ? 1 : (1 - t) * 4;
    }
  }
  clear() { for (const f of this.items) f.d.remove(); this.items.length = 0; }
}

export class Shake {
  constructor() { this.t = 0; this.amp = 0; }
  hit(amp = 0.15, t = 0.25) { this.amp = Math.max(this.amp, amp); this.t = Math.max(this.t, t); }
  apply(camera, dt) {
    if (this.t <= 0) return;
    this.t -= dt;
    const k = Math.max(0, this.t) * this.amp * 4;
    camera.position.x += (Math.random() - 0.5) * k;
    camera.position.y += (Math.random() - 0.5) * k;
    if (this.t <= 0) this.amp = 0;
  }
}
