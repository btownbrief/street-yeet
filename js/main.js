// STREET YEET — boot, screens, the round loop, scoring, HUD, leaderboard.
import * as THREE from '../vendor/three.module.min.js';
import { buildWorld } from './world.js';
import { Physics } from './physics.js';
import { NPCs, Pigeons } from './npcs.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { ITEMS, ItemVisuals, makeItemMesh } from './items.js';
import { Particles, Floaters, Shake } from './fx.js';
import { Audio } from './audio.js';
import * as T from './textures.js';
import { STREET } from './roster.js';
import * as LB from './leaderboard.js';

const $ = (id) => document.getElementById(id);
const ROUND_SECONDS = 90;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const OG = new URLSearchParams(location.search).has('og');
const MOBILE = isTouch && Math.min(innerWidth, innerHeight) < 900;

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let pixelRatio = Math.min(devicePixelRatio || 1, MOBILE ? 1.6 : 2);
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe0ef');
scene.fog = new THREE.Fog('#d6e2ec', 70, 420);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

// sky dome + clouds
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.MeshBasicMaterial({ map: T.skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.set(0, -40, 220);
  scene.add(sky);
  const cloudTex = T.cloudTexture();
  const cm = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
  const rng = T.mulberry(5);
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(cm);
    const a = rng() * Math.PI * 2, r = 300 + rng() * 350;
    s.position.set(Math.cos(a) * r, 110 + rng() * 90, 220 + Math.sin(a) * r);
    const sc = 120 + rng() * 160; s.scale.set(sc, sc * 0.5, 1);
    scene.add(s);
  }
}
// lights
const hemi = new THREE.HemisphereLight('#cfe0f2', '#8a7358', 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
const SH = MOBILE ? 34 : 48;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH; sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
const fill = new THREE.DirectionalLight('#dbe6ff', 0.45); fill.position.set(40, 30, -40); scene.add(fill);
const warmFill = new THREE.DirectionalLight('#ffd9a8', 0.25); warmFill.position.set(-30, 14, 60); scene.add(warmFill);

// ---------- build ----------
const loadEl = $('loading'), loadText = $('loadText');
const setLoad = (t) => { loadText.textContent = t; };
await new Promise((r) => requestAnimationFrame(r));
setLoad('Laying the bricks…');
const world = buildWorld(scene, { quality: MOBILE ? 'medium' : 'high' });
await new Promise((r) => setTimeout(r, 10));
setLoad('Waking up the pigeons…');
const physics = new Physics();
physics.addStatics(world.colliders);
physics.addBell(world.bell);
physics.addCows(world.cows);
physics.initProjectiles();
physics.initRagdolls();
const npcs = new NPCs(scene, world, physics, { count: MOBILE ? 30 : 46 });
const pigeons = new Pigeons(scene, world.pigeonSpots);
const player = new Player(scene, physics, world, camera);
const visuals = new ItemVisuals(scene);
const particles = new Particles(scene);
const floaters = new Floaters($('floaters'), camera);
const shake = new Shake();
const audio = new Audio();
// held item preview meshes
const heldMeshes = ITEMS.map((k) => { const m = makeItemMesh(k); m.visible = false; m.scale.setScalar(0.9); scene.add(m); return m; });
player.heldMesh = heldMeshes[0];
// aim arc
const arcGeo = new THREE.BufferGeometry();
const ARC_N = 22;
arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
const arcPts = new THREE.Points(arcGeo, new THREE.PointsMaterial({ color: '#fff3c4', size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.9, depthTest: false }));
arcPts.frustumCulled = false; arcPts.visible = false; arcPts.renderOrder = 5;
scene.add(arcPts);
const aimDot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd34a', depthTest: false, transparent: true, opacity: 0.9 }));
aimDot.visible = false; aimDot.renderOrder = 6; scene.add(aimDot);

// ---------- input ----------
const input = new Input(canvas, { zone: $('touchZone'), stickBase: $('stickBase'), stickKnob: $('stickKnob'), yeetBtn: $('yeetBtn'), jumpBtn: $('jumpBtn'), itemBtn: $('itemBtn') });
document.body.classList.toggle('touch', isTouch);

// ---------- game state ----------
const G = {
  state: 'menu', // menu | cutscene | play | results | paused
  t: 0, timeScale: 1, slowT: 0,
  score: 0, yeets: 0, combo: 0, comboT: 0, bestCombo: 0, longest: 0, bells: 0, cows: 0, dominoes: 0, headshots: 0,
  timeLeft: ROUND_SECONDS, lastTick: -1,
  itemUse: {}, bestScore: Number(localStorage.getItem('sy-best') || 0),
  submitted: false, played: Number(localStorage.getItem('sy-played') || 0),
  cut: { t: 0, active: false },
  lastFrame: performance.now(), fpsAcc: 0, fpsN: 0, lowFpsT: 0, qualityLevel: 2,
};
const el = {
  hud: $('hud'), score: $('score'), combo: $('combo'), timer: $('timer'), itemBar: $('itemBar'), announcer: $('announcer'),
  charge: $('chargeRing'), crosshair: $('crosshair'), hint: $('hint'), pause: $('pauseOverlay'),
  menu: $('menu'), results: $('results'), cut: $('cutscene'), cutTitle: $('cutTitle'), cutSub: $('cutSub'),
  itemName: $('itemName'), itemBtn: $('itemBtn'), mute: $('mute'), yeetBtn: $('yeetBtn'),
};

// ---------- HUD ----------
function buildItemBar() {
  el.itemBar.innerHTML = '';
  ITEMS.forEach((k, i) => {
    const d = document.createElement('button');
    d.className = 'item-chip' + (i === player.item ? ' sel' : '');
    d.innerHTML = `<span class="ie">${k.emoji}</span><span class="ik">${i + 1}</span>`;
    d.title = k.name;
    d.addEventListener('click', () => { if (G.state === 'play') { player.item = i; onSwitch(i); } });
    el.itemBar.appendChild(d);
  });
  el.itemName.textContent = `${ITEMS[player.item].name} · ${ITEMS[player.item].tip}`;
}
function onSwitch(i) {
  [...el.itemBar.children].forEach((c, k) => c.classList.toggle('sel', k === i));
  el.itemName.textContent = `${ITEMS[i].name} · ${ITEMS[i].tip}`;
  el.itemBtn.textContent = ITEMS[i].emoji;
  player.heldMesh.visible = false; player.heldMesh = heldMeshes[i];
  audio.switchItem();
}
player.onSwitch = onSwitch;
buildItemBar();
el.itemBtn.textContent = ITEMS[0].emoji;

let announceT = 0;
function announce(text, cls = '', hold = 1.1) {
  el.announcer.textContent = text;
  el.announcer.className = 'show ' + cls;
  announceT = hold;
}
function setScore(n) { G.score = n; el.score.textContent = n.toLocaleString(); }
function addScore(n, x, y, z, label, cls = 'pts') {
  setScore(G.score + n);
  if (x !== undefined) floaters.add(`${label ? label + ' ' : ''}+${n}`, x, y, z, { cls });
}
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// ---------- scoring hooks ----------
npcs.onYelp = (npc, text) => { floaters.add(text, npc.x, 2.1, npc.z, { cls: 'yelp', life: 1.8, rise: 0.9 }); };
physics.onBell = () => {
  if (G.state !== 'play' || G.bellCool > 0) return;
  G.bellCool = 2.5; G.bells++;
  addScore(500, world.bell.x, world.bell.y, world.bell.z, 'BELL RINGER', 'big');
  announce('🔔 BELL RINGER!', 'gold', 1.6); audio.bell(); shake.hit(0.12, 0.3);
};
let thudCool = 0;
physics.onProjectileHit = (p, other, speed) => {
  if (G.state !== 'play') return;
  const kind = p.kind, b = p.body;
  if (kind.splat && speed > 4 && !p.splatted && other.collisionFilterGroup !== 16) {
    p.splatted = true;
    particles.burst(b.position.x, b.position.y, b.position.z, kind.splatColor, 18, 3.5, 1.1);
    audio.splat(); physics.retire(p);
    return;
  }
  if (speed > 4 && thudCool <= 0) { audio.thud(Math.min(1, speed / 12)); thudCool = 0.06; }
  if (speed > 5) particles.burst(b.position.x, b.position.y, b.position.z, kind.splatColor, 4, 1.5, 0.6);
};
pigeons.onFlush = (f) => {
  if (G.state !== 'play') return;
  addScore(35, f.x, 1.2, f.z, 'FLUSHED', 'pts small'); audio.flutter();
};
player.onJump = () => audio.jump();
player.onThrow = ({ kind, pos, vel, spin, power, flat }) => {
  const p = physics.launch(kind, pos, vel, spin);
  p.visual = visuals.take(kind);
  p.origin = { x: pos.x, z: pos.z };
  p.scored = false;
  G.itemUse[kind.id] = (G.itemUse[kind.id] || 0) + 1;
  audio.whoosh(power);
};

function knockNPC(npc, dir, power, point, part, cause, from) {
  const r = npcs.knock(npc, dir, power, point, part, cause);
  if (!r) return;
  r.scored = false; r.cause = cause; r.torsoPrev = new THREE.Vector3().copy(r.bodies[1].position);
  G.yeets++;
  G.combo = G.comboT > 0 ? G.combo + 1 : 1; G.comboT = 3;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  const mult = Math.min(8, G.combo);
  let pts = 100; let label = npc.look.label.toUpperCase();
  const head = part === 'head';
  if (head) { pts += 50; G.headshots++; }
  if (cause === 'domino') { pts += 150; G.dominoes++; }
  pts *= mult;
  addScore(pts, npc.x, 1.9, npc.z, head ? 'NOGGIN' : cause === 'domino' ? 'DOMINO' : label, head || cause === 'domino' ? 'big' : 'pts');
  if (from) { const d = Math.hypot(npc.x - from.x, npc.z - from.z); if (d > 24) { addScore(100, npc.x, 2.4, npc.z, `${Math.round(d)}m LONG YEET`, 'big'); G.longest = Math.max(G.longest, d); } else G.longest = Math.max(G.longest, d); }
  if (mult >= 2) { el.combo.textContent = `×${mult} COMBO`; el.combo.className = 'show pop'; setTimeout(() => el.combo.classList.remove('pop'), 60); }
  if (cause === 'domino') { announce('DOMINO!', 'hot', 0.9); audio.domino(); }
  else if (mult >= 3) { announce(`×${mult} YEET!`, 'hot', 0.9); }
  else if (mult === 1 && G.yeets === 1) announce('YEET!', '', 0.8);
  audio.yeet(mult); audio.bonk();
  shake.hit(0.06 + Math.min(0.2, power * 0.01), 0.2);
  if (mult >= 3 || cause === 'domino') { G.timeScale = 0.28; G.slowT = 0.35; }
}

// projectile / ragdoll vs people
const _d = new THREE.Vector3();
function hitChecks() {
  const list = npcs.list;
  for (const p of physics.projectiles) {
    if (!p.active || p.splatted) continue;
    const b = p.body, sp = b.velocity.length();
    if (sp < 3.5) continue;
    const ax = p.framePrev.x, ay = p.framePrev.y, az = p.framePrev.z, bx = b.position.x, by = b.position.y, bz = b.position.z;
    for (const npc of list) {
      if (npc.state === 'ragdoll' || npc.state === 'dazed') continue;
      if (Math.abs(npc.z - bz) > 4 && Math.abs(npc.z - az) > 4) continue;
      if (Math.abs(npc.x - bx) > 4 && Math.abs(npc.x - ax) > 4) continue;
      const h = npcs.hitTest(npc, ax, ay, az, bx, by, bz, p.kind.r);
      if (!h) continue;
      _d.set(b.velocity.x, b.velocity.y, b.velocity.z).normalize();
      const power = Math.min(16, sp * 0.32 * p.kind.knock * (0.7 + p.kind.mass * 0.22));
      knockNPC(npc, _d, power, h.point, h.part, 'throw', p.origin);
      p.hitCount++;
      if (p.kind.splat) { p.splatted = true; particles.burst(h.point.x, h.point.y, h.point.z, p.kind.splatColor, 20, 4, 1.1); audio.splat(); physics.retire(p); }
      else { b.velocity.scale(p.kind.rolls ? 0.75 : 0.35, b.velocity); particles.burst(h.point.x, h.point.y, h.point.z, p.kind.splatColor, 6, 2, 0.7); }
      break;
    }
  }
  // flying ragdolls bowl people over
  for (const r of physics.ragdolls) {
    if (!r.active || r.age > 5 || !r.torsoPrev) continue;
    const tb = r.bodies[1], sp = tb.velocity.length();
    if (sp > 3.2) {
      for (const npc of list) {
        if (npc === r.npc || npc.state === 'ragdoll' || npc.state === 'dazed') continue;
        if (Math.abs(npc.z - tb.position.z) > 3 || Math.abs(npc.x - tb.position.x) > 3) continue;
        const h = npcs.hitTest(npc, r.torsoPrev.x, r.torsoPrev.y, r.torsoPrev.z, tb.position.x, tb.position.y, tb.position.z, 0.28);
        if (!h) continue;
        _d.set(tb.velocity.x, tb.velocity.y, tb.velocity.z).normalize();
        knockNPC(npc, _d, Math.min(12, sp * 0.9), h.point, h.part, 'domino', null);
        tb.velocity.scale(0.5, tb.velocity);
        break;
      }
    }
    r.torsoPrev.copy(tb.position);
    // distance / air bonuses once the flight is over
    if (!r.scored && (r.age > 3.2 || r.settled > 0.4)) {
      r.scored = true;
      const hips = r.bodies[0].position;
      if (r.travel >= 4) addScore(Math.round(r.travel) * 12, hips.x, 1.2, hips.z, `${Math.round(r.travel)}m YEET`, 'pts');
      if (r.peak > 3.4) addScore(100, hips.x, 1.8, hips.z, 'AIR', 'big');
    }
  }
  // cows tipping
  for (const c of physics.cows) {
    const q = c.body.quaternion;
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (!c.tipped && upY < 0.55 && G.state === 'play') {
      c.tipped = true; G.cows++;
      addScore(200, c.body.position.x, 1.6, c.body.position.z, 'HOLY COW', 'big'); announce('🐄 HOLY COW!', 'gold', 1.2); audio.cow();
    }
  }
}

// ---------- screens ----------
function show(elm, on) { elm.classList.toggle('hidden', !on); }
function enterMenu() {
  G.state = 'menu';
  show(el.menu, true); show(el.results, false); show(el.hud, false); show(el.cut, false);
  input.enabled = false; input.releaseLock();
  $('menuBest').textContent = G.bestScore ? `Your best: ${G.bestScore.toLocaleString()}` : '';
  player.reset(world.spawn.x, world.spawn.z);
  G.cut = { t: 0, active: false };
  cutCam(0);
}
function startRound({ skipCut = false } = {}) {
  audio.ensure(); audio.ambientOn();
  setScore(0); G.yeets = 0; G.combo = 0; G.comboT = 0; G.bestCombo = 0; G.longest = 0; G.bells = 0; G.cows = 0; G.dominoes = 0; G.headshots = 0; G.itemUse = {};
  G.timeLeft = ROUND_SECONDS; G.lastTick = -1; G.submitted = false; G.bellCool = 0;
  el.combo.className = '';
  npcs.resetAll();
  for (const p of physics.projectiles) if (p.active) { physics.retire(p); visuals.release(p.visual); p.visual = null; }
  for (const c of physics.cows) { c.body.position.set(c.home.x, 0, c.home.z); c.body.quaternion.setFromEuler(0, c.home.ry, 0); c.body.velocity.set(0, 0, 0); c.body.angularVelocity.set(0, 0, 0); c.tipped = false; c.body.sleep(); }
  floaters.clear();
  player.reset(world.spawn.x, world.spawn.z);
  show(el.menu, false); show(el.results, false);
  el.timer.textContent = fmtTime(G.timeLeft);
  if (skipCut) beginPlay(true); else beginCutscene();
}
function beginCutscene() {
  G.state = 'cutscene';
  G.cut = { t: 0, active: true };
  show(el.cut, true); show(el.hud, false);
  el.cutTitle.className = ''; el.cutSub.className = '';
}
function beginPlay(fromGesture = false) {
  G.state = 'play';
  show(el.cut, false); show(el.hud, true);
  input.enabled = true;
  // Pointer lock must come from a user gesture. If we entered from a click
  // (skip / quick start) grab it now; otherwise the first in-play click locks.
  if (!isTouch && fromGesture) input.requestLock();
  announce('YEET HOUR', 'gold', 1.2); audio.start();
  G.played++; localStorage.setItem('sy-played', String(G.played));
  el.hint.classList.toggle('hidden', isTouch);
  if (!isTouch && !input.locked) el.hint.innerHTML = '<b>Click</b> to grab the mouse · WASD move · <b>hold click</b> to charge, release to YEET · 1–5 items · space jump · shift sprint';
  player.snapCamera();
}
function endRound() {
  G.state = 'results';
  input.enabled = false; input.releaseLock();
  show(el.hud, false); show(el.results, true);
  audio.end();
  const best = Math.max(G.bestScore, G.score);
  const isBest = G.score > G.bestScore && G.score > 0;
  G.bestScore = best; localStorage.setItem('sy-best', String(best));
  $('rScore').textContent = G.score.toLocaleString();
  $('rTitle').textContent = isBest ? 'NEW BEST YEET' : G.score >= 6000 ? 'LEGENDARY YEET' : G.score >= 3000 ? 'STRONG YEET' : G.score > 0 ? 'ROUND OVER' : 'NOBODY GOT YEETED';
  const fav = Object.entries(G.itemUse).sort((a, b) => b[1] - a[1])[0];
  const favItem = fav ? ITEMS.find((k) => k.id === fav[0]) : null;
  $('rStats').innerHTML = [
    ['People yeeted', G.yeets], ['Best combo', G.bestCombo ? `×${Math.min(8, G.bestCombo)}` : '—'], ['Longest yeet', G.longest ? `${Math.round(G.longest)} m` : '—'],
    ['Dominoes', G.dominoes], ['Noggins', G.headshots], ['Cows tipped', G.cows], ['Bell rung', G.bells ? `${G.bells}×` : 'no'],
    ['Go-to throw', favItem ? `${favItem.emoji} ${favItem.name}` : '—'],
  ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  $('rBest').textContent = `Your best: ${best.toLocaleString()}`;
  if (isBest) audio.fanfare();
  submitAndShowBoard();
}

// ---------- cutscene camera ----------
const CUT = [
  { t: 0, pos: [34, 46, -78], look: [0, 18, 30] },      // high over Pearl St, the steeple in the foreground
  { t: 2.8, pos: [-7, 11, 4], look: [0, 4, 70] },       // swoop over the top of the block
  { t: 5.2, pos: [5.5, 3.0, 30], look: [0, 1.6, 62] },  // down among the trees
  { t: 6.4, pos: null, look: null },                     // blend into the player's camera
];
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
function smooth(t) { return t * t * (3 - 2 * t); }
function cutCam(t) {
  let i = 0; while (i < CUT.length - 2 && t > CUT[i + 1].t) i++;
  const a = CUT[i], b = CUT[i + 1];
  const u = smooth(THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1));
  player.computeCamera(1);
  const bp = b.pos || player.camPos.toArray(), bl = b.look || player.camLook.toArray();
  _cp.set(a.pos[0] + (bp[0] - a.pos[0]) * u, a.pos[1] + (bp[1] - a.pos[1]) * u, a.pos[2] + (bp[2] - a.pos[2]) * u);
  _cl.set(a.look[0] + (bl[0] - a.look[0]) * u, a.look[1] + (bl[1] - a.look[1]) * u, a.look[2] + (bl[2] - a.look[2]) * u);
  camera.position.copy(_cp); camera.lookAt(_cl);
}
function updateCutscene(dt) {
  const c = G.cut; c.t += dt;
  cutCam(c.t);
  if (c.t > 0.5) el.cutTitle.className = 'in';
  if (c.t > 1.5) el.cutSub.className = 'in';
  if (c.t > 4.6) { el.cutTitle.className = 'out'; el.cutSub.className = 'out'; }
  if (c.t >= CUT[CUT.length - 1].t) { player.camPos.copy(camera.position); beginPlay(false); }
}
function skipCutscene() { if (G.state === 'cutscene') { player.camPos.copy(camera.position); beginPlay(true); } }

// ---------- leaderboard ----------
const lb = { tab: 0 };
async function submitAndShowBoard() {
  const panel = $('lb');
  if (!LB.lbEnabled()) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  const name = LB.getName();
  $('lbForm').classList.toggle('hidden', !!name);
  $('lbRenameBtn').classList.toggle('hidden', !name);
  if (name && G.score > 0 && !G.submitted) {
    G.submitted = true;
    try { await LB.submitScore(G.score); } catch { /* shown as unavailable below */ }
  }
  renderBoard();
}
async function renderBoard() {
  const status = $('lbStatus'), list = $('lbList');
  status.textContent = 'Loading…'; list.innerHTML = '';
  try {
    const rows = await LB.fetchTop(lb.tab === 0 ? 0 : -1);
    status.textContent = rows.length ? `${LB.monthLabel(lb.tab === 0 ? 0 : -1)} · top yeeters` : `No scores yet for ${LB.monthLabel(lb.tab === 0 ? 0 : -1)} — be the first.`;
    const me = LB.playerId();
    list.innerHTML = rows.slice(0, 10).map((r, i) => `<li class="${r.player_id === me ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="nm">${escapeHtml(r.name)}</span><span class="sc">${Number(r.score).toLocaleString()}</span></li>`).join('');
  } catch { status.textContent = 'Leaderboard unavailable right now.'; }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
$('lbThisBtn').addEventListener('click', () => { lb.tab = 0; $('lbThisBtn').classList.add('sel'); $('lbLastBtn').classList.remove('sel'); renderBoard(); });
$('lbLastBtn').addEventListener('click', () => { lb.tab = 1; $('lbLastBtn').classList.add('sel'); $('lbThisBtn').classList.remove('sel'); renderBoard(); });
$('lbSaveBtn').addEventListener('click', async () => {
  const v = $('lbNameInput').value.trim(); if (!v) return;
  await LB.renamePlayer(v); $('lbForm').classList.add('hidden'); $('lbRenameBtn').classList.remove('hidden');
  if (G.score > 0 && !G.submitted) { G.submitted = true; try { await LB.submitScore(G.score); } catch { /* ignore */ } }
  renderBoard();
});
$('lbRenameBtn').addEventListener('click', () => { $('lbNameInput').value = LB.getName(); $('lbForm').classList.remove('hidden'); $('lbRenameBtn').classList.add('hidden'); });

// ---------- buttons ----------
$('playBtn').addEventListener('click', () => startRound({ skipCut: false }));
$('quickBtn').addEventListener('click', () => startRound({ skipCut: true }));
$('againBtn').addEventListener('click', () => startRound({ skipCut: true }));
$('resultsMenuBtn').addEventListener('click', enterMenu);
$('pauseBtn').addEventListener('click', () => { if (G.state === 'play') pauseGame(); });
$('resumeBtn').addEventListener('click', resumeGame);
$('quitBtn').addEventListener('click', () => { show(el.pause, false); enterMenu(); });
el.mute.addEventListener('click', () => { audio.ensure(); audio.setMuted(!audio.muted); el.mute.textContent = audio.muted ? '🔇' : '🔊'; });
el.mute.textContent = audio.muted ? '🔇' : '🔊';
$('shareBtn').addEventListener('click', async () => {
  const text = `I scored ${G.score.toLocaleString()} in STREET YEET — ${G.yeets} people yeeted on Church Street. 🍦🧀🍁 play.btownbrief.com/street-yeet`;
  try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); $('shareBtn').textContent = 'COPIED!'; } } catch { /* ignore */ }
});
el.cut.addEventListener('click', skipCutscene);
el.cut.addEventListener('touchstart', skipCutscene, { passive: true });
input.onAnyKey = (e) => {
  if (G.state === 'cutscene') skipCutscene();
  else if (G.state === 'play' && e.code === 'Escape') { /* pointer lock exit handles pause */ }
  else if (G.state === 'paused' && (e.code === 'KeyP' || e.code === 'Enter')) resumeGame();
  else if (G.state === 'play' && e.code === 'KeyP') pauseGame();
};
input.onLockChange = (locked) => {
  if (!locked && G.state === 'play' && !isTouch && input.lockedOnce) pauseGame();
  if (locked && G.state === 'paused') resumeGame();
};
input.onLockFailed = () => { el.hint.textContent = 'Mouse look: keep the cursor in the window · hold click to charge, release to YEET'; };
const _prevLockCb = input.onLockChange;
input.onLockChange = (locked) => {
  if (locked) el.hint.innerHTML = 'WASD move · mouse aim · <b>hold click</b> to charge, release to YEET · 1–5 / scroll items · space jump · shift sprint · P pause';
  _prevLockCb(locked);
};
function pauseGame() { if (G.state !== 'play') return; G.state = 'paused'; show(el.pause, true); }
function resumeGame() { if (G.state !== 'paused') return; G.state = 'play'; show(el.pause, false); if (!isTouch && !input.locked) input.requestLock(); }
el.pause.addEventListener('click', (e) => { if (e.target === el.pause || e.target.id === 'pauseCard') { if (!isTouch) input.requestLock(); else resumeGame(); } });

// ---------- resize ----------
function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); }
addEventListener('resize', onResize); onResize();

// ---------- quality governor ----------
function governor(dt) {
  G.fpsAcc += dt; G.fpsN++;
  if (G.fpsAcc >= 2) {
    const fps = G.fpsN / G.fpsAcc; G.fpsAcc = 0; G.fpsN = 0;
    if (fps < 42 && G.state === 'play') {
      G.lowFpsT += 2;
      if (G.lowFpsT >= 4 && G.qualityLevel > 0) {
        G.qualityLevel--; G.lowFpsT = 0;
        if (G.qualityLevel === 1) { pixelRatio = Math.max(1, pixelRatio - 0.4); renderer.setPixelRatio(pixelRatio); sun.shadow.mapSize.set(1024, 1024); sun.shadow.map?.dispose(); sun.shadow.map = null; }
        if (G.qualityLevel === 0) { pixelRatio = 1; renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
      }
    } else G.lowFpsT = 0;
  }
}

// ---------- main loop ----------
const projQ = new THREE.Quaternion();
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - G.lastFrame) / 1000); G.lastFrame = now;
  if (dt <= 0) dt = 0.016;
  frames++;
  const inp = input.poll();
  // slow-mo
  if (G.slowT > 0) { G.slowT -= dt; if (G.slowT <= 0) G.timeScale = 1; }
  const ts = G.timeScale;
  const sdt = dt * ts;
  thudCool -= dt; if (G.bellCool > 0) G.bellCool -= dt;

  if (G.state === 'cutscene') {
    updateCutscene(dt);
    npcs.update(sdt, null);
    pigeons.update(sdt, []);
    player.rig.setPosition(player.x, 0, player.z); player.rig.setHeading(player.yaw); player.rig.updatePose(dt, { speed: 0 });
  } else if (G.state === 'play' || G.state === 'paused' || G.state === 'results' || G.state === 'menu') {
    const playing = G.state === 'play';
    if (playing) {
      G.timeLeft -= dt;
      const tl = Math.ceil(G.timeLeft);
      if (tl !== G.lastTick) { G.lastTick = tl; el.timer.textContent = fmtTime(G.timeLeft); el.timer.classList.toggle('urgent', tl <= 10); if (tl <= 10 && tl > 0) audio.tick(); }
      if (G.timeLeft <= 0) { endRound(); }
      if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; el.combo.className = ''; } }
      if (announceT > 0) { announceT -= dt; if (announceT <= 0) el.announcer.className = ''; }
    }
    // player moves only in play; physics keeps settling otherwise
    player.update(sdt, inp, { allowInput: playing });
    if (playing && player.charge >= 0) {
      // charge ring + arc
      el.charge.style.setProperty('--p', player.charge);
      el.charge.classList.add('on'); el.charge.classList.toggle('max', player.charge >= 1);
      player.previewArc(arcGeo.attributes.position.array, ARC_N);
      arcGeo.attributes.position.needsUpdate = true; arcPts.visible = true;
      aimDot.visible = true; aimDot.position.copy(player.aimPoint);
      if (frames % 7 === 0 && player.charge < 1) audio.chargeTick(player.charge);
    } else { el.charge.classList.remove('on'); arcPts.visible = false; aimDot.visible = false; }
    physics.step(dt, ts);
    if (playing) hitChecks();
    npcs.update(sdt, playing || G.state === 'paused' ? { x: player.x, z: player.z } : null);
    // pigeons react to projectiles, flying people, and you
    const threats = [{ x: player.x, y: 0, z: player.z }];
    for (const p of physics.projectiles) if (p.active) threats.push(p.body.position);
    for (const r of physics.ragdolls) if (r.active && r.age < 3) threats.push(r.bodies[1].position);
    pigeons.update(sdt, threats);
    // sync projectile visuals
    for (const p of physics.projectiles) {
      if (!p.active) { if (p.visual) { visuals.release(p.visual); p.visual = null; } continue; }
      if (!p.visual) continue;
      const m = p.visual.mesh, b = p.body;
      m.position.set(b.position.x, b.position.y, b.position.z);
      m.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    // cows follow their bodies
    for (const c of physics.cows) { c.mesh.position.set(c.body.position.x, c.body.position.y, c.body.position.z); c.mesh.quaternion.set(c.body.quaternion.x, c.body.quaternion.y, c.body.quaternion.z, c.body.quaternion.w); }
    if (G.state === 'menu') {
      // idle menu camera: slow drift on the top block
      const t = now / 1000;
      camera.position.set(Math.sin(t * 0.08) * 3, 3.4 + Math.sin(t * 0.13) * 0.3, 22 + Math.sin(t * 0.05) * 3);
      camera.lookAt(0, 2.2, 60 + Math.sin(t * 0.06) * 8);
    }
  }
  // sun follows the player so the shadow frustum stays tight
  sun.position.set(player.x - 34, 58, player.z + 28); sun.target.position.set(player.x, 0, player.z);
  shake.apply(camera, dt);
  particles.update(sdt);
  floaters.update(dt, innerWidth, innerHeight);
  governor(dt);
  renderer.render(scene, camera);
}

// ---------- go ----------
setLoad('Ready.');
show(loadEl, false);
if (OG) {
  // Frozen establishing shot for the social image: mid-swoop, no UI.
  document.body.classList.add('og');
  G.state = 'cutscene'; G.cut = { t: 2.9, active: true };
  show(el.cut, false); show(el.menu, false); show(loadEl, false);
  npcs.update(0.4, null);
  cutCam(2.9);
} else {
  enterMenu();
}
requestAnimationFrame((t) => { G.lastFrame = t; if (OG) { cutCam(2.9); renderer.render(scene, camera); } else frame(t); });
// expose for tooling (og screenshot, tests)
window.__SY = { G, startRound, player, npcs, physics, world, scene, camera, renderer, endRound, input, knockNPC, beginPlay };
