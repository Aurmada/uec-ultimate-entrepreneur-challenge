// Faces painted for sculpted heads (engine/gl3d/faces3d.js), from each head's
// layout and the fighter's own 2D face values (November 2026). Render-only,
// like every face.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { paintSculpted, character, FACE_REF, FACE_STYLE_KEYS, EYE_SHAPES, REST_MOUTHS } from '../src/engine/gl3d/faces3d.js';
import { MODELS3D, SCULPTED, FACE_STATES } from '../src/data/models3d.js';
import { getFighter, FIGHTERS } from '../src/data/fighters.js';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { wearing, closeGlass } from '../src/engine/gl3d/index.js';
import { GL3D } from '../src/config.js';

// A 2D context that records what is drawn, enough to tell one face from another.
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (...args) => { calls.push(`${String(k)}(${args.map((a) => +a.toFixed?.(2) || a).join(',')})`); }),
    set: (o, k, v) => { calls.push(`${String(k)}=${v}`); return true; },
  });
  return { ctx, calls };
}
const painted = (def, expression, layout = MODELS3D['sculpt:bozo'].face.layout, style) => {
  const { ctx, calls } = recorder();
  paintSculpted(ctx, def, expression, layout, style);
  return calls;
};

test('every sculpted fighter has their whole build: a fighter, a design, a model and a face layout', () => {
  assert.ok(Object.keys(SCULPTED).length > 0);
  for (const id of Object.keys(SCULPTED)) {
    assert.ok(FIGHTERS.some((d) => d.id === id), `${id} is not a fighter`);
    assert.ok(existsSync(new URL(`../lab/blender/fighters/${id}.py`, import.meta.url)), `${id} has no design in lab/blender/fighters`);
    const spec = MODELS3D[`sculpt:${id}`];
    assert.ok(existsSync(new URL(`../${spec.url}`, import.meta.url)), `${id}'s model is not built`);
    const L = spec.face?.layout;
    for (const k of ['eye', 'brow', 'mouth', 'lid', 'line']) assert.ok(L?.[k] !== undefined, `${id}'s face layout has no ${k}`);
  }
});

test("the sculpted Jeff's face paints every expression, each its own", () => {
  const def = getFighter('bozo');
  const drawn = FACE_STATES.map((expression) => {
    const calls = painted(def, expression);
    assert.ok(calls.length > 10, `${expression} draws next to nothing`);
    return calls.join(';');
  });
  assert.equal(new Set(drawn).size, FACE_STATES.length, 'two expressions paint the same face');
});

test("the painter is pinned on Jeff's face values, and another fighter's move it", () => {
  const jeff = getFighter('bozo');
  // his own values are the reference: nothing of his character moves
  const K = character(jeff);
  for (const [k, v] of Object.entries(FACE_REF)) assert.equal(jeff.face[k], v, `FACE_REF.${k} is not his`);
  assert.deepEqual([K.open, K.iris, K.pupil, K.tilt, K.curve], [1.1, 1.9, 0.9, 0, 0]);
  // on the same head, a wider-eyed fighter's eyes open wider, a scowler's set
  // mouth turns down, and a heavier brow drops harder: each 2D knob reaches
  // the painted face, in the same direction it moves the 2D one
  const as = (face) => ({ ...jeff, face: { ...jeff.face, ...face } });
  assert.ok(character(as({ LID_Y: 6 })).open > K.open);
  assert.ok(character(as({ PUPIL_R: 3.2 })).iris > K.iris);
  assert.ok(character(as({ BROW_TILT: 5 })).tilt > 0);
  // the set mouth's far corner, the one Jeff's smirk lifts (y is down)
  const corner = (def) => {
    const mw = MODELS3D['sculpt:bozo'].face.layout.mouth.w;
    const c = painted(def, 'idle').find((s) => s.startsWith('quadraticCurveTo(0,') && +s.split(',')[2] === +(mw + 0.4).toFixed(2));
    return +c.split(',')[3].replace(')', '');
  };
  assert.ok(corner(as({ MOUTH_CURVE: -2 })) > corner(jeff) + 2, 'a scowl does not pull the corner down');
  // every fighter of the cast paints a face of their own on it
  const faces = new Set(FIGHTERS.map((d) => painted({ ...jeff, face: d.face }, 'idle').join(';')));
  assert.equal(faces.size, new Set(FIGHTERS.map((d) => JSON.stringify(d.face))).size);
});

test('stubble is painted for a fighter who has it, and a wide-eyed one stares rather than squints', () => {
  const adam = getFighter('max'), jeff = getFighter('bozo');
  const shaded = (def) => painted(def, 'idle').join(';').includes('globalAlpha=0.24');
  assert.ok(shaded(adam), "Adam's stubble is not painted");
  assert.ok(!shaded(jeff), 'Jeff is painted with stubble he does not have');
  assert.equal(character(adam).smug, false, 'Adam (wide eyes) squints at rest');
  assert.equal(character(jeff).smug, true);
});

test('the sculpted Jeff wears his shades, dark glass over his eyes', () => {
  const spec = MODELS3D['sculpt:bozo'];
  const glb = readFileSync(new URL(`../${spec.url}`, import.meta.url));
  const model = extractModel(parseGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)));
  const roles = model.primitives.filter((p) => p.name === 'eyewear:shades').map((p) => p.role).sort();
  assert.deepEqual(roles, ['frame', 'lens'], 'no shades mesh with a lens and a frame');
  assert.ok(wearing(getFighter('bozo'), 'idle')('eyewear:shades'), 'Jeff does not wear them');
  assert.ok(spec.glass?.lens > 0 && spec.glass.lens < 1, 'the lenses are not see-through glass');
});

// The nine sculpted faces looked alike (November 2026): the 2D face values
// move only a few knobs a little, so each fighter's face carries a design of
// its own (`face.style`), original and drawn from their character.
test('every sculpted fighter has a face design of their own, in keys the painter knows', () => {
  const hex = /^#[0-9a-f]{6}$/i;
  for (const id of Object.keys(SCULPTED)) {
    const St = MODELS3D[`sculpt:${id}`].face.style;
    assert.ok(St && Object.keys(St).length > 0, `${id} has no face style`);
    for (const k of Object.keys(St)) assert.ok(FACE_STYLE_KEYS.includes(k), `${id}'s face style has an unknown key ${k}`);
    if (St.eye !== undefined) assert.ok(St.eye in EYE_SHAPES, `${id}'s eyes are an unknown shape ${St.eye}`);
    if (St.mouth !== undefined) assert.ok(REST_MOUTHS.includes(St.mouth), `${id}'s mouth is an unknown set ${St.mouth}`);
    for (const k of ['iris', 'lips']) if (St[k] !== undefined) assert.match(St[k], hex, `${id}'s ${k} is not a colour`);
  }
});

test('on one head and with one set of face values, each design paints a face of its own', () => {
  // Every fighter's 2D values set to Jeff's and every face on his head: what
  // is left to tell them apart is the design alone, and it must be enough.
  const jeff = getFighter('bozo');
  const ids = Object.keys(SCULPTED);
  for (const expression of ['idle', 'angry', 'happy']) {
    const faces = new Set(ids.map((id) => painted({ ...jeff, c: getFighter(id).c }, expression, undefined, MODELS3D[`sculpt:${id}`].face.style).join(';')));
    assert.equal(faces.size, ids.length, `two designs paint the same ${expression} face`);
  }
  // and at rest, nobody's design leaves the face as the bare painter draws it
  for (const id of ids.filter((i) => i !== 'bozo')) {
    const def = getFighter(id), St = MODELS3D[`sculpt:${id}`].face.style;
    assert.notEqual(painted(def, 'idle', undefined, St).join(';'), painted(def, 'idle').join(';'), `${id}'s design changes nothing`);
  }
});

test('the renderer hands each head its face design', () => {
  // index.js faceSlot builds the painter for a sculpted head; the style has
  // to go with the layout or the designs never reach the game
  const src = readFileSync(new URL('../src/engine/gl3d/index.js', import.meta.url), 'utf8');
  assert.match(src, /paintSculpted\(g, def, expression, F\.layout, F\.style\)/);
});

test('a portrait in its own frame comes in close on the face, and the cut-in keeps its framing', () => {
  // At GL3D.BUST.SPAN the head was a quarter of the portrait and the painted
  // features a few px across; the close framing at least a third larger.
  const { SPAN, HEAD_AT, CLOSE } = GL3D.BUST;
  assert.ok(SPAN / CLOSE.SPAN >= 1.3, `a portrait frames ${CLOSE.SPAN} rig px, hardly closer than ${SPAN}`);
  assert.ok(CLOSE.HEAD_AT[1] > HEAD_AT[1] && CLOSE.HEAD_AT[1] < 0.5, 'the closer head leaves no room for the hair, or none for the shoulders');
  // a framed portrait asks for it; the bare bust of the super's cut-in does not
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  assert.match(src('engine/drawFighter.js'), /close: !opts\.bare/);
  assert.match(src('engine/gl3d/index.js'), /close \? BUST\.CLOSE : BUST/);
  // and the cut-in centres its band on the head where the bare bust puts it
  assert.match(src('engine/vfx.js'), new RegExp(`size \\* ${HEAD_AT[1]}`));
});

// The teeth a recorded face draws: for each set, how much white shows (its
// height less its outline).
function teethIn(calls) {
  const y = (c) => +c.slice(c.indexOf('(') + 1, -1).split(',')[1];
  const out = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i] !== 'fillStyle=#eee5d6' || !calls[i + 2]?.startsWith('moveTo(') || !calls[i + 3]?.startsWith('quadraticCurveTo(0,')) continue;
    const k = calls.indexOf('stroke()', i);
    const lw = calls.slice(0, k).findLast((c) => c.startsWith('lineWidth='));
    out.push(y(calls[i + 5]) - y(calls[i + 3]) - +lw.split('=')[1]);
  }
  return out;
}

test('teeth show white, not a black slot, in every face that bares them', () => {
  // under a full outline they had under 2 px of white, so every grin and
  // snarl read as a gasp (the art review, 2026-11-06)
  let sets = 0;
  for (const id of Object.keys(SCULPTED)) {
    for (const expression of FACE_STATES) {
      for (const white of teethIn(painted(getFighter(id), expression, undefined, MODELS3D[`sculpt:${id}`].face.style))) {
        sets++;
        assert.ok(white >= 2, `${id}'s ${expression} teeth show ${white.toFixed(2)} px of white`);
      }
    }
  }
  assert.ok(sets >= 18, `only ${sets} sets of teeth drawn: the check is not finding them`);
});

test('a calm face does not glare: angry and blocking keep the mouth at rest and the eyes open', () => {
  // Scam, Lizbeth and Cathie are written as never glaring, and the super's
  // cut-in shows the angry face
  const calm = Object.keys(SCULPTED).filter((id) => MODELS3D[`sculpt:${id}`].face.style.calm);
  assert.deepEqual(calm.sort(), ['ava', 'eleanor', 'scam']);
  const scam = getFighter('scam'), St = MODELS3D['sculpt:scam'].face.style;
  const bare = (St, expression) => teethIn(painted(scam, expression, undefined, St)).length;
  for (const expression of ['angry', 'block']) {
    assert.equal(bare(St, expression), 0, `calm, Scam bares his teeth ${expression}`);
    assert.ok(bare({ ...St, calm: false }, expression) > 0, `the check sees no snarl ${expression} even uncalm`);
  }
  // still not the idle face: the brows draw in
  assert.notEqual(painted(scam, 'angry', undefined, St).join(';'), painted(scam, 'idle', undefined, St).join(';'));
});

test("a close portrait lightens a visor so the eyes behind it read, and a match keeps it", () => {
  // Lizbeth's stare is her character, and the visor hid it in every portrait;
  // in a match the strong cyan band is what marks her at fight size
  const glass = new Map([['lens', 0.84], ['clear', 0.14], ['visor', 0.45]]);
  const entry = { glass };
  const close = closeGlass(entry);
  assert.ok(close.get('visor') <= 0.3, `the portrait visor is ${close.get('visor')} opaque`);
  assert.equal(close.get('lens'), 0.84, 'shades are lightened too');
  assert.equal(glass.get('visor'), 0.45, "the match's visor changed");
  assert.equal(closeGlass(entry), close, 'worked out again on every portrait');
  const src = readFileSync(new URL('../src/engine/gl3d/index.js', import.meta.url), 'utf8');
  assert.match(src, /const glass = close \? closeGlass\(entry\) : undefined;/);
  assert.match(src, /glass: view\.glass \|\| entry\.glass/);
});
