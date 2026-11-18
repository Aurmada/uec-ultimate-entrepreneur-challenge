import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTERS, BASE_CHARACTERS, toCharacter } from '../src/data/fighters.js';
import { validateCharacter, SCHEMA_VERSION } from '../src/data/schema.js';

test('every shipped fighter converts to a current-schema character', () => {
  for (const def of FIGHTERS) {
    const ch = toCharacter(def);
    assert.equal(ch.schema, SCHEMA_VERSION, `${def.id} wrong schema version`);
    assert.equal(ch.id, def.id);
  }
});

test('every shipped fighter has a body, defaulting to neutral', () => {
  for (const def of [...FIGHTERS, ...BASE_CHARACTERS]) {
    const ch = toCharacter(def);
    for (const v of Object.values(ch.body)) {
      assert.ok(typeof v === 'number' && v > 0, `${def.id} has a bad body knob`);
    }
  }
});

test('ids are unique across roster and base characters', () => {
  const ids = [...FIGHTERS, ...BASE_CHARACTERS].map(f => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

// PHANTOM used to be the one blocked character, flagged when the budget
// formula was first written and left standing as a known debt. It was fixed by
// silhouette rather than by stats: "slight AND untouchable" is the compounding
// pattern the budget exists to catch, so giving Lizbeth an ordinary frame to
// hit is what pays for her speed. Nothing in STYLES changed.
test('every shipped fighter is inside the power budget', () => {
  const blocked = [];
  for (const def of FIGHTERS) {
    const r = validateCharacter(toCharacter(def));
    if (r.band === 'block') blocked.push(`${def.id} (${r.cost.toFixed(1)})`);
    else assert.equal(r.ok, true, `${def.id}: ${r.errors.join('; ')}`);
  }
  assert.deepEqual(blocked, [], 'no character may ship over budget');
});

// The silhouette test, as data. Two fighters that differ only in colour are
// two fighters the player cannot tell apart at 196px.
test('no two fighters share a silhouette', () => {
  const seen = new Map();
  for (const def of FIGHTERS) {
    const b = toCharacter(def).body;
    const key = ['height', 'build', 'reach', 'stride', 'shoulders', 'head']
      .map(k => b[k].toFixed(2)).join('/');
    assert.ok(!seen.has(key), `${def.id} and ${seen.get(key)} have identical proportions`);
    seen.set(key, def.id);
  }
});

test('every fighter differs from neutral — nobody ships as the default body', () => {
  for (const def of FIGHTERS) {
    const b = toCharacter(def).body;
    const off = Object.values(b).some(v => Math.abs(v - 1) > 0.02);
    assert.ok(off, `${def.id} still has the stock proportions`);
  }
});

// Characters authored in the Incubator. The tool refuses to export a blocked
// character, so anything in here must still validate — this catches a hand-edit
// after the fact, or a schema change that invalidates work already done.
test('every authored character still validates', async () => {
  let mod;
  try {
    mod = await import('../src/data/authored.js');
  } catch (e) {
    return;                       // nobody has exported yet; nothing to check
  }
  const list = mod.AUTHORED || [];
  assert.ok(Array.isArray(list), 'AUTHORED must be an array');
  for (const def of list) {
    const r = validateCharacter(toCharacter(def));
    assert.equal(r.ok, true, `${def.id}: ${r.errors.join('; ')}`);
    assert.notEqual(r.band, 'block', `${def.id} is over budget at ${r.cost.toFixed(1)}`);
  }
});

test('authored characters do not collide with the shipped roster', async () => {
  let mod;
  try { mod = await import('../src/data/authored.js'); } catch (e) { return; }
  const shipped = new Set(FIGHTERS.map(f => f.id));
  for (const def of (mod.AUTHORED || [])) {
    assert.equal(shipped.has(def.id), false, `${def.id} already exists in the roster`);
  }
});

// The v3.20 graphics review: Lizbeth and Cathie read as one pair across a
// fight, pale hair over a blue jacket each (Lizbeth's violet-blue, Cathie's
// navy). Two fighters with pale hair must not wear jackets of one colour
// family: hue in CIE LCh within HUE_NEAR degrees, both jackets coloured enough
// for hue to mean anything. Cathie has worn claret since v3.22.
test('no two pale-haired fighters wear jackets of one colour family', () => {
  const HUE_NEAR = 40, PALE = 75, CHROMATIC = 20;
  const lch = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const [X, Y, Z] = [
      (0.4124 * v[0] + 0.3576 * v[1] + 0.1805 * v[2]) / 0.95047,
      0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2],
      (0.0193 * v[0] + 0.1192 * v[1] + 0.9505 * v[2]) / 1.08883,
    ];
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const L = 116 * f(Y) - 16, a = 500 * (f(X) - f(Y)), b = 200 * (f(Y) - f(Z));
    return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
  };
  const pale = FIGHTERS.filter((d) => lch(d.c.hair).L > PALE);
  assert.ok(pale.some((d) => d.id === 'ava') && pale.some((d) => d.id === 'eleanor'), 'the pair the review named are no longer both pale-haired');
  for (const a of pale) for (const b of pale) {
    if (a.id >= b.id) continue;
    const ja = lch(a.c.suit), jb = lch(b.c.suit);
    if (ja.C < CHROMATIC || jb.C < CHROMATIC) continue;
    const apart = Math.min(Math.abs(ja.h - jb.h), 360 - Math.abs(ja.h - jb.h));
    assert.ok(apart >= HUE_NEAR, `${a.name} and ${b.name}: pale hair and jackets ${apart.toFixed(0)} degrees of hue apart`);
  }
});

// The owner, shown the nine side by side (2026-11-16): the height difference
// looked wrong, "bring the spread in". Cathie stood a third taller than Jeff.
// A fighter stands as tall as their legs (stride) and trunk (height) make
// them, the legs a little under half of it (the sculpts' hip is at 0.955 of
// 1.955), and the nine now stand within 16% of one another, in the ladder's
// order (fighters.js).
test('the cast stand within 16% of one another, in the same order as before', () => {
  const stand = (id) => { const b = FIGHTERS.find((f) => f.id === id).body; return 0.955 * b.stride + b.height; };
  const ladder = ['zara', 'dex', 'bozo', 'scam', 'ava', 'kai', 'max', 'elo', 'eleanor'];   // shortest to tallest
  assert.equal(ladder.length, FIGHTERS.length);
  for (let i = 1; i < ladder.length; i++) assert.ok(stand(ladder[i]) > stand(ladder[i - 1]), `${ladder[i]} no longer stands over ${ladder[i - 1]}`);
  const spread = stand('eleanor') / stand('zara');
  assert.ok(spread > 1.12 && spread < 1.16, `the tallest stands ${spread.toFixed(3)} times the shortest`);
});
