// Headless sanity + physics-contract test. No framework, no browser.
// Runs the DOM-free parts of the game — the character rig math and the cannon
// ragdoll — in Node, and statically checks the roster and item balance.
// A canvas/document shim lets textures.js import without a real DOM (we never
// call the texture builders here; we only import the pure modules).
import { PARTS, REST, PART_INDEX } from '../js/characters.js';
import { ITEMS } from '../js/items.js';
import { ROSTER, STREET, YELPS } from '../js/roster.js';
import { PROP_DEFS, YEETABLE_KINDS } from '../js/props.js';
import * as CANNON from '../vendor/cannon-es.js';
import { Physics } from '../js/physics.js';

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.error('  ✗ ' + msg); } }
function section(t) { console.log('\n' + t); }

// ---------- rig skeleton is well-formed ----------
section('Character rig');
ok(PARTS.length === 11, 'rig has 11 parts');
for (const p of PARTS) {
  if (!p.p) continue;
  ok(PART_INDEX[p.p] !== undefined && PART_INDEX[p.p] < PART_INDEX[p.n], `${p.n} parent ${p.p} comes before it (constraint ordering)`);
}
ok(REST.joint.head[1] > REST.joint.hips[1], 'head sits above hips in rest pose');
ok(Math.abs(REST.centre.hips[0]) < 1e-9, 'hips centred on x');

// ---------- items balance ----------
section('Item balance');
ok(ITEMS.length === 5, 'five throwables');
const ids = new Set(ITEMS.map((i) => i.id));
ok(ids.size === 5, 'item ids unique');
for (const it of ITEMS) {
  ok(it.mass > 0 && it.r > 0 && it.speed > 0, `${it.id} has positive mass/radius/speed`);
  ok(it.knock >= 0.5 && it.knock <= 2, `${it.id} knock in sane range`);
  ok(it.emoji && it.name && it.tip, `${it.id} has emoji/name/tip`);
  if (it.shape === 'cyl') ok(it.h > 0, `${it.id} cylinder has height`);
}
// heavier items should hit harder but fly slower (design invariant)
const byMass = [...ITEMS].sort((a, b) => a.mass - b.mass);
ok(byMass[0].speed >= byMass[byMass.length - 1].speed, 'lightest item is the fastest');

// ---------- roster integrity ----------
section('Church Street roster');
ok(ROSTER.length === 4, 'four blocks Pearl→Main');
let named = 0; const seenNum = new Map();
for (const blk of ROSTER) {
  for (const side of ['east', 'west']) for (const s of blk[side]) {
    if (s.name) named++;
    if (s.number && !s.landmark) {
      const key = side + ':' + s.number;
      ok(!seenNum.has(key), `no duplicate ${side} #${s.number} (${s.name})`);
      seenNum.set(key, s.name);
      // even = east, odd = west, per the real marketplace
      if (side === 'east') ok(s.number % 2 === 0, `east #${s.number} (${s.name}) is even`);
      if (side === 'west') ok(s.number % 2 === 1, `west #${s.number} (${s.name}) is odd`);
    }
  }
}
ok(named >= 60, `at least 60 named storefronts (have ${named})`);
ok(STREET.blocks.length === 4 && STREET.crosses.length === 5, 'geometry has 4 blocks / 5 cross streets');
for (const t of ['leafPeeper', 'uvmStudent', 'flannelGuy', 'creemeeKid']) ok(YELPS[t] && YELPS[t].length, `${t} has yelps`);

// ---------- physics: a ragdoll thrown onto the bricks comes to rest ----------
section('Ragdoll settles (real cannon-es, 6 s)');
const phys = new Physics();
phys.addStatics([]); // ground plane only
phys.initRagdolls();
// build rest-pose part transforms scaled to 1, lifted to standing height
const q = new CANNON.Quaternion();
const parts = PARTS.map((p) => ({ pos: { x: REST.centre[p.n][0], y: REST.centre[p.n][1], z: REST.centre[p.n][2] }, quat: { x: 0, y: 0, z: 0, w: 1 } }));
const r = phys.activateRagdoll(parts, 1, { x: 6, y: 4, z: 2 }, { x: 0, y: 1.3, z: 0 }, PART_INDEX.torso);
let t = 0; const dtF = 1 / 60;
let maxY = 0, belowGround = 0;
while (t < 6) { phys.step(dtF, 1); t += dtF; const y = r.bodies[0].position.y; if (y > maxY) maxY = y; if (y < -0.6) belowGround++; }
const speed = r.bodies[0].velocity.length();
const asleepOrSlow = speed < 0.6;
ok(maxY > 1.0, `ragdoll got airborne (peak hips y=${maxY.toFixed(2)})`);
ok(belowGround === 0, 'ragdoll never fell through the ground plane');
ok(asleepOrSlow, `ragdoll came to rest within 6 s (final hips speed ${speed.toFixed(2)} m/s)`);
ok(r.travel > 1.5, `ragdoll travelled from the hit point (${r.travel.toFixed(1)} m)`);

// ---------- physics: a projectile flies and lands ----------
section('Projectile flight');
phys.initProjectiles();
const cheddar = ITEMS.find((i) => i.id === 'cheddar');
const proj = phys.launch(cheddar, { x: 0, y: 1.3, z: 0 }, { x: 0, y: 6, z: 22 }, { x: -140, y: 0, z: 0 });
let landed = false, pt = 0;
while (pt < 4) { phys.step(dtF, 1); pt += dtF; if (proj.body.position.y < 0.4 && proj.body.velocity.y <= 0.1 && pt > 0.3) { landed = true; break; } }
ok(proj.body.position.z > 4, `cheddar travelled downrange (z=${proj.body.position.z.toFixed(1)})`);
ok(landed, 'cheddar wheel landed on the bricks');

// ---------- props: defs are well-formed + a launched prop settles ----------
section('Yeetable props');
ok(YEETABLE_KINDS.length >= 6, `at least 6 prop kinds (have ${YEETABLE_KINDS.length})`);
for (const k of YEETABLE_KINDS) {
  const d = PROP_DEFS[k];
  ok(d.mass > 0 && d.label && d.shapes && d.shapes.length, `${k} has mass/label/shapes`);
  for (const sh of d.shapes) ok(['box', 'cyl', 'sph'].includes(sh.t) && Array.isArray(sh.a) && Array.isArray(sh.o), `${k} shape well-formed`);
}
phys.addProps([{ kind: 'bench', x: 0, z: 0, ry: 0 }], PROP_DEFS);
const pb = phys.props[0].body; pb.wakeUp(); pb.velocity.set(8, 5, 3);
let settled = false, pt2 = 0;
while (pt2 < 6) { phys.step(1 / 60, 1); pt2 += 1 / 60; if (pb.velocity.length() < 0.5 && pt2 > 1) { settled = true; break; } }
ok(pb.position.y > -0.5, 'launched bench did not fall through the floor');
ok(settled, `launched bench came to rest (final speed ${pb.velocity.length().toFixed(2)})`);

console.log(`\n${fails === 0 ? '✓ PASS' : '✗ FAIL'} — ${checks - fails}/${checks} checks`);
process.exit(fails === 0 ? 0 : 1);
