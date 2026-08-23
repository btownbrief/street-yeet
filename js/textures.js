// Procedural textures. Everything in the game is drawn on canvases at boot —
// no image downloads, no CDN. Keep canvases small: these live on the GPU.
import * as THREE from '../vendor/three.module.min.js';

// tiny seeded RNG so the street looks the same every load
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function tex(c, { repeat = null, aniso = 4, srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  return t;
}

function noise(ctx, w, h, alpha, rng, grains = 1200) {
  for (let i = 0; i < grains; i++) {
    const v = Math.floor(rng() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
  }
}

// ---------- Church Street pavers: running-bond clay brick with granite bands ----------
export function paverTexture() {
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d');
  const rng = mulberry(7);
  g.fillStyle = '#6e4a3c'; // mortar
  g.fillRect(0, 0, W, H);
  const bw = 64, bh = 28;
  for (let row = 0, y = 0; y < H; row++, y += bh) {
    const off = (row % 2) * (bw / 2);
    for (let x = -bw; x < W + bw; x += bw) {
      const h = 12 + rng() * 20, s = 45 + rng() * 25, l = 36 + rng() * 14;
      g.fillStyle = `hsl(${h},${s}%,${l}%)`;
      g.fillRect(x + off + 1.5, y + 1.5, bw - 3, bh - 3);
      // subtle weathering highlight
      g.fillStyle = `rgba(255,230,200,${0.05 + rng() * 0.08})`;
      g.fillRect(x + off + 1.5, y + 1.5, bw - 3, 4);
    }
  }
  // granite band along the top edge (repeats every tile → stripes across the street)
  g.fillStyle = '#8d8a83';
  g.fillRect(0, 0, W, 22);
  for (let x = 0; x < W; x += 96) { g.fillStyle = '#7c7a74'; g.fillRect(x, 0, 1.5, 22); }
  noise(g, W, H, 0.08, rng, 2500);
  return tex(c, { aniso: 8 });
}

// ---------- asphalt for cross streets ----------
export function asphaltTexture() {
  const W = 256, c = canvas(W, W), g = c.getContext('2d');
  const rng = mulberry(11);
  g.fillStyle = '#3b3d42';
  g.fillRect(0, 0, W, W);
  noise(g, W, W, 0.18, rng, 4000);
  return tex(c, { aniso: 4 });
}

export function concreteTexture() {
  const W = 256, c = canvas(W, W), g = c.getContext('2d');
  const rng = mulberry(13);
  g.fillStyle = '#a9a59d';
  g.fillRect(0, 0, W, W);
  noise(g, W, W, 0.12, rng, 3000);
  g.strokeStyle = 'rgba(60,60,60,0.35)'; g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, W - 2);
  return tex(c);
}

export function grassTexture() {
  const W = 256, c = canvas(W, W), g = c.getContext('2d');
  const rng = mulberry(17);
  g.fillStyle = '#5d8a3a';
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `hsl(${85 + rng() * 30},${40 + rng() * 25}%,${28 + rng() * 22}%)`;
    g.fillRect(rng() * W, rng() * W, 2, 3 + rng() * 4);
  }
  return tex(c);
}

// ---------- upper-facade tiles: one bay × one floor, repeats across a building ----------
// style: { brick:'#b54b3a', mortar, window:'flat'|'arch'|'tall', trim }
export const FACADE_STYLES = [
  { brick: '#a8453a', mortar: '#c9a28f', window: 'flat', trim: '#f1e8d8' },
  { brick: '#8f3b30', mortar: '#b08f7d', window: 'arch', trim: '#e9dcc7' },
  { brick: '#c1604a', mortar: '#d6b49f', window: 'flat', trim: '#fbf4e6' },
  { brick: '#7a3a2f', mortar: '#9d7d6d', window: 'tall', trim: '#d9c8b0' },
  { brick: '#d9cdb8', mortar: '#c5b8a4', window: 'flat', trim: '#ffffff', painted: true },
  { brick: '#b8b0a6', mortar: '#a39a8f', window: 'arch', trim: '#f5f5f5', painted: true },
  { brick: '#9b5a44', mortar: '#c29d86', window: 'tall', trim: '#ecdcc4' },
  { brick: '#6f4a3f', mortar: '#8c6f61', window: 'flat', trim: '#e6d6c0' },
  { brick: '#e7e1d3', mortar: '#cfc6b6', window: 'tall', trim: '#2f5d50', painted: true },
  { brick: '#b24a3c', mortar: '#caa28b', window: 'arch', trim: '#fff8ea' },
];

function drawBricks(g, W, H, style, rng, scale = 1) {
  g.fillStyle = style.mortar;
  g.fillRect(0, 0, W, H);
  const bw = 26 * scale, bh = 11 * scale;
  const base = new THREE.Color(style.brick);
  for (let row = 0, y = 0; y < H; row++, y += bh) {
    const off = (row % 2) * (bw / 2);
    for (let x = -bw; x < W + bw; x += bw) {
      const v = style.painted ? 0.97 + rng() * 0.06 : 0.85 + rng() * 0.3;
      g.fillStyle = `rgb(${base.r * 255 * v | 0},${base.g * 255 * v | 0},${base.b * 255 * v | 0})`;
      g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
    }
  }
}

function drawGlass(g, x, y, w, h, rng, lit) {
  const grad = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  if (lit) {
    grad.addColorStop(0, '#f6d9a0'); grad.addColorStop(0.5, '#e8b86a'); grad.addColorStop(1, '#a87f3e');
  } else {
    grad.addColorStop(0, '#b8d2e4'); grad.addColorStop(0.45, '#56738a'); grad.addColorStop(1, '#1f2f3d');
  }
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // reflection streak
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.moveTo(x + w * 0.1, y + h); g.lineTo(x + w * 0.35, y); g.lineTo(x + w * 0.55, y); g.lineTo(x + w * 0.3, y + h); g.fill();
  if (rng() < 0.3) { // curtain / blind hint
    g.fillStyle = 'rgba(240,235,225,0.55)';
    g.fillRect(x, y, w, h * (0.25 + rng() * 0.3));
  }
}

export function facadeTexture(styleIndex, seed) {
  const style = FACADE_STYLES[styleIndex % FACADE_STYLES.length];
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const rng = mulberry(seed);
  drawBricks(g, W, H, style, rng, 0.5);
  // window
  const ww = style.window === 'tall' ? 92 : 84, wh = style.window === 'tall' ? 156 : 126;
  const x = (W - ww) / 2, y = style.window === 'tall' ? 48 : 64;
  // lintel / sill
  g.fillStyle = style.trim;
  if (style.window === 'arch') {
    g.beginPath(); g.arc(x + ww / 2, y + 4, ww / 2 + 8, Math.PI, 0); g.fill();
    g.fillRect(x - 8, y + 4, ww + 16, 8);
  } else {
    g.fillRect(x - 10, y - 12, ww + 20, 12);
  }
  g.fillRect(x - 10, y + wh, ww + 20, 8);
  // frame
  g.fillStyle = '#2b2b2b';
  g.fillRect(x - 3, y - 3, ww + 6, wh + 6);
  if (style.window === 'arch') { g.beginPath(); g.arc(x + ww / 2, y + 4, ww / 2 + 2, Math.PI, 0); g.fill(); }
  const lit = rng() < 0.35;
  drawGlass(g, x, y, ww, wh, rng, lit);
  if (style.window === 'arch') {
    g.fillStyle = lit ? '#e8b86a' : '#7b98ad';
    g.beginPath(); g.arc(x + ww / 2, y + 4, ww / 2 - 1, Math.PI, 0); g.fill();
  }
  // muntins
  g.fillStyle = '#f4f0e8';
  g.fillRect(x + ww / 2 - 1.5, y, 3, wh);
  g.fillRect(x, y + wh / 2 - 1.5, ww, 3);
  noise(g, W, H, 0.06, rng, 600);
  return tex(c, { aniso: 8 });
}

// ---------- storefront strip (ground floor) per business ----------
// spec: { name, awning:'#hex'|null, stripes:bool, kind:'cafe'|'shop'|'bar'|'bank' }
const SIGN_FONTS = [
  '900 42px "Arial Black", Impact, sans-serif',
  'italic 700 44px Georgia, "Times New Roman", serif',
  '700 40px "Helvetica Neue", Arial, sans-serif',
  '800 44px "Trebuchet MS", Arial, sans-serif',
  '700 46px Georgia, serif',
];

export function storefrontTexture(spec, seed) {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const rng = mulberry(seed);
  // wall (painted wood / stone base)
  g.fillStyle = spec.wall || ['#3b3f45', '#2f4a3e', '#5b2d2a', '#e9e3d5', '#1e2a33', '#7a5a3a', '#f3efe6', '#403636'][(seed >> 2) % 8];
  g.fillRect(0, 0, W, H);
  // sign band
  const bandH = 58;
  g.fillStyle = spec.signBg || '#1b1b1b';
  g.fillRect(0, 0, W, bandH);
  g.fillStyle = spec.signFg || '#f6e7c1';
  g.font = spec.font || SIGN_FONTS[seed % SIGN_FONTS.length];
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let name = spec.name.toUpperCase();
  let size = 42;
  while (g.measureText(name).width > W - 40 && size > 18) {
    size -= 2; g.font = g.font.replace(/\d+px/, `${size}px`);
  }
  g.fillText(name, W / 2, bandH / 2 + 2);
  // thin trim line under the sign
  g.fillStyle = spec.trim || '#c7a96b';
  g.fillRect(0, bandH, W, 4);
  // display windows + door
  const doorW = 70, doorX = spec.doorRight ? W - 90 : 20;
  const winY = bandH + 22, winH = H - winY - 30;
  const panes = [];
  if (spec.doorRight) panes.push([20, doorX - 16]); else panes.push([doorX + doorW + 16, W - 20]);
  for (const [x0, x1] of panes) {
    const n = Math.max(1, Math.round((x1 - x0) / 140));
    const pw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * pw + 4;
      g.fillStyle = '#1d1d1d';
      g.fillRect(x - 4, winY - 4, pw, winH + 8);
      drawGlass(g, x, winY, pw - 8, winH, rng, false);
      // interior hints: shelves / tables / bottles
      g.fillStyle = 'rgba(255,225,170,0.35)';
      g.fillRect(x + 8, winY + winH * 0.55, pw - 24, 5);
      for (let k = 0; k < 5; k++) {
        g.fillStyle = `hsla(${rng() * 360},60%,55%,0.6)`;
        g.fillRect(x + 12 + k * (pw - 30) / 5, winY + winH * 0.55 - 14 - rng() * 10, 9, 14 + rng() * 10);
      }
      if (spec.kind === 'cafe') {
        g.fillStyle = 'rgba(250,245,235,0.75)';
        g.font = '600 16px Georgia, serif';
        g.fillText('OPEN', x + (pw - 8) / 2, winY + 18);
      }
    }
  }
  // door
  g.fillStyle = '#1d1d1d';
  g.fillRect(doorX - 4, winY - 4, doorW + 8, H - winY + 4);
  g.fillStyle = spec.door || '#2e4f3c';
  g.fillRect(doorX, winY, doorW, H - winY);
  drawGlass(g, doorX + 10, winY + 10, doorW - 20, (H - winY) * 0.55, rng, false);
  g.fillStyle = '#d9c27a';
  g.fillRect(doorX + doorW - 16, winY + (H - winY) * 0.62, 6, 16); // handle
  // kick plate / granite base
  g.fillStyle = '#6d6a64';
  g.fillRect(0, H - 14, W, 14);
  // street number
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '700 14px Arial';
  g.fillText(String(spec.number || ''), doorX + doorW / 2, winY - 12);
  return tex(c, { aniso: 8, wrap: false });
}

export function awningTexture(color, stripes, seed) {
  const W = 256, H = 64, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  if (stripes) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 16, H);
  }
  // scalloped valance shadow
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(0, H - 10, W, 10);
  return tex(c, { aniso: 4 });
}

// ---------- character palette: 64×64 atlas ----------
// Layout (u,v in pixels): 8 palette slots in the top row (8px each, 8px tall),
// face patch 32×32 at (0,16), shirt pattern patch 32×32 at (32,16).
export const ATLAS = {
  slot: (i) => [(i * 8 + 4) / 64, 1 - 4 / 64],          // centre of palette swatch i
  face: [0, 16, 32, 32],                                 // px rect
  shirt: [32, 16, 32, 32],
};
export function characterAtlas(look) {
  const c = canvas(64, 64), g = c.getContext('2d');
  const slots = [look.skin, look.hair, look.shirt, look.pants, look.shoes, look.accent, look.hat || look.hair, look.hands || look.skin];
  slots.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 8, 0, 8, 8); });
  // shirt patch: plain, plaid, tie-dye, stripes, hoodie logo
  const [sx, sy, sw, sh] = ATLAS.shirt;
  g.fillStyle = look.shirt; g.fillRect(sx, sy, sw, sh);
  if (look.pattern === 'plaid') {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 4; i++) { g.fillRect(sx + i * 8 + 5, sy, 3, sh); g.fillRect(sx, sy + i * 8 + 5, sw, 3); }
    g.fillStyle = 'rgba(255,230,120,0.5)';
    for (let i = 0; i < 4; i++) { g.fillRect(sx + i * 8 + 1, sy, 1.5, sh); g.fillRect(sx, sy + i * 8 + 1, sw, 1.5); }
  } else if (look.pattern === 'tiedye') {
    for (let i = 0; i < 7; i++) {
      const grad = g.createRadialGradient(sx + 16, sy + 16, i * 2.5, sx + 16, sy + 16, i * 2.5 + 3);
      grad.addColorStop(0, `hsl(${i * 52},85%,55%)`); grad.addColorStop(1, `hsl(${i * 52 + 26},85%,60%)`);
      g.fillStyle = grad; g.beginPath(); g.arc(sx + 16, sy + 16, 24 - i * 3, 0, Math.PI * 2); g.fill();
    }
  } else if (look.pattern === 'stripes') {
    g.fillStyle = look.accent;
    for (let i = 0; i < 4; i++) g.fillRect(sx, sy + i * 8 + 2, sw, 4);
  } else if (look.pattern === 'logo') {
    g.fillStyle = look.accent; g.font = '900 9px "Arial Black", Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(look.logo || 'VT', sx + 16, sy + 17);
  } else if (look.pattern === 'jersey') {
    g.fillStyle = look.accent; g.fillRect(sx, sy, sw, 5);
    g.font = '900 14px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(look.logo || '7', sx + 16, sy + 19);
  }
  // face patch
  const [fx, fy, fw, fh] = ATLAS.face;
  g.fillStyle = look.skin; g.fillRect(fx, fy, fw, fh);
  g.fillStyle = '#1b1b1b';
  g.fillRect(fx + 9, fy + 13, 3, 4); g.fillRect(fx + 20, fy + 13, 3, 4); // eyes
  if (look.glasses) { g.strokeStyle = '#222'; g.lineWidth = 1.2; g.strokeRect(fx + 6.5, fy + 11.5, 8, 6); g.strokeRect(fx + 17.5, fy + 11.5, 8, 6); }
  g.strokeStyle = '#6b3a2a'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(fx + 16, fy + 19, 4, 0.2, Math.PI - 0.2); g.stroke(); // smile
  if (look.beard) { g.fillStyle = look.hair; g.fillRect(fx + 8, fy + 22, 16, 7); g.fillRect(fx + 6, fy + 14, 3, 9); g.fillRect(fx + 23, fy + 14, 3, 9); }
  const t = tex(c, { wrap: false, aniso: 1 });
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

// ---------- misc decals ----------
export function clockTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#f7f2e6'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 4; g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    g.fillStyle = '#222'; g.fillRect(0, 0, 0, 0);
    g.beginPath(); g.arc(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50, 3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#222'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 26, 64 - 20); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 10, 64 - 42); g.stroke();
  return tex(c, { wrap: false });
}

export function textPlateTexture(text, { bg = '#f1e9d6', fg = '#2b2b2b', w = 512, h = 96, font = '700 44px Georgia, serif' } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  return tex(c, { wrap: false });
}

export function bannerTexture(seed) {
  const c = canvas(64, 128), g = c.getContext('2d');
  const hues = [[350, '#fff'], [28, '#3b2a1a'], [140, '#fff'], [205, '#fff'], [48, '#5a2d0c']];
  const [h, fg] = hues[seed % hues.length];
  g.fillStyle = `hsl(${h},70%,45%)`; g.fillRect(0, 0, 64, 128);
  // maple leaf-ish mark
  g.fillStyle = fg;
  g.beginPath(); g.moveTo(32, 22); g.lineTo(40, 40); g.lineTo(54, 38); g.lineTo(44, 52); g.lineTo(52, 66); g.lineTo(36, 60);
  g.lineTo(32, 78); g.lineTo(28, 60); g.lineTo(12, 66); g.lineTo(20, 52); g.lineTo(10, 38); g.lineTo(24, 40); g.closePath(); g.fill();
  g.fillRect(31, 76, 2, 14);
  g.font = '800 11px Arial'; g.textAlign = 'center'; g.fillText('CHURCH ST', 32, 108);
  return tex(c, { wrap: false });
}

export function cowTexture(seed) {
  const c = canvas(128, 64), g = c.getContext('2d');
  const rng = mulberry(seed);
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = seed % 2 ? '#1c1c1c' : `hsl(${rng() * 360},70%,55%)`;
    g.beginPath(); g.ellipse(rng() * 128, rng() * 64, 8 + rng() * 12, 6 + rng() * 10, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { wrap: false });
}

export function pintTexture() {
  const c = canvas(128, 64), g = c.getContext('2d');
  g.fillStyle = '#f6f1e3'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#8ec5e8'; g.fillRect(0, 0, 128, 22);
  g.fillStyle = '#3a2b22'; g.font = '900 14px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CHURCH ST', 64, 11);
  g.font = '800 12px Arial'; g.fillStyle = '#c94f3f'; g.fillText('MAPLE WALNUT', 64, 38);
  g.fillStyle = '#6b8f3e'; g.fillText('PINT', 64, 54);
  return tex(c, { wrap: false });
}

export function jugTexture() {
  const c = canvas(128, 64), g = c.getContext('2d');
  g.fillStyle = '#c77a2a'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#f4e3c0'; g.fillRect(26, 14, 76, 36);
  g.fillStyle = '#7a2b14'; g.font = '900 14px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PURE VT', 64, 27); g.font = '700 11px Georgia, serif'; g.fillText('MAPLE SYRUP', 64, 43);
  return tex(c, { wrap: false });
}

export function cheeseTexture() {
  const c = canvas(128, 64), g = c.getContext('2d');
  g.fillStyle = '#e9b93b'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#d89f2a'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * 128, Math.random() * 64, 3, 3);
  g.fillStyle = '#1b1b1b'; g.font = '900 16px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SHARP', 64, 24); g.font = '700 12px Arial'; g.fillText('VT CHEDDAR', 64, 44);
  return tex(c, { wrap: false });
}

export function coneTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#d9a35a'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#a8702e'; g.lineWidth = 2;
  for (let i = -64; i < 128; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  return tex(c);
}

export function skyTexture() {
  const c = canvas(16, 256), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2d63b8');
  grad.addColorStop(0.45, '#6fa3e0');
  grad.addColorStop(0.8, '#cfe3f3');
  grad.addColorStop(1, '#f3e6d2');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
  const t = tex(c, { wrap: false, aniso: 1 });
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function cloudTexture() {
  const c = canvas(128, 64), g = c.getContext('2d');
  const rng = mulberry(99);
  for (let i = 0; i < 14; i++) {
    const x = 20 + rng() * 88, y = 26 + rng() * 18, r = 10 + rng() * 14;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { wrap: false });
}

export function leafTexture() {
  const c = canvas(32, 32), g = c.getContext('2d');
  g.fillStyle = '#d8742a';
  g.beginPath(); g.moveTo(16, 2); g.lineTo(24, 12); g.lineTo(30, 10); g.lineTo(26, 19); g.lineTo(29, 27); g.lineTo(19, 24); g.lineTo(16, 31); g.lineTo(13, 24); g.lineTo(3, 27); g.lineTo(6, 19); g.lineTo(2, 10); g.lineTo(8, 12); g.closePath(); g.fill();
  return tex(c, { wrap: false });
}

// plain brick tile (no windows) for building sides and the upper body
export function brickTexture(styleIndex, seed = 1) {
  const style = FACADE_STYLES[styleIndex % FACADE_STYLES.length];
  const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
  drawBricks(g, W, H, style, mulberry(seed + 31), 0.75);
  return tex(c, { aniso: 4 });
}

// generic side-street storefront (no business name)
export function plainStorefrontTexture(seed) {
  return storefrontTexture({ name: '', kind: 'plain', number: '' }, seed);
}

export function crosswalkTexture() {
  const c = canvas(64, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(245,245,235,0.9)';
  for (let y = 8; y < 256; y += 32) g.fillRect(4, y, 56, 18);
  const t = tex(c, { wrap: false });
  return t;
}
