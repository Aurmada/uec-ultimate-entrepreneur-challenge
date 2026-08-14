# Character Parts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every fighter geometry that breaks its body outline — props and garments as one render-only system — so the cast stops resolving into two silhouette families.

**Architecture:** A character gains a `parts` array of plain data. Each part anchors to a rig joint. `resolveParts()` is a pure function turning parts + pose into absolute coordinates (unit-testable in Node); `drawParts()` is a thin canvas wrapper called twice inside the existing offscreen buffer, so cel shading, rim light, key line, mirroring and attack reach re-scaling all come for free. Render-only by construction: no `SIM_VERSION`, no hurtboxes, no budget pricing.

**Tech Stack:** Vanilla ES modules, Canvas 2D, `node --test`. Zero dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-08-13-character-parts-design.md`

---

## Context an engineer needs before starting

Read these first. They are short and they will each save you an hour.

- **The one invariant.** The simulation decides what happens; rendering decides what it looks like. Data flows one way. Parts are rendering. Nothing in `fighter.js`, `game.js`, `moves.js`, `ai.js` or `net/online.js` may ever read them. This is pinned by test in Task 8.
- **The buffer trick.** `drawFighter` renders the fighter into an offscreen buffer (`_buf`, `SS = 2`), then composites cel shading and the key line over the whole silhouette as a **post-pass**. Anything drawn inside the buffer inherits all of it and becomes part of the silhouette. Anything drawn after the blit looks pasted on. Every part must be drawn inside the buffer.
- **There is no canvas in `npm test`.** Node tests are pure logic. Pixel verification happens in the browser harness at `test/golden/index.html`, served by `python3 dev-server.py 4173`. This is why geometry is a separate pure function.
- **Run the game:** `python3 dev-server.py 4173`, then `http://localhost:4173/?debug=1`.
- **Run the tests:** `npm test` (215 passing before this work).

### The rig joints you can anchor to

From `REST` in `src/engine/anim.js`, plus two derived sockets computed inside `drawFighter`:

| Anchor | Source | Notes |
|---|---|---|
| `armF` | `P.armF` | Front hand. **Reach-scaled during attacks.** |
| `armB` | `P.armB` | Rear hand. Safest place for a held prop. |
| `legF` / `legB` | `P.legF` / `P.legB` | Feet. |
| `head` | `P.headX + P.bodyLean * 26`, `max(P.headY, headTop)` | Matches `drawHead`. |
| `shoulder` | `socket(-10, P.shoulderY + 8)` | Rear shoulder, leaned. |
| `hip` | `socket(-8, P.hipY)` | Rear hip, leaned. |
| `torso` | midpoint of `shoulder` and `hip` | Derived. |

---

## File Structure

| File | Responsibility |
|---|---|
| **Create** `src/engine/parts.js` | Anchor resolution and canvas drawing. Pure `resolveParts`, thin `drawParts`. |
| **Modify** `src/config.js` | `PARTS` block — every limit and cap. No magic numbers in engine files. |
| **Modify** `src/data/schema.js` | `PART_SHAPES`, `PART_ANCHORS`, `FILL_ROLES`, `validateParts`, wired into `validateCharacter`. |
| **Modify** `src/data/fighters.js` | `toCharacter` carries `parts`; the nine characters get their parts. |
| **Modify** `src/engine/drawFighter.js` | Two `drawParts` calls inside the buffer; hardcoded briefcase removed. |
| **Modify** `src/net/online.js` | `CHARACTER_WIRE_VERSION` 1 → 2. |
| **Create** `test/parts.test.js` | Vocabulary, validation, and geometry resolution. |
| **Modify** `test/determinism.test.js` | Structural guard extended to `parts`. |
| **Modify** `test/golden/hash.js` | A parts case in `CASES`. |

---

## Task 1: The `PARTS` config block

**Files:**
- Modify: `src/config.js` (append near `STYLIZE`)

- [ ] **Step 1: Add the config block**

```js
// ---- CHARACTER PARTS -------------------------------------------------------
// Render-only geometry a character carries outside its body outline: a held
// prop, a coat, a cape. Limits live here rather than in the engine so a part
// can be swept without editing render code.
//
// MAX is deliberately small. Six shapes is more than enough for a readable
// silhouette, and a cap is what stops one character costing the frame budget.
export const PARTS = {
  MAX: 6,             // parts per character
  MAX_POINTS: 24,     // vertices in a `path` part
  MIN_POINTS: 3,
  OFFSET: [-120, 120], // dx / dy range, rig px
  SIZE: [1, 160],      // w / h / r range, rig px
  ROT: [-Math.PI, Math.PI],
  FOLLOW: [0, 1],      // cloth lag; 0 is rigid to the anchor
};
```

- [ ] **Step 2: Verify it imports**

Run: `node -e "import('./src/config.js').then(m => console.log(m.PARTS.MAX, m.PARTS.OFFSET))"`
Expected: `6 [ -120, 120 ]`

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat(parts): config block for part limits"
```

---

## Task 2: Part vocabulary and validation

**Files:**
- Modify: `src/data/schema.js`
- Test: `test/parts.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `test/parts.test.js`:

```js
// Parts are render-only geometry, but they are still authored data, so they
// get the same treatment as everything else a human types: rejected loudly
// rather than silently repaired. This codebase has been bitten by silent
// fallbacks more than once — getFighter returning Lizbeth for an unknown id,
// AI_LEVELS quietly resolving an unknown difficulty to `founder`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateParts, PART_SHAPES, PART_ANCHORS, FILL_ROLES } from '../src/data/schema.js';

const good = () => ({
  id: 'case', shape: 'roundRect', anchor: 'armB',
  dx: 6, dy: 4, w: 40, h: 32, rot: 0, fill: 'accent', z: 'front',
});

test('the vocabulary is closed and complete', () => {
  assert.deepEqual(PART_SHAPES, ['roundRect', 'ellipse', 'capsule', 'path']);
  assert.deepEqual(PART_ANCHORS,
    ['armF', 'armB', 'legF', 'legB', 'head', 'shoulder', 'hip', 'torso']);
  assert.deepEqual(FILL_ROLES,
    ['skin', 'suit', 'suit2', 'accent', 'hair', 'pants', 'shoe']);
});

test('a well-formed part validates clean', () => {
  assert.deepEqual(validateParts([good()]), []);
});

test('absent parts are valid — most characters have none', () => {
  assert.deepEqual(validateParts(undefined), []);
  assert.deepEqual(validateParts([]), []);
});

test('an unknown shape is rejected', () => {
  const e = validateParts([{ ...good(), shape: 'blob' }]);
  assert.equal(e.length, 1);
  assert.match(e[0], /shape/);
});

test('an unknown anchor is rejected', () => {
  const e = validateParts([{ ...good(), anchor: 'elbow' }]);
  assert.match(e[0], /anchor/);
});

test('an unknown fill role is rejected, but a hex is allowed', () => {
  assert.match(validateParts([{ ...good(), fill: 'leather' }])[0], /fill/);
  assert.deepEqual(validateParts([{ ...good(), fill: '#6b4a2b' }]), []);
});

test('an out-of-range offset is rejected, not clamped', () => {
  const e = validateParts([{ ...good(), dx: 999 }]);
  assert.match(e[0], /dx/);
});

test('a duplicate id within one character is rejected', () => {
  const e = validateParts([good(), good()]);
  assert.match(e[0], /duplicate/);
});

test('more than the cap is rejected', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ ...good(), id: 'p' + i }));
  assert.match(validateParts(many)[0], /at most/);
});

test('a path needs at least 3 points and at most 24', () => {
  const path = (n) => ({
    id: 'coat', shape: 'path', anchor: 'hip', dx: 0, dy: 0, fill: 'suit2', z: 'behind',
    pts: Array.from({ length: n }, (_, i) => [i, i]),
  });
  assert.match(validateParts([path(2)])[0], /points/);
  assert.match(validateParts([path(25)])[0], /points/);
  assert.deepEqual(validateParts([path(4)]), []);
});

test('follow outside 0..1 is rejected', () => {
  assert.match(validateParts([{ ...good(), follow: 1.5 }])[0], /follow/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/parts.test.js`
Expected: FAIL — `does not provide an export named 'validateParts'`

- [ ] **Step 3: Implement in `src/data/schema.js`**

Add `PARTS` to the config import at the top:

```js
import { BODY, BUDGET, ATTACKS, PARTS } from '../config.js';
```

Then append this section before `validateCharacter`:

```js
// ---------------------------------------------------------------- parts
//
// RENDER-ONLY geometry a character carries outside its body: a held prop, a
// coat, a cape. Never priced by the budget (like shoulders, stride and head),
// never read by the simulation, never a hurtbox. If a prop should hit someone
// that is a MOVE, and moves are priced.
export const PART_SHAPES = ['roundRect', 'ellipse', 'capsule', 'path'];
export const PART_ANCHORS = ['armF', 'armB', 'legF', 'legB', 'head', 'shoulder', 'hip', 'torso'];

// A part's colour is a ROLE, not a hex, so it recolours with the character —
// including a player founder whose palette was sampled from their photo. A
// literal hex stays legal for something genuinely fixed, like leather.
export const FILL_ROLES = ['skin', 'suit', 'suit2', 'accent', 'hair', 'pants', 'shoe'];

const PART_Z = ['front', 'behind'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function inRange(v, [lo, hi]) {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
}

// Returns an array of error strings. Empty means valid.
export function validateParts(parts) {
  if (parts === undefined || parts === null) return [];
  if (!Array.isArray(parts)) return ['parts must be an array'];
  if (parts.length > PARTS.MAX) return [`parts: at most ${PARTS.MAX} per character`];

  const errors = [];
  const seen = new Set();

  parts.forEach((p, i) => {
    const at = `parts[${i}]`;
    if (!p || typeof p !== 'object') { errors.push(`${at} is not an object`); return; }

    if (typeof p.id !== 'string' || !/^[a-z0-9-]{2,16}$/.test(p.id)) {
      errors.push(`${at}.id must match [a-z0-9-]{2,16}`);
    } else if (seen.has(p.id)) {
      errors.push(`${at}.id ${JSON.stringify(p.id)} is a duplicate`);
    } else {
      seen.add(p.id);
    }

    if (!PART_SHAPES.includes(p.shape)) {
      errors.push(`${at}.shape ${JSON.stringify(p.shape)} is not one of ${PART_SHAPES.join(', ')}`);
    }
    if (!PART_ANCHORS.includes(p.anchor)) {
      errors.push(`${at}.anchor ${JSON.stringify(p.anchor)} is not one of ${PART_ANCHORS.join(', ')}`);
    }
    if (!PART_Z.includes(p.z)) {
      errors.push(`${at}.z must be 'front' or 'behind'`);
    }
    if (typeof p.fill !== 'string' || (!FILL_ROLES.includes(p.fill) && !HEX.test(p.fill))) {
      errors.push(`${at}.fill must be a role (${FILL_ROLES.join(', ')}) or a #rrggbb hex`);
    }

    for (const k of ['dx', 'dy']) {
      if (!inRange(p[k], PARTS.OFFSET)) {
        errors.push(`${at}.${k} ${p[k]} outside [${PARTS.OFFSET[0]}, ${PARTS.OFFSET[1]}]`);
      }
    }
    if (p.rot !== undefined && !inRange(p.rot, PARTS.ROT)) {
      errors.push(`${at}.rot ${p.rot} outside [-π, π]`);
    }
    if (p.follow !== undefined && !inRange(p.follow, PARTS.FOLLOW)) {
      errors.push(`${at}.follow ${p.follow} outside [0, 1]`);
    }

    if (p.shape === 'path') {
      const n = Array.isArray(p.pts) ? p.pts.length : 0;
      if (n < PARTS.MIN_POINTS || n > PARTS.MAX_POINTS) {
        errors.push(`${at}.pts needs ${PARTS.MIN_POINTS}-${PARTS.MAX_POINTS} points, got ${n}`);
      } else if (!p.pts.every((q) => Array.isArray(q) && q.length === 2
                              && inRange(q[0], PARTS.OFFSET) && inRange(q[1], PARTS.OFFSET))) {
        errors.push(`${at}.pts must be [x, y] pairs inside the offset range`);
      }
    } else if (p.shape === 'ellipse') {
      if (!inRange(p.r, PARTS.SIZE)) errors.push(`${at}.r ${p.r} outside [${PARTS.SIZE.join(', ')}]`);
    } else {
      for (const k of ['w', 'h']) {
        if (!inRange(p[k], PARTS.SIZE)) {
          errors.push(`${at}.${k} ${p[k]} outside [${PARTS.SIZE[0]}, ${PARTS.SIZE[1]}]`);
        }
      }
    }
  });

  return errors;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/parts.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js test/parts.test.js
git commit -m "feat(parts): vocabulary and validation"
```

---

## Task 3: Wire parts into `validateCharacter`

**Files:**
- Modify: `src/data/schema.js`
- Test: `test/parts.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/parts.test.js`:

```js
import { validateCharacter, SCHEMA_VERSION, DEFAULT_BODY } from '../src/data/schema.js';

function baseChar(parts) {
  return {
    schema: SCHEMA_VERSION,
    id: 'tester',
    identity: { name: 'TEST', title: 'THE TEST', company: 'TESTCO', tagline: 'x', rap: 'y' },
    body: { ...DEFAULT_BODY },
    look: {},
    fighting: {
      startup: 1, dmg: 1, reach: 1, recovery: 1, speed: 1, hp: 1,
      moves: { special: { archetype: 'strike' }, signature: null },
    },
    commandNormals: [],
    ai: { aggr: 0.5, jump: 0.3, prefRange: 'mid' },
    parts,
  };
}

test('a character with a valid part validates clean', () => {
  const r = validateCharacter(baseChar([good()]));
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('a character with a broken part is rejected', () => {
  const r = validateCharacter(baseChar([{ ...good(), anchor: 'nose' }]));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /anchor/.test(e)), r.errors.join('; '));
});

test('parts are NOT priced — they are render-only like shoulders and stride', () => {
  const without = validateCharacter(baseChar(undefined)).cost;
  const heavy = Array.from({ length: 6 }, (_, i) => ({ ...good(), id: 'p' + i }));
  const with6 = validateCharacter(baseChar(heavy)).cost;
  assert.equal(with6, without, 'adding parts must not move the power budget');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/parts.test.js`
Expected: FAIL — the broken-part case reports `ok: true`, because `validateCharacter` does not look at `parts` yet.

- [ ] **Step 3: Implement**

In `src/data/schema.js`, inside `validateCharacter`, immediately after the `look.stance` check and before the `fighting` block:

```js
  // Render-only, but still authored data — so it is validated, and never
  // priced. Nothing below adds to `cost`.
  errors.push(...validateParts(ch.parts));
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/parts.test.js`
Expected: PASS, 14 tests

Run: `npm test`
Expected: 229 pass, 0 fail (215 before this work, plus 14)

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js test/parts.test.js
git commit -m "feat(parts): validated by validateCharacter, never priced"
```

---

## Task 4: `resolveParts` — pure geometry

This is the piece that makes the system testable without a canvas.

**Files:**
- Create: `src/engine/parts.js`
- Test: `test/parts.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/parts.test.js`:

```js
import { resolveParts, anchorPoint } from '../src/engine/parts.js';

function samplePose() {
  return {
    hipY: -88, shoulderY: -156, headX: 0, headY: -182, rot: 0, crouch: 0,
    armF: { x: 34, y: -146 }, armB: { x: 13, y: -144 },
    legF: { x: 26, y: 0 }, legB: { x: -25, y: 0 },
    bodyLean: 0, sx: 1, sy: 1, headR: 18,
  };
}

const COLOURS = { skin: '#e8b48c', suit: '#5865f2', suit2: '#3d47c9',
                  accent: '#29d9ff', hair: '#e8dcc0', pants: '#23294f', shoe: '#eef1ff' };

test('a part resolves to absolute coordinates at its anchor plus offset', () => {
  const P = samplePose();
  const [r] = resolveParts([{ ...good(), anchor: 'armB', dx: 6, dy: 4 }], P, COLOURS);
  assert.equal(r.x, P.armB.x + 6);
  assert.equal(r.y, P.armB.y + 4);
});

test('a fill ROLE resolves to the character colour, a hex passes through', () => {
  const P = samplePose();
  const [role] = resolveParts([{ ...good(), fill: 'accent' }], P, COLOURS);
  assert.equal(role.fill, COLOURS.accent);
  const [hex] = resolveParts([{ ...good(), fill: '#6b4a2b' }], P, COLOURS);
  assert.equal(hex.fill, '#6b4a2b');
});

test('a part anchored to the front hand tracks the reach-scaled joint', () => {
  const near = samplePose();
  const far = samplePose();
  far.armF.x = 90;                       // as an attack re-scale would move it
  const [a] = resolveParts([{ ...good(), anchor: 'armF', dx: 0, dy: 0 }], near, COLOURS);
  const [b] = resolveParts([{ ...good(), anchor: 'armF', dx: 0, dy: 0 }], far, COLOURS);
  assert.equal(b.x - a.x, 56, 'the part must follow the hand, not sit at a fixed offset');
});

test('parts split into their z layers, preserving author order', () => {
  const P = samplePose();
  const out = resolveParts([
    { ...good(), id: 'a', z: 'behind' },
    { ...good(), id: 'b', z: 'front' },
    { ...good(), id: 'c', z: 'behind' },
  ], P, COLOURS);
  assert.deepEqual(out.filter((p) => p.z === 'behind').map((p) => p.id), ['a', 'c']);
});

test('absent or empty parts resolve to nothing, allocating no array churn', () => {
  assert.deepEqual(resolveParts(undefined, samplePose(), COLOURS), []);
  assert.deepEqual(resolveParts([], samplePose(), COLOURS), []);
});

test('every anchor name in the vocabulary resolves to a finite point', () => {
  const P = samplePose();
  for (const a of PART_ANCHORS) {
    const pt = anchorPoint(a, P);
    assert.ok(Number.isFinite(pt.x) && Number.isFinite(pt.y), `${a} did not resolve`);
  }
});

test('a body lean swings the hip and shoulder sockets but not the hands', () => {
  const up = samplePose();
  const leaned = samplePose();
  leaned.bodyLean = 0.4;
  assert.notEqual(anchorPoint('hip', leaned).x, anchorPoint('hip', up).x);
  assert.equal(anchorPoint('armB', leaned).x, anchorPoint('armB', up).x);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/parts.test.js`
Expected: FAIL — `Cannot find module '../src/engine/parts.js'`

- [ ] **Step 3: Implement `src/engine/parts.js`**

```js
// CHARACTER PARTS — geometry a character carries outside its body outline.
//
// A held prop, a coat, a cape. All the same thing: a shape anchored to a rig
// joint. Props and garments differ only by anchor and z-layer, which is why
// this is one system rather than two.
//
// RENDER-ONLY, with no exceptions. A part is never a hurtbox and never reaches
// the simulation. If a prop should hit someone, that is a move.
//
// Split deliberately in two:
//   resolveParts()  pure — parts + pose => absolute coordinates. Unit-tested.
//   drawParts()     thin — paints resolved parts onto a canvas. Golden-tested.
//
// The split exists because `npm test` has no canvas. Everything worth asserting
// about placement is therefore assertable headless, and only the painting needs
// the browser harness.

import { STYLIZE } from '../config.js';

// The lean transform drawFighter applies to torso-mounted sockets. Limbs are
// posed in world space already, so they must NOT be leaned again.
function socket(x, y, P) {
  const lean = (P.bodyLean || 0) * 0.6;
  const cosL = Math.cos(lean), sinL = Math.sin(lean);
  const dy = y - P.hipY;
  return { x: x * cosL - dy * sinL, y: P.hipY + x * sinL + dy * cosL };
}

// Where a named anchor sits, in the same space drawFighter draws the body.
export function anchorPoint(anchor, P) {
  switch (anchor) {
    case 'armF': return { x: P.armF.x, y: P.armF.y };
    case 'armB': return { x: P.armB.x, y: P.armB.y };
    case 'legF': return { x: P.legF.x, y: P.legF.y };
    case 'legB': return { x: P.legB.x, y: P.legB.y };
    case 'head': {
      const headR = P.headR ?? STYLIZE.HEAD_R;
      const headTop = P.shoulderY - (headR - STYLIZE.NECK_OVERLAP);
      return { x: P.headX + (P.bodyLean || 0) * 26, y: Math.max(P.headY, headTop) };
    }
    case 'shoulder': return socket(-10, P.shoulderY + 8, P);
    case 'hip': return socket(-8, P.hipY, P);
    case 'torso': {
      const s = socket(-10, P.shoulderY + 8, P);
      const h = socket(-8, P.hipY, P);
      return { x: (s.x + h.x) / 2, y: (s.y + h.y) / 2 };
    }
    default: return { x: 0, y: 0 };
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// parts + pose + the character's palette => drawable descriptors.
// Author order is preserved inside each z layer.
export function resolveParts(parts, P, colours) {
  if (!parts || !parts.length) return [];
  const out = [];
  for (const p of parts) {
    if (p.states && !p.states.includes(P.partState)) continue;
    const at = anchorPoint(p.anchor, P);
    out.push({
      id: p.id,
      shape: p.shape,
      z: p.z,
      x: at.x + p.dx,
      y: at.y + p.dy,
      w: p.w, h: p.h, r: p.r, pts: p.pts,
      rot: p.rot || 0,
      fill: HEX.test(p.fill) ? p.fill : (colours[p.fill] || '#ff00ff'),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/parts.test.js`
Expected: PASS, 23 tests (21 from the plan as written, plus 2 added in review — see below)

- [ ] **Step 5: Commit**

```bash
git add src/engine/parts.js test/parts.test.js
git commit -m "feat(parts): pure geometry resolution, unit-tested without a canvas"
```

---

## Task 5: `drawParts` — the canvas wrapper

`blob` and `capsule` live in `drawFighter.js` and close over its `INK` / `OUTLINE`
module state. Importing them here would be circular, so they are **passed in**.

**Files:**
- Modify: `src/engine/parts.js`

- [ ] **Step 1: Append the drawing function**

```js
// Paint resolved parts of one z layer.
//
// `blob` is passed in rather than imported: it lives in drawFighter.js and
// closes over that module's INK/OUTLINE state, so importing it here would be a
// cycle. Passing it also keeps this module free of canvas globals, which is
// what lets the half above stay pure.
//
// MUST be called INSIDE the offscreen buffer, before shadeBuffer(). That is the
// whole reason parts get cel shading, rim light and the key line for free, and
// the reason they join the silhouette instead of looking pasted on.
export function drawParts(ctx, resolved, layer, blob) {
  for (const p of resolved) {
    if (p.z !== layer) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.rot) ctx.rotate(p.rot);
    switch (p.shape) {
      case 'roundRect':
        blob(ctx, () => { ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, Math.min(5, p.w / 4)); }, p.fill);
        break;
      case 'ellipse':
        blob(ctx, () => { ctx.ellipse(0, 0, p.r, p.r, 0, 0, 7); }, p.fill);
        break;
      case 'capsule':
        blob(ctx, () => { ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, Math.min(p.w, p.h) / 2); }, p.fill);
        break;
      case 'path':
        blob(ctx, () => {
          ctx.moveTo(p.pts[0][0], p.pts[0][1]);
          for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1]);
          ctx.closePath();
        }, p.fill);
        break;
    }
    ctx.restore();
  }
}
```

- [ ] **Step 2: Verify the module still loads and the pure half is unaffected**

Run: `node --test test/parts.test.js`
Expected: PASS, 23 tests (unchanged — `drawParts` is not called headless)

- [ ] **Step 3: Commit**

```bash
git add src/engine/parts.js
git commit -m "feat(parts): canvas drawing layer"
```

---

## Task 6: Call `drawParts` from `drawFighter`

**Files:**
- Modify: `src/engine/drawFighter.js`

- [ ] **Step 1: Import at the top of the file**

```js
import { resolveParts, drawParts } from './parts.js';
```

- [ ] **Step 2: Resolve once per frame**

In `drawFighter`, immediately after `const [hipBx, hipBy] = socket(-8, P.hipY);`:

```js
  // Resolved once and reused by both layers. `c` is the character's live
  // palette, so a part with a role fill recolours with the fighter — including
  // a player founder whose colours were sampled from their photo.
  P.partState = f.state;
  const parts = resolveParts(def.parts, P, c);
```

- [ ] **Step 3: Draw the `behind` layer**

Directly before the comment `// back arm, back leg — one shade back...`:

```js
  // BEHIND the body: capes, coat tails, anything the torso should overlap.
  if (parts.length) drawParts(g, parts, 'behind', blob);
```

- [ ] **Step 4: Draw the `front` layer, replacing the hardcoded briefcase**

Replace line `if (P.briefcase) drawBriefcase(g, 34, -92, c.accent);` with:

```js
  // IN FRONT of the body: held props. Still inside the buffer, so the shading
  // pass and key line treat them as part of the silhouette.
  if (parts.length) drawParts(g, parts, 'front', blob);

  // The universal block guard. Not a character part — every fighter raises one.
  if (P.briefcase) drawBriefcase(g, 34, -92, c.accent);
```

- [ ] **Step 5: Verify nothing changed yet**

No character has `parts` yet, so `parts.length` is 0 everywhere and rendering must be identical.

Run: `npm test`
Expected: 238 pass, 0 fail

Then start the dev server and check the golden baseline:

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/test/golden/index.html`, click **CHECK against baseline**.
Expected: all cases match — parts are inert until a character declares one.

- [ ] **Step 6: Commit**

```bash
git add src/engine/drawFighter.js
git commit -m "feat(parts): drawn inside the offscreen buffer, both z layers"
```

---

## Task 7: Carry parts through `toCharacter`, and bump the wire version

`main.js:502` sends `toCharacter(def)` to the peer, so adding a field changes the
shape of the carried character. By the rule documented at the constant, that is a
`CHARACTER_WIRE_VERSION` bump. It is **not** a `SIM_VERSION` bump — no fight
behaviour changes.

**Files:**
- Modify: `src/data/fighters.js`
- Modify: `src/net/online.js`
- Test: `test/parts.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/parts.test.js`:

```js
import { toCharacter } from '../src/data/fighters.js';
import { CHARACTER_WIRE_VERSION } from '../src/net/online.js';

test('toCharacter carries parts through to the validated character', () => {
  const def = { id: 'x', name: 'X', style: 'balanced', special: 'pitchdeck', parts: [good()] };
  assert.deepEqual(toCharacter(def).parts, [good()]);
});

test('a character with no parts carries an empty array, never undefined', () => {
  const def = { id: 'x', name: 'X', style: 'balanced', special: 'pitchdeck' };
  assert.deepEqual(toCharacter(def).parts, []);
});

test('the wire version was bumped for the new payload field', () => {
  assert.equal(CHARACTER_WIRE_VERSION, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/parts.test.js`
Expected: FAIL — `parts` is `undefined`, and `CHARACTER_WIRE_VERSION` is 1

- [ ] **Step 3: Implement**

In `src/data/fighters.js`, inside `toCharacter`, after the `commandNormals` line:

```js
    // Render-only, but it travels: a rival's props must draw on our screen or
    // their silhouette is not the character they picked.
    parts: def.parts || [],
```

In `src/net/online.js`, replace the `CHARACTER_WIRE_VERSION` line, keeping the
comment block above it and adding:

```js
// v2: characters carry `parts` — render-only geometry outside the body outline
// (held props, coats). Behaviour is unchanged, so SIM_VERSION stays put; but
// the SHAPE of the carried character changed, and that is exactly what this
// version guards.
export const CHARACTER_WIRE_VERSION = 2;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: 241 pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/data/fighters.js src/net/online.js test/parts.test.js
git commit -m "feat(parts): carried on the wire, CHARACTER_WIRE_VERSION 1 -> 2"
```

---

## Task 8: Pin the render-only boundary

**Files:**
- Modify: `test/determinism.test.js`

- [ ] **Step 1: Extend the structural guard**

In `test/determinism.test.js`, in the test `'simulation modules never read animation data'`,
replace the `FORBIDDEN` regex with:

```js
  const FORBIDDEN = /\banimOverrides\b|\bkeyframes?\b|\bsampleTrack\b|\bresolveParts\b|\bdrawParts\b|\bdef\.parts\b|from '\.\/anim\.js'|from '\.\.\/engine\/anim\.js'|from '\.\/parts\.js'|from '\.\.\/engine\/parts\.js'/;
```

And update the assertion message:

```js
    assert.equal(hit, -1,
      `${file}:${hit + 1} reads render-only data (pose or parts) — lockstep depends on it staying out of the sim`);
```

- [ ] **Step 2: Verify the guard actually guards**

Temporarily add this line to the top of `src/engine/fighter.js`:

```js
import { resolveParts } from './parts.js';
```

Run: `node --test test/determinism.test.js`
Expected: FAIL — `src/engine/fighter.js:N reads render-only data`

**Now remove that line again.** A test that passes before your change pins nothing;
this step is how you know it pins something.

- [ ] **Step 3: Run to verify it passes**

Run: `npm test`
Expected: 241 pass, 0 fail

- [ ] **Step 4: Commit**

```bash
git add test/determinism.test.js
git commit -m "test(parts): structural guard keeps parts out of the simulation"
```

---

## Task 9: Migrate the block briefcase to a part

Proves the system against a known-good result before anything new depends on it.

Note the briefcase is currently **universal** — every fighter raises one when
blocking. Migrating it means giving it to each character as a part restricted to the
block state, which is also the first real exercise of `states`.

**Files:**
- Modify: `src/data/fighters.js`
- Modify: `src/engine/drawFighter.js`
- Test: browser golden harness

- [ ] **Step 1: Give one character the part, and check it against the old drawing**

Add to the `ava` entry in `src/data/fighters.js`:

```js
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
    ],
```

Those offsets are derived, not guessed. The hardcoded call is
`drawBriefcase(g, 34, -92, ...)`, and the `block` branch sets `P.armF = { x: 26, y: -144 }`
— so `dx = 34 - 26 = 8` and `dy = -92 - (-144) = 52`.

Confirm it rather than trusting the arithmetic: the next step renders both at once, so
a wrong offset is visible as two briefcases in different places instead of one
overlapping pair.

- [ ] **Step 2: Verify visually against the old drawing**

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/test/golden/index.html` and click **CHECK against baseline**.
Expected: exactly one mismatch — `ava` in `block` — because it now draws **two**
briefcases, the part and the hardcoded one. Seeing two overlapping is the confirmation
that the part landed in the right place.

- [ ] **Step 3: Remove the hardcoded briefcase**

In `src/engine/drawFighter.js`, delete:

```js
  // The universal block guard. Not a character part — every fighter raises one.
  if (P.briefcase) drawBriefcase(g, 34, -92, c.accent);
```

Also delete the now-unused `drawBriefcase` function (around line 1004) and the
`P.briefcase = true;` assignment in the `block` branch (around line 476).

- [ ] **Step 4: Give the part to the remaining eight characters**

Add the same `parts` entry to `max`, `kai`, `zara`, `eleanor`, `dex`, `elo`, `bozo`,
`scam`. It is identical for each — the guard is universal.

- [ ] **Step 5: Re-baseline the golden harness**

The block pose legitimately changed for every character (the briefcase now sits in
the buffer as a part, drawn with `blob` rather than the old three-call drawing). Open
the harness, confirm the block frames look right by eye, then click **WRITE new
baseline**.

**Deviation from the spec, recorded deliberately.** The spec's testing table asks for
the migrated briefcase to render *pixel-identical*. It will not, and cannot: the old
drawing made three separate calls (a body, an accent stripe, a handle) while a part is
a single `blob`. The honest test is therefore visual equivalence plus a re-baseline,
not a hash match. If you want the stripe and handle back, they are two more parts.

Run: `npm test`
Expected: 241 pass, 0 fail

- [ ] **Step 6: Commit**

```bash
git add src/data/fighters.js src/engine/drawFighter.js test/golden/baseline.json
git commit -m "refactor(parts): block briefcase is a part, not a hardcoded draw"
```

---

## Task 10: Signature props for all nine

The **B** half. One prop each, breaking the outline in a different place.

**Files:**
- Modify: `src/data/fighters.js`

- [ ] **Step 1: Add a signature prop to each character**

Append to each character's existing `parts` array (which already holds `guard-case`).
Each is chosen to break the silhouette somewhere the others do not — head, back, hip,
rear hand, shoulder.

```js
// ava — LIZBETH HOLMEZ, THERAMOS. The sample vial, worn at the hip.
{ id: 'vial', shape: 'capsule', anchor: 'hip', dx: -14, dy: -6,
  w: 10, h: 26, fill: 'accent', z: 'front' },

// max — ADAM WEUMANN, WEWERK. The rolled mat across the back.
{ id: 'mat', shape: 'capsule', anchor: 'shoulder', dx: -18, dy: 26,
  w: 14, h: 62, rot: 0.35, fill: 'suit2', z: 'behind' },

// kai — STEVE NOJOBS, PEAR. The device, held out in the rear hand.
{ id: 'device', shape: 'roundRect', anchor: 'armB', dx: 0, dy: 0,
  w: 20, h: 34, fill: 'accent', z: 'front' },

// zara — KIM KOINDASHIAN, SKIMZCOIN. The ring light haloing the head.
{ id: 'ringlight', shape: 'ellipse', anchor: 'head', dx: 0, dy: -4,
  r: 34, fill: 'accent', z: 'behind' },

// eleanor — CATHIE WOODZ, ARKK. The tablet, chart out.
{ id: 'tablet', shape: 'roundRect', anchor: 'armB', dx: 2, dy: 2,
  w: 30, h: 42, rot: -0.2, fill: 'suit2', z: 'front' },

// dex — CARL ICAHNT. The briefcase he never puts down.
{ id: 'case', shape: 'roundRect', anchor: 'armB', dx: 4, dy: 10,
  w: 44, h: 34, fill: '#6b4a2b', z: 'front' },

// elo — ELO MA, SPACEY-X. The booster on the back.
{ id: 'booster', shape: 'capsule', anchor: 'shoulder', dx: -22, dy: 34,
  w: 20, h: 74, fill: 'accent', z: 'behind' },

// bozo — JEFF BOZO, PRIMEZON. The parcel under the rear arm.
{ id: 'parcel', shape: 'roundRect', anchor: 'armB', dx: -6, dy: 6,
  w: 38, h: 30, rot: 0.15, fill: 'hair', z: 'front' },

// scam — SCAM ALT, CLOSEDAI. A single enormous paperclip. He knows what he did.
{ id: 'clip', shape: 'path', anchor: 'shoulder', dx: -20, dy: 18,
  pts: [[0,0],[10,0],[10,44],[3,44],[3,10],[7,10],[7,38]],
  fill: 'shoe', z: 'behind' },
```

- [ ] **Step 2: Validate every character still passes**

Run: `npm test`
Expected: 241 pass, 0 fail — `rosterMoves.test.js` and `roster.test.js` both build
every character, so a malformed part fails here.

- [ ] **Step 3: Look at them**

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/?debug=1` and in the console:

```js
UEC.signInAs({ id: 'test-uid', email: 'test@example.com' });
UEC.Save.data.tutorialSeen = true;
const { sheet } = await import('/lab/roster.js');
await sheet('/shots/roster-parts.png', 'WITH PARTS');
```

Adjust offsets until each prop sits where it should in the idle pose. Expect to
iterate here — this is authoring by numbers until the editor exists.

- [ ] **Step 4: Re-baseline and commit**

Open `http://localhost:4173/test/golden/index.html`, confirm by eye, click
**WRITE new baseline**.

```bash
git add src/data/fighters.js test/golden/baseline.json shots/roster-parts.png
git commit -m "feat(parts): a signature prop for all nine fighters"
```

---

## Task 11: Golden coverage, and "every part actually draws"

The spec's hardest-won testing rule, applied to art: checking that a part's numbers
are well formed is not the same as checking anything appears. Three moves once shipped
that played their animation, printed their popup, and did nothing at all, for months,
against a green suite. A part that renders nothing, renders off-screen, or renders
outside the buffer bounds is that same defect wearing art clothes.

This needs pixels, so it lives in the browser harness.

**Files:**
- Modify: `test/golden/hash.js`
- Modify: `test/golden/index.html`

- [ ] **Step 1: Add a parts-bearing case to the golden set**

In `test/golden/hash.js`, append to `CASES`:

```js
  // Parts ride the pose, so they need coverage in a state that MOVES the
  // anchors — an idle-only case would pass with a part welded to the origin.
  { state: 'walk', t: 0.9, walkPhase: 4.2 },
  { state: 'attack', t: 0.5, kind: 'punch', stateT: 0.08, partCheck: true },
```

- [ ] **Step 2: Add the every-part-draws check to the harness**

In `test/golden/index.html`, inside the `<script type="module">` block, add this
function and a button that calls it:

```js
// Every declared part must put ink on the canvas.
//
// Renders each character twice — once as authored, once with `parts` stripped —
// and diffs. A part that draws nothing produces an identical pair, which is
// exactly the failure this catches. Diffing rather than counting non-transparent
// pixels is deliberate: the body already fills most of the frame, so an absolute
// count would drown the signal.
async function checkPartsDraw() {
  const rows = [];
  for (const def of FIGHTERS) {
    if (!def.parts || !def.parts.length) continue;
    for (const p of def.parts) {
      const states = p.states || ['idle'];
      const c = CASES.find((k) => states.includes(k.state)) || CASES[0];

      const withPart = captureOne({ ...def, parts: [p] }, c);
      const without  = captureOne({ ...def, parts: [] }, c);
      rows.push([`${def.id}/${p.id}`, withPart !== without]);
    }
  }
  const dead = rows.filter(([, drew]) => !drew).map(([k]) => k);
  return { total: rows.length, dead };
}
```

`captureOne(def, case)` is the existing single-render-and-hash path already used by
`capture()`; extract it if it is currently inlined in the loop.

Wire it to a button beside the existing ones:

```html
<button id="parts">CHECK every part draws</button>
```

```js
document.getElementById('parts').onclick = async () => {
  const r = await checkPartsDraw();
  out.textContent = r.dead.length
    ? `${r.dead.length} of ${r.total} parts DREW NOTHING: ${r.dead.join(', ')}`
    : `all ${r.total} parts draw`;
};
```

- [ ] **Step 3: Run it**

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/test/golden/index.html`, click **CHECK every part draws**.
Expected: `all N parts draw`.

If a part is listed as drawing nothing, it is either outside the buffer bounds, sized
to zero, or filtered out by a `states` list that does not match any case.

- [ ] **Step 4: Re-baseline for the two new cases and commit**

Click **WRITE new baseline** to capture the added `CASES`.

```bash
git add test/golden/hash.js test/golden/index.html test/golden/baseline.json
git commit -m "test(parts): golden coverage on moving anchors, and an every-part-draws check"
```

---

## Task 12: Perf budget

The spec's number: parts add under 0.3 ms/frame for a typical character. Measured, not
assumed — the existing shading pass is about 0.3 ms and the v2.7 limb work about
1 ms/frame, so this is the scale that matters.

**Files:**
- No source changes unless the measurement fails.

- [ ] **Step 1: Measure**

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/?debug=1` and in the console:

```js
UEC.signInAs({ id: 'test-uid', email: 'test@example.com' });
UEC.Save.data.tutorialSeen = true;
const { getFighter } = await import('/src/data/fighters.js');
const { getArena }   = await import('/src/data/arenas.js');
const R = await import('/src/engine/render.js');
UEC.startMatch({ mode:'solo', p1Def:getFighter('dex'), p2Def:getFighter('scam'),
                 arena:getArena('boardroom'), difficulty:'founder', isChallenge:false });
await new Promise(r => setTimeout(r, 500));

const ctx = document.getElementById('gameCanvas').getContext('2d');
const g = UEC.game;
const time = (label) => {
  for (let i = 0; i < 30; i++) R.renderGame(ctx, g);          // warm
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) R.renderGame(ctx, g);
  console.log(label, ((performance.now() - t0) / 300).toFixed(3), 'ms/frame');
};
time('with parts');
const saved = g.fighters.map(f => f.def.parts);
g.fighters.forEach(f => { f.def = { ...f.def, parts: [] }; });
time('without parts');
```

- [ ] **Step 2: Judge it**

Expected: the difference is under 0.3 ms/frame with two parts-bearing fighters on
screen.

If it is over, the cause is almost certainly `blob()` stroking every shape — each part
costs a fill and a stroke. Cheapest fix in order: drop `path` parts to fewer points,
then merge adjacent parts on one character, then last resort add an `outline: false`
flag to skip the stroke for parts that sit inside the body edge anyway.

- [ ] **Step 3: Record the number**

Add the measured figure to `docs/ARCHITECTURE.md` §7 in Task 15, beside the existing
per-pass costs, so the next person tuning this has a baseline rather than a guess.

---

## Task 13: The silhouette acceptance measure

**Files:**
- No source changes — this is the acceptance gate.

- [ ] **Step 1: Re-run the silhouette test**

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/?debug=1` and in the console:

```js
UEC.signInAs({ id: 'test-uid', email: 'test@example.com' });
UEC.Save.data.tutorialSeen = true;
const { silhouettes } = await import('/lab/silhouette.js');
await silhouettes('/shots/roster-silhouette-after.png', 'SILHOUETTE — WITH PARTS');
```

- [ ] **Step 2: Judge it against the baseline**

Compare against `shots/roster-silhouette.png` (committed before this work).

**Acceptance:** the two shape families named in the spec must visibly break up. Every
fighter should carry a shape that leaves its body outline, and no two should break it
in the same place. If the five narrow columns still read as five narrow columns, the
props are too small or too close to the body — go back to Task 10 and push them out.

The bar is the one Steve already clears by accident: an outline you can name.

- [ ] **Step 3: Commit the evidence**

```bash
git add shots/roster-silhouette-after.png
git commit -m "test(parts): silhouette acceptance — the shape families break up"
```

---

## Task 14: Garments — `path` and `follow`

The **C** half. Only start this once Task 13 passes.

**Files:**
- Modify: `src/engine/parts.js`
- Modify: `src/data/fighters.js`
- Test: `test/parts.test.js`

- [ ] **Step 1: Write the failing test for cloth lag**

Append to `test/parts.test.js`:

```js
import { partLagState, applyFollow } from '../src/engine/parts.js';

test('a rigid part (follow 0) sits exactly on its anchor every frame', () => {
  const st = partLagState();
  const a = applyFollow(st, 'coat', { x: 10, y: 10 }, 0);
  const b = applyFollow(st, 'coat', { x: 90, y: 10 }, 0);
  assert.deepEqual(a, { x: 10, y: 10 });
  assert.deepEqual(b, { x: 90, y: 10 });
});

test('a following part trails its anchor and then catches up', () => {
  const st = partLagState();
  applyFollow(st, 'cape', { x: 0, y: 0 }, 0.5);
  const moved = applyFollow(st, 'cape', { x: 100, y: 0 }, 0.5);
  assert.ok(moved.x > 0 && moved.x < 100, `expected lag, got ${moved.x}`);
  let last = moved.x;
  for (let i = 0; i < 20; i++) last = applyFollow(st, 'cape', { x: 100, y: 0 }, 0.5).x;
  assert.ok(Math.abs(last - 100) < 0.5, `expected catch-up, got ${last}`);
});

test('lag state is per fighter, so two fighters never share a cape', () => {
  const one = partLagState(), two = partLagState();
  applyFollow(one, 'cape', { x: 0, y: 0 }, 0.5);
  applyFollow(two, 'cape', { x: 100, y: 0 }, 0.5);
  const a = applyFollow(one, 'cape', { x: 100, y: 0 }, 0.5).x;
  const b = applyFollow(two, 'cape', { x: 100, y: 0 }, 0.5).x;
  assert.notEqual(a, b);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/parts.test.js`
Expected: FAIL — `does not provide an export named 'partLagState'`

- [ ] **Step 3: Implement in `src/engine/parts.js`**

```js
// Cloth lag. A part with follow > 0 trails its anchor instead of riding it, so
// a coat swings when the fighter does.
//
// This is a RENDER-SIDE smoother holding per-fighter state, and it is allowed
// to be frame-rate dependent and non-deterministic precisely because nothing in
// the simulation can see it. That freedom is exactly what the structural guard
// in determinism.test.js exists to protect — if a part ever became a hurtbox,
// this smoother would desync a live match on the first swing.
export function partLagState() {
  return new Map();
}

export function applyFollow(state, id, target, follow) {
  if (!follow) return target;
  const prev = state.get(id);
  if (!prev) { state.set(id, { ...target }); return target; }
  // Exponential approach. follow 1 would never arrive, so cap the lag at 0.9.
  const k = 1 - Math.min(0.9, follow);
  const next = { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
  state.set(id, next);
  return next;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/parts.test.js`
Expected: PASS, 29 tests

- [ ] **Step 5: Wire lag into the resolve path**

In `resolveParts`, change the signature and the anchor line:

```js
export function resolveParts(parts, P, colours, lag) {
```

```js
    const raw = anchorPoint(p.anchor, P);
    const at = (lag && p.follow) ? applyFollow(lag, p.id, raw, p.follow) : raw;
```

In `src/engine/drawFighter.js`, give each fighter its own lag map and pass it:

```js
  f._partLag ||= partLagState();
  const parts = resolveParts(def.parts, P, c, f._partLag);
```

Add `partLagState` to the import at the top of `drawFighter.js`:

```js
import { resolveParts, drawParts, partLagState } from './parts.js';
```

- [ ] **Step 6: Add one real garment**

Give `eleanor` a long coat — she is a narrow column today, and a coat is the
cheapest way to give her a shape below the waist:

```js
{ id: 'coat', shape: 'path', anchor: 'hip', dx: 0, dy: 0,
  pts: [[-16, -4], [16, -4], [22, 46], [-22, 46]],
  fill: 'suit2', z: 'behind', follow: 0.35 },
```

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: 244 pass, 0 fail

Open `http://localhost:4173/?debug=1`, start a fight as `eleanor`, and walk back and
forth. The coat should trail the hips and settle. Re-baseline the golden harness.

- [ ] **Step 8: Commit**

```bash
git add src/engine/parts.js src/engine/drawFighter.js src/data/fighters.js test/parts.test.js test/golden/baseline.json
git commit -m "feat(parts): path garments with cloth lag"
```

---

## Task 15: Incubator preview and documentation

**Files:**
- Modify: `incubator/main.js`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Carry parts through the Incubator's export**

In `incubator/main.js`, in `toModule()`, after the `commandNormals` line:

```js
  if (draft.parts && draft.parts.length) clean.parts = draft.parts;
```

The Incubator already validates through `validateCharacter(toCharacter(draft))` and
previews through the real `drawFighter`, so a hand-typed `parts` array on the draft
gets live preview and live validation with no editor work.

- [ ] **Step 2: Document the system**

Add to `docs/ARCHITECTURE.md`, as a new subsection at the end of §7 (The rendering
pipeline):

```markdown
### Character parts

A character may carry `parts` — render-only geometry outside its body outline. A
held prop, a coat, a cape: all one system, differing only by anchor joint and
z-layer.

`resolveParts()` in `engine/parts.js` is pure — parts plus pose in, absolute
coordinates out — which is what makes placement unit-testable in a suite with no
canvas. `drawParts()` paints them, and is called twice from `drawFighter` **inside
the offscreen buffer**: `behind` before the back limbs, `front` after the front arm.
Drawing inside the buffer is what earns cel shading, rim light, the key line and
membership in the silhouette for free.

Parts are validated by the shared `validateCharacter` and are **never priced** — they
are free, like shoulders, stride and head. They do travel on the wire, which is why
`CHARACTER_WIRE_VERSION` is 2.

The one rule: **a prop must never read as extending reach.** Same failure as the
`applyMotion` rule above — the simulation stays correct, but the game lies to the
player about where a hit lands. Props on the rear hand, back, head and hips are
unrestricted; a prop on `armF` must stay inside the hand's own silhouette during the
active window.
```

- [ ] **Step 3: Verify and commit**

Run: `npm test`
Expected: 244 pass, 0 fail

```bash
git add incubator/main.js docs/ARCHITECTURE.md
git commit -m "docs(parts): architecture section, Incubator carries parts on export"
```

---

## Acceptance

- [ ] `npm test` green, 244 tests
- [ ] Golden harness matches its baseline
- [ ] **CHECK every part draws** reports zero dead parts
- [ ] Parts cost under 0.3 ms/frame, measured and written into `ARCHITECTURE.md` §7
- [ ] `determinism.test.js` fails if any sim module imports `parts.js` (verified by hand in Task 8)
- [ ] Every one of the nine has a shape that leaves its body outline
- [ ] `lab/silhouette.js` shows the two shape families broken up
- [ ] No `SIM_VERSION` change; `CHARACTER_WIRE_VERSION` is 2
- [ ] `budgetCost` is unchanged for every shipped character
- [ ] No prop on `armF` extends past the hand during an attack's active window

---

## Notes for whoever picks this up

**Parts are unpriced, and that is deliberate.** They are render-only, exactly like
`shoulders`, `stride` and `head`. If you find yourself wanting to price one, what you
actually want is a move — and moves are the other sub-project.

**Expect to iterate on offsets.** There is no part editor yet; that was a deliberate
call, on the grounds that building an editor before the vocabulary settles means
building it twice. `lab/roster.js` renders the whole cast in one image and is the
fastest way to check nine props at once.

**If a measurement surprises you, suspect the harness first.** That heuristic has been
right every time it has come up in this codebase, including twice while writing the
spec this plan implements.
