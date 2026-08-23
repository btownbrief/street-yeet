# STREET YEET — agent instructions

Shared brain for any AI agent (Codex, Claude Code) working in this repo. Read
`README.md` first for the game and file map — this adds the rules. Stephen is
non-technical; explain consequential changes in plain language.

## What this is

Btown's 3D ragdoll-yeeting game on a recreated Church Street Marketplace. Plain
static site, **no build step, no npm**: `index.html` + `style.css` + ES modules
in `js/`, three.js (r160) + cannon-es vendored as single files in `vendor/`.
Deployed by GitHub Pages on push to `main`.

## Hard rules

- **Keep simulation and rendering separate.** `physics.js` (cannon-es) and the
  parts of `characters.js` that do rig math are DOM-free so `scripts/test-scene.mjs`
  runs the real physics headless. Never import three's renderer into them, and
  never put game rules in `world.js`/`render` paths.
- **cannon gotcha:** never remove a body inside a `collide` callback — it
  corrupts the step. `physics.js` queues removals and flushes between steps.
  Keep it that way. Projectiles and ragdolls are **pooled**; don't allocate
  bodies per throw.
- **Performance is a feature.** Low-poly, merge static geometry per material,
  cap pixel ratio, sleep idle bodies, keep the FPS governor in `main.js`. If a
  change costs frame rate on a mid-range phone, cut it.
- **`js/roster.js` is close to fact.** Storefront names/numbers come from the
  real Church Street Marketplace directory; even numbers are the east side, odd
  the west. Don't invent businesses or move landmarks casually — the test
  enforces the even/odd sides and no duplicates. Art is stylized, never a claim
  of exact likeness.
- **Balance lives in `js/items.js`** (the five throwables) and the scoring
  constants in `main.js`. Tune there, not scattered in code.
- No new dependencies, no build step, no analytics, no accounts. The shared
  Supabase leaderboard (`js/leaderboard.js`, slug `street-yeet`, copied from the
  fleet — don't fork its behavior) is the only server feature.
- All names, characters and art are original to Btown. Nobody is depicted
  getting hurt — they ragdoll and get up dazed. Keep it good-natured.

## Before you finish

Run `node scripts/test-scene.mjs` (rig, item balance, roster invariants, and a
real headless physics check). If you touched physics, aiming, the camera or the
world, also open it in a browser at a phone-sized viewport and say what you
verified. The camera uses pointer lock on desktop with a cursor-in-window
fallback; the game must stay fully playable on touch (left thumb move, right
thumb look, YEET button).
