// Procedural WebAudio sfx. No files. Everything is tiny oscillator/noise bursts.
export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.muted = localStorage.getItem('sy-muted') === '1'; this.ambient = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
    } catch { return false; }
    return true;
  }
  makeNoise() {
    const len = this.ctx.sampleRate * 1.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  setMuted(m) { this.muted = m; localStorage.setItem('sy-muted', m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  env(node, t0, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g); g.connect(this.master); return g;
  }
  tone(freq, { type = 'sine', a = 0.01, d = 0.2, peak = 0.3, slide = null, when = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + a + d);
    this.env(o, t0, a, d, peak); o.start(t0); o.stop(t0 + a + d + 0.05);
  }
  noise({ a = 0.005, d = 0.15, peak = 0.3, lp = 2000, hp = 100, when = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const h = this.ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    s.connect(f); f.connect(h); this.env(h, t0, a, d, peak); s.start(t0); s.stop(t0 + a + d + 0.05);
  }
  // ---- named cues ----
  whoosh(power = 1) { this.noise({ a: 0.04, d: 0.25 + power * 0.15, peak: 0.25 + power * 0.25, lp: 1200 + power * 1800, hp: 300 }); }
  charge(t) { /* soft rising tick handled in main via chargeTick */ }
  chargeTick(level) { this.tone(300 + level * 500, { type: 'triangle', a: 0.005, d: 0.05, peak: 0.05 }); }
  thud(strength = 1) { this.noise({ a: 0.003, d: 0.12, peak: Math.min(0.6, 0.25 + strength * 0.2), lp: 500, hp: 60 }); this.tone(90, { type: 'sine', a: 0.004, d: 0.15, peak: 0.25 * strength, slide: 40 }); }
  splat() { this.noise({ a: 0.003, d: 0.22, peak: 0.35, lp: 900, hp: 120 }); this.tone(220, { type: 'square', a: 0.003, d: 0.08, peak: 0.08, slide: 80 }); }
  bonk() { this.tone(520, { type: 'square', a: 0.004, d: 0.14, peak: 0.15, slide: 180 }); this.noise({ a: 0.002, d: 0.08, peak: 0.2, lp: 1500 }); }
  yeet(combo = 1) {
    const base = 440 * Math.pow(1.12, Math.min(combo, 8));
    this.tone(base, { type: 'triangle', a: 0.01, d: 0.14, peak: 0.18 });
    this.tone(base * 1.5, { type: 'triangle', a: 0.01, d: 0.18, peak: 0.16, when: 0.07 });
  }
  domino() { [0, 0.08, 0.16].forEach((w, i) => this.tone(330 * (1 + i * 0.25), { type: 'square', a: 0.01, d: 0.12, peak: 0.12, when: w })); }
  bell() { [660, 880, 1320].forEach((f, i) => this.tone(f, { type: 'sine', a: 0.01, d: 1.8 - i * 0.3, peak: 0.25 - i * 0.06 })); this.tone(165, { type: 'sine', a: 0.02, d: 2.2, peak: 0.2 }); }
  cow() { this.tone(180, { type: 'sawtooth', a: 0.05, d: 0.5, peak: 0.15, slide: 120 }); this.tone(270, { type: 'sawtooth', a: 0.08, d: 0.45, peak: 0.1, slide: 200, when: 0.1 }); }
  flutter() { for (let i = 0; i < 6; i++) this.noise({ a: 0.01, d: 0.04, peak: 0.12, lp: 3000, hp: 800, when: i * 0.06 }); }
  jump() { this.tone(260, { type: 'triangle', a: 0.01, d: 0.12, peak: 0.1, slide: 420 }); }
  land() { this.noise({ a: 0.003, d: 0.08, peak: 0.12, lp: 600 }); }
  tick() { this.tone(880, { type: 'square', a: 0.003, d: 0.04, peak: 0.06 }); }
  switchItem() { this.tone(600, { type: 'triangle', a: 0.005, d: 0.06, peak: 0.08, slide: 900 }); }
  start() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, { type: 'triangle', a: 0.01, d: 0.25, peak: 0.16, when: i * 0.09 })); }
  end() { [784, 659, 523, 392].forEach((f, i) => this.tone(f, { type: 'triangle', a: 0.01, d: 0.35, peak: 0.16, when: i * 0.14 })); }
  fanfare() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, { type: 'square', a: 0.01, d: 0.18, peak: 0.09, when: i * 0.1 })); }
  ambientOn() {
    if (!this.ctx || this.ambient) return;
    // street murmur: filtered noise, very low
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.035;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.ambient = { s, g };
  }
}
