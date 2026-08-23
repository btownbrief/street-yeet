// Keyboard + mouse (pointer lock) on desktop, floating stick + look-drag +
// YEET button on touch. Exposes a tiny per-frame snapshot; no game logic.
export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDX = 0; this.lookDY = 0;
    this.stick = { x: 0, y: 0 };          // -1..1 (x right, y forward)
    this.throwHeld = false;               // mouse button / YEET button down
    this.jumpQueued = false;
    this.switchDelta = 0;                 // +1/-1 item cycle requests
    this.selectIndex = -1;                // direct 1-5 selection
    this.skateToggle = false;             // F / 🛹 button — hop on/off the board
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.locked = false;
    this.enabled = false;
    this.onAnyKey = null;
    this.wantsLock = false;
    this.sprintTouch = false;
    this.touches = { stick: null, look: null };
    this.stickOrigin = { x: 0, y: 0 };
    this.ui = ui; // { stickBase, stickKnob, zone }
    this.bind();
  }

  bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (e.code === 'KeyQ') this.switchDelta -= 1;
      if (e.code === 'KeyE') this.switchDelta += 1;
      if (/^Digit[1-5]$/.test(e.code)) this.selectIndex = Number(e.code[5]) - 1;
      if (e.code === 'KeyF') this.skateToggle = true;
      if (this.onAnyKey) this.onAnyKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.throwHeld = false; });
    // mouse
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (!this.locked && !this.lockFailed) { this.requestLock(); return; }
      if (e.button === 0) this.throwHeld = true;
      if (e.button === 2) this.jumpQueued = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.throwHeld = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      // movementX/Y work without pointer lock too (until the cursor leaves the
      // window) — that is the fallback when lock is refused (iframes, headless).
      if (!this.enabled || this.isTouch) return;
      if (!this.locked && !this.lockFailed) return;
      this.lookDX += e.movementX; this.lookDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => { if (this.enabled) this.switchDelta += e.deltaY > 0 ? 1 : -1; }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      if (this.locked) this.lockedOnce = true;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; this.lockFailed = true; if (this.onLockFailed) this.onLockFailed(); });

    // touch: left 45% = floating stick, right = look; buttons are DOM elements
    const zone = this.ui.zone;
    const onStart = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const side = t.clientX < innerWidth * 0.45 ? 'stick' : 'look';
        if (this.touches[side] !== null) continue;
        this.touches[side] = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY };
        if (side === 'stick') {
          this.stickOrigin = { x: t.clientX, y: t.clientY };
          this.ui.stickBase.style.display = 'block';
          this.ui.stickBase.style.left = t.clientX + 'px'; this.ui.stickBase.style.top = t.clientY + 'px';
          this.ui.stickKnob.style.transform = 'translate(-50%,-50%)';
        }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        for (const side of ['stick', 'look']) {
          const s = this.touches[side];
          if (!s || s.id !== t.identifier) continue;
          if (side === 'stick') {
            const R = 52;
            let dx = t.clientX - s.sx, dy = t.clientY - s.sy;
            const d = Math.hypot(dx, dy);
            if (d > R) { dx *= R / d; dy *= R / d; }
            this.stick.x = dx / R; this.stick.y = -dy / R;
            this.sprintTouch = d > R * 0.92;
            this.ui.stickKnob.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
          } else {
            this.lookDX += (t.clientX - s.x) * 2.2; this.lookDY += (t.clientY - s.y) * 2.2;
            s.x = t.clientX; s.y = t.clientY;
          }
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        for (const side of ['stick', 'look']) {
          const s = this.touches[side];
          if (s && s.id === t.identifier) {
            this.touches[side] = null;
            if (side === 'stick') { this.stick.x = 0; this.stick.y = 0; this.sprintTouch = false; this.ui.stickBase.style.display = 'none'; }
          }
        }
      }
    };
    zone.addEventListener('touchstart', onStart, { passive: false });
    zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onEnd); zone.addEventListener('touchcancel', onEnd);
    // buttons
    const hold = (el, down, up) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); up(); }, { passive: false });
      el.addEventListener('touchcancel', up);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); down(); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); up(); });
    };
    hold(this.ui.yeetBtn, () => { this.throwHeld = true; }, () => { this.throwHeld = false; });
    hold(this.ui.jumpBtn, () => { this.jumpQueued = true; }, () => {});
    this.ui.itemBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.switchDelta += 1; }, { passive: false });
    this.ui.itemBtn.addEventListener('click', () => { if (!this.isTouch) this.switchDelta += 1; });
    if (this.ui.skateBtn) { const tap = (e) => { e.preventDefault(); e.stopPropagation(); this.skateToggle = true; }; this.ui.skateBtn.addEventListener('touchstart', tap, { passive: false }); this.ui.skateBtn.addEventListener('click', tap); }
  }

  requestLock() {
    if (this.isTouch || this.lockFailed) return;
    let p;
    try { p = this.canvas.requestPointerLock({ unadjustedMovement: true }); } catch { p = null; }
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        let q; try { q = this.canvas.requestPointerLock(); } catch { q = null; }
        if (q && typeof q.catch === 'function') q.catch(() => {});
      });
    }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // per-frame snapshot; consumes edge-triggered state
  poll() {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (this.stick.x || this.stick.y) { mx = this.stick.x; my = this.stick.y; }
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    const snap = {
      mx, my,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight') || this.sprintTouch,
      lookDX: this.lookDX, lookDY: this.lookDY,
      throwHeld: this.throwHeld,
      jump: this.jumpQueued,
      switchDelta: this.switchDelta,
      selectIndex: this.selectIndex,
      skateToggle: this.skateToggle,
    };
    this.lookDX = 0; this.lookDY = 0; this.jumpQueued = false; this.switchDelta = 0; this.selectIndex = -1; this.skateToggle = false;
    return snap;
  }
}
