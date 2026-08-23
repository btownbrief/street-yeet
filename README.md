# STREET YEET 🍦🧀🍁

It's leaf-peeper season and **Church Street Marketplace** is a parking lot. Clear
a path the Vermont way — sling **creemees, syrup jugs, and a wheel of cheddar** at
the crowd. Nobody gets hurt. They just get *yeeted*. A true-3D, ragdoll-physics,
third-person Btown Games production set on a hand-built recreation of Burlington's
famous pedestrian street.

**Play it live:** https://play.btownbrief.com/street-yeet/

## The game

- **Third-person**, 90-second rounds. Move with WASD (or an on-screen stick on
  phones), aim with the mouse/right thumb, **hold to charge** a throw and release
  to YEET.
- **Five throwables**, each with real physics: the fast light **maple creemee**
  (splats), the **bouncy pint** (ricochets), the heavy **syrup jug** (big
  knockback), the **cheddar wheel** (rolls down the bricks like a bowling ball),
  and the **pumpkin** (heavy splatter).
- **Ragdolls.** Everyone you hit is a full cone-twist ragdoll. Long yeets, air
  time, and **noggins** (headshots) all pay extra.
- **Combos & DOMINOES.** Chain hits before the meter runs out for a multiplier;
  send one flying person crashing into another for a DOMINO. Big combos trigger
  a slow-mo beat.
- **Burlington cast.** Leaf peepers with cameras, UVM students, a Phish fan, a
  flannel guy, creemee kids, a busker, a hockey dad, mittens guy — each yelps
  something very Vermont on the way down.
- **Landmarks & secrets.** The Unitarian church at the head of the street (ring
  the **bell** in the steeple for a bonus), City Hall with the Stout bronze deer
  and bear, the BCA firehouse, Big Joe Burrell with his sax, the Leapfroggers,
  and the painted **cows** by Ben & Jerry's — tip one for HOLY COW.
- Your **best round score** goes to the shared Btown monthly leaderboard.

## Church Street, for real

The four blocks from Pearl to Main are laid out with the marketplace's actual
storefronts and street numbers (even = east side, odd = west), from Kru Coffee
and E.B. Strong's at the top down past Ben & Jerry's, Outdoor Gear Exchange,
Leunig's, Red Square and Honey Road — pulled from the Church Street Marketplace
directory (Aug 2026). Brick pavers, iron tree guards, the black lamp posts with
banners, café rope-lines, vendor carts and the autumn maples are all there.
Stylized, not a survey — a love letter.

## How it works

Plain static site — no build step, no npm. `index.html` + `style.css` + ES
modules in `js/`, three.js (r160) and cannon-es vendored as single files.

| file | what it does |
| --- | --- |
| `js/roster.js` | Church Street as data: every storefront, number, awning, landmark, plus the NPC yelps. **A legal/geographic constraint — keep it accurate.** |
| `js/world.js` | builds the 3D street from boxes + canvas textures; emits static colliders + NPC obstacle circles. Rendering only. |
| `js/textures.js` | every texture is drawn on a canvas at boot (bricks, storefront signs, awnings, cows, syrup labels). No image downloads. |
| `js/characters.js` | the shared skinned character rig (one draw call each): a joint hierarchy poses the walk/throw; the same bones can be driven by ragdoll bodies. |
| `js/physics.js` | cannon-es world: static colliders, the player body, **pooled** projectiles and ragdolls (cone-twist joints), tippable cows, the bell trigger. DOM-free. |
| `js/npcs.js` | crowd AI (wander/avoid/get-yeeted/stand-up dazed) + pigeon flocks. Reports hits; doesn't score. |
| `js/items.js` | the five throwables and their physics/scoring numbers. **Tune balance here.** |
| `js/player.js` | movement, the collision-aware third-person camera, aim ray, charge-and-throw. |
| `js/input.js` | keyboard/mouse (pointer lock) + touch stick/look/buttons. |
| `js/fx.js` | splat particles, floating score text, screen shake. |
| `js/audio.js` | procedural WebAudio sfx, no files. |
| `js/main.js` | boot, screens, cutscene, the round loop, scoring, HUD, leaderboard, the FPS quality governor. |
| `js/leaderboard.js` | shared Btown monthly Supabase board, slug `street-yeet`. |
| `vendor/` | three.js + cannon-es, vendored single ES-module files. |

Performance is a hard requirement on mid-range laptops and phones: geometry is
low-poly and merged per material, projectiles/ragdolls are pooled and go to
sleep, distant work is culled, and `main.js` auto-drops pixel ratio and shadows
when the frame rate sags.

Every push to `main` deploys to GitHub Pages.

## Checking it

```bash
node scripts/test-scene.mjs
```

No framework. Validates the rig skeleton, item balance, and the Church Street
roster (even/odd street-number sides, no duplicates, ≥60 named shops), then runs
the **real cannon-es physics headless**: a thrown ragdoll must get airborne,
never fall through the ground, and come to rest within 6 seconds; a thrown
cheddar wheel must fly downrange and land.

## Regenerating the social/app image

`og-image.png` is a live WebGL screenshot of the real scene (the cutscene
establishing shot, no UI) via `index.html?og=1` and `tools/og.html`. Needs
`chrome --headless=new` (old headless has no WebGL).
