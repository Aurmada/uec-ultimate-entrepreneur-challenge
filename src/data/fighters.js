// The default roster — original, fictional founders only.
// Each fighter: identity, palette, body styling, stats, and a signature special.
//
// Roster stats vary on purpose, but ONLY ever as AI opponents. Human players
// always get PLAYER_STATS, so nobody gains an edge from a cosmetic pick.

import { PLAYER_STATS, STYLES, BODY } from '../config.js';
import { SCHEMA_VERSION, DEFAULT_BODY, budgetCost } from './schema.js';
import { getPlayerMove, toCommandNormal } from './playerMoves.js';

export const SPECIALS = {
  pitchdeck: {
    id: 'pitchdeck',
    name: 'PITCH DECK STRIKE',
    icon: '📊',
    type: 'projectile',
    desc: 'Launches a volley of three razor-sharp pitch slides across the arena.',
    dmg: 8, count: 3, speed: 560, interval: 0.14, startup: 0.16, recovery: 0.34,
  },
  burnrate: {
    id: 'burnrate',
    name: 'BURN RATE BLAST',
    icon: '🔥',
    type: 'aoe',
    desc: 'Torches the runway in a point-blank inferno. Slow, brutal, close-range.',
    dmg: 22, reach: 150, startup: 0.30, active: 0.16, recovery: 0.42, kb: 460, kbUp: -260,
  },
  pivot: {
    id: 'pivot',
    name: 'PIVOT PUNCH',
    icon: '🔄',
    type: 'teleport',
    desc: 'Vanishes mid-strategy and reappears behind you — fist first.',
    dmg: 16, startup: 0.12, active: 0.10, recovery: 0.30, kb: 340, kbUp: -160,
  },
  growthhack: {
    id: 'growthhack',
    name: 'GROWTH HACK',
    icon: '📈',
    type: 'rush',
    desc: 'Goes viral: a hockey-stick rush of multiplying hits across the screen.',
    dmg: 5, hits: 4, hitInterval: 0.11, speed: 640, startup: 0.14, duration: 0.5, recovery: 0.3, kb: 140,
  },
  fundinground: {
    id: 'fundinground',
    name: 'FUNDING ROUND',
    icon: '💰',
    type: 'rain',
    desc: 'Makes it rain a punishing round of gold — and pockets energy on every hit.',
    dmg: 7, count: 3, startup: 0.24, recovery: 0.4, energyRefund: 8,
  },
  takeover: {
    id: 'takeover',
    name: 'HOSTILE TAKEOVER',
    icon: '🦈',
    type: 'grab',
    desc: 'An unblockable seizure of assets at close range. Jump to escape it.',
    dmg: 20, reach: 118, startup: 0.20, recovery: 0.55, kb: 520, kbUp: -300,
  },
  alignmentshift: {
    id: 'alignmentshift',
    name: 'ALIGNMENT SHIFT',
    icon: '⚖️',
    type: 'stance',
    desc: 'Toggles between SAFETY and CAPABILITIES. One survives; the other wins faster.',
    startup: 0.10, recovery: 0.18,
  },
};

export const UNICORN_META = {
  name: 'UNICORN MODE',
  icon: '🦄',
  desc: 'Full meter: ascend to mythical valuation for 6s — +35% damage, +25% speed, no chip damage. Fabulous.',
};

// hair: 'ponytail' | 'cap' | 'neat' | 'puffs' | 'bob' | 'slick'
// outfit: 'blazer' | 'hoodie' | 'turtleneck' | 'bomber' | 'suit' | 'pinstripe'
// HEIGHT IS CHARACTERISATION, and it is spent through `stride`.
//
// Leg length is FREE — the budget prices reach, height and build, because those
// change the hurtbox. Stride does not, so it is where a founder's stature can
// say something without anyone paying for it. Where a real height change was
// wanted (Cathie), `build` moves the other way so the hurtbox — and the price —
// is untouched.
//
// The ladder, tallest to shortest, and what each one is meant to tell you
// before the fighter has moved:
//
//   eleanor  she IS the range; you should see the reach before she uses it
//   elo      lanky and brittle, all height and no mass
//   max      not the tallest — the BIGGEST: tall AND the widest on the roster
//   kai      tall, all leg, unthreatening right up until it isn't
//   ava      deliberately, forgettably ordinary. That is the whole character
//   scam     soft and comfortable, slightly under average
//   bozo     the warehouse build: low, square, barrel-chested
//   dex      squat and short-armed, gets under you and stays there
//   zara     smallest and quickest, the hardest thing on stage to hit
export const FIGHTERS = [
  {
    id: 'ava', name: 'LIZBETH HOLMEZ', title: 'THE FRAUDSTER', company: 'THERAMOS',
    tagline: 'One drop of blood, $9B of lies, 11 years inside.',
    rap: 'Convicted · investor fraud',
    // FACE (render-only): The stare. She is the only fighter whose lids are RAISED — brows high
    // and flat, pupils wide, mouth a flat line. Unblinking conviction is the
    // whole parody; a glare would make her look like she knew she was lying.
    face: { BROW_Y: 10.5, BROW_TILT: -1.4, BROW_LEN: 6.2, LID_Y: 6.6, PUPIL_R: 3.6, MOUTH_W: 4.6, MOUTH_CURVE: 0 },
    // STANCE (render-only): Unnaturally still, and narrow. Hands clasped low and almost touching,
    // feet close, no sway at all — everyone else in this game shifts their
    // weight. The stillness IS the read.
    stance: { lean: 0.00, head: -4, armF: { x: 12, y: -122 }, armB: { x: 2, y: -120 },
      legF: { x: 10 }, legB: { x: -9 }, sy: 1.02 },
    // MOTION (render-only): Economical to the point of eerie. Barely coils, barely follows through,
    // no weight in the hips. Nothing about the motion admits effort.
    motion: { windup: 0.85, follow: 0.80, drop: 0, squash: 0.02, brace: 2, thrust: 1 },
    special: 'pivot', style: 'phantom',
    // An ordinary frame is the point. Slight AND untouchable is the
    // compounding pattern the budget exists to catch — giving her a real body
    // to hit is what pays for the speed, and it drops her out of the blocked band.
    body: { height: 1.04, build: 1.06, reach: 0.96, stride: 1.02, shoulders: 0.88, head: 1.02 },
    stats: { speed: 1.0, power: 1.0, hp: 100 },
    ai: { aggr: 0.55, jump: 0.3, prefRange: 'far' },
    c: { skin: '#e8b48c', suit: '#5865f2', suit2: '#3d47c9', accent: '#29d9ff', hair: '#e8dcc0', pants: '#23294f', shoe: '#eef1ff' },
    hairStyle: 'ponytail', outfit: 'blazer', accessory: 'visor',
    // The demo that was never real. She presents; swing at her during it and
    // it turns out the machine was doing nothing all along, and it goes back
    // at you. A stance rather than a swing, which is why it is priced as one.
    commandNormals: [
      {
        slot: 'fwd+slap', archetype: 'counter', displayName: 'THE DEMO',
        tags: ['counter'],
        frameData: { startup: 0.044, active: 0.06, recovery: 0.21, dmg: 4, reach: 78 },
        params: { window: 0.16, dmg: 6, kb: 240 },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // ava — LIZBETH HOLMEZ, THERAMOS. The sample vial, worn at the hip.
      { id: 'vial', shape: 'capsule', anchor: 'hip', dx: -34, dy: 2,
        w: 22, h: 58, fill: 'accent', z: 'front' },
    ],
  },
  {
    id: 'max', name: 'ADAM WEUMANN', title: 'THE BURNER', company: 'WEWERK',
    tagline: 'Torched $47B, kept the jet, blamed the vibes.',
    rap: 'Ousted · $47B evaporated',
    // FACE (render-only): Manic. Brows up and apart, eyes wide, mouth wide and loose — a man
    // enjoying the fire. The only face in the cast with any lift in the mouth.
    face: { BROW_Y: 10, BROW_TILT: -2.6, BROW_LEN: 5, LID_Y: 6, PUPIL_R: 3.2, MOUTH_W: 7, MOUTH_CURVE: 2.6 },
    // STANCE (render-only): The widest base in the roster, arms hanging well outside the body, slouched
    // back on the hips. A man who has never once been asked to stand up straight.
    stance: { hip: 6, lean: 0.12, armF: { x: 46, y: -118 }, armB: { x: -34, y: -120 },
      legF: { x: 32 }, legB: { x: -31 }, sx: 1.06, swayX: 2.2, swayRate: 1.6 },
    // MOTION (render-only): All wind-up and no control — the deepest coil in the cast and a follow
    // through that keeps going after the hit has landed.
    motion: { windup: 1.35, follow: 1.30, drop: 7, squash: 0.10, brace: 12, thrust: 5 },
    special: 'burnrate', style: 'brawler',
    // Wide as a doorway and built low. Reads as the biggest thing on stage.
    body: { height: 1.16, build: 1.00, reach: 1.02, stride: 1.13, shoulders: 1.25, head: 0.92 },
    stats: { speed: 0.95, power: 1.2, hp: 95 },
    ai: { aggr: 0.85, jump: 0.35, prefRange: 'close' },
    c: { skin: '#c68a5a', suit: '#ff7a1a', suit2: '#d15505', accent: '#ffd23f', hair: '#3b2a1c', pants: '#33241d', shoe: '#f5f5f5' },
    hairStyle: 'cap', outfit: 'hoodie', accessory: 'stubble',
    // Growth at any cost, in one direction, until the money runs out. A
    // brawler's rush: slow to start and fully committed once it goes, so
    // whiffing it is genuinely punishing.
    commandNormals: [
      {
        slot: 'fwd+punch', archetype: 'rush', displayName: 'BLITZSCALE',
        // `punish`, not `gapCloser`: he is a close-range brawler who sits at
        // ~100px, and a gapCloser only fits beyond 150 — so the tag alone
        // decided the move could never come out. Tags are AI range policy,
        // not flavour.
        tags: ['punish'],
        frameData: { startup: 0.075, active: 0.06, recovery: 0.13, dmg: 9, reach: 84 },
        params: { hits: 3, hitInterval: 0.10, speed: 560, duration: 0.42, kb: 130 },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // max — ADAM WEUMANN, WEWERK. The rolled mat across the back.
      // `shoe` (#f5f5f5), not suit2 (#d15505) — dark orange on a #ff7a1a suit,
      // behind the widest body in the cast, drew 149px and read as nothing.
      // Wider and pushed clear of the shoulder so it actually leaves the outline.
      { id: 'mat', shape: 'capsule', anchor: 'shoulder', dx: -36, dy: 30,
        w: 22, h: 86, rot: 0.35, fill: 'shoe', z: 'behind' },
    ],
  },
  {
    id: 'kai', name: 'STEVE NOJOBS', title: 'THE VAPORWARE PROPHET', company: 'PEAR',
    tagline: 'Demoed a product that never existed. Twice.',
    rap: 'Sued · shipped nothing',
    // FACE (render-only): The showman: heavy lids, level brows, a small knowing mouth. Not angry,
    // just certain you will buy it.
    face: { BROW_Y: 7.6, BROW_TILT: 1.2, BROW_LEN: 5.8, LID_Y: 3.2, PUPIL_R: 2.2, MOUTH_W: 5, MOUTH_CURVE: 0.8 },
    // STANCE (render-only): Mid-presentation: front arm out and high showing you the thing, back hand up
    // at the chest. Chest open, weight tall. He is not guarding, he is pitching.
    stance: { lean: -0.10, head: -3, armF: { x: 52, y: -172 }, armB: { x: 6, y: -166 },
      legF: { x: 14 }, legB: { x: -13 }, sy: 1.02 },
    // MOTION (render-only): Theatrical. Big telegraphed coil, and he holds the finish a beat too long,
    // because the swing is a demo and the demo needs an audience.
    motion: { windup: 1.25, follow: 1.20, drop: 3, squash: 0.06, brace: 9, thrust: 3 },
    special: 'pitchdeck', style: 'showman',
    // All leg and no shoulder — the keynote posture, tall and unthreatening
    // right up until it isn't.
    body: { height: 1.06, build: 0.98, reach: 1.00, stride: 1.06, shoulders: 0.92, head: 0.96 },
    stats: { speed: 1.15, power: 0.9, hp: 95 },
    ai: { aggr: 0.6, jump: 0.55, prefRange: 'mid' },
    // The keynote drift: the presenting hand rises like he is about to say
    // "one more thing", then settles.
    animOverrides: {
      idle: [
        { t: 0,   joints: { hipY: -66, headX: 0, armF: { x: 30, y: -98 } } },
        { t: 0.4, joints: { hipY: -62, headX: 2, armF: { x: 37, y: -106 } }, ease: 'inOutCubic' },
        { t: 1,   joints: { hipY: -66, headX: 0, armF: { x: 30, y: -98 } }, ease: 'inOutCubic' },
      ],
    },
    c: { skin: '#f0c896', suit: '#1fb9a5', suit2: '#128372', accent: '#eef1ff', hair: '#8a8f9c', pants: '#20263f', shoe: '#dfe4ff' },
    hairStyle: 'quiff', outfit: 'turtleneck', accessory: 'glasses',
    // "One more thing" — he leaves the stage mid-sentence and is behind you.
    // On the anti-air slot, because the keynote always ends above your head.
    commandNormals: [
      {
        slot: 'fwd+launch', archetype: 'teleport', displayName: 'ONE MORE THING',
        tags: ['gapCloser'],
        frameData: { startup: 0.07, active: 0.10, recovery: 0.33, dmg: 11, reach: 74, kbUp: -300 },
        params: { dmg: 11, kb: 300, kbUp: -200 },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // kai — STEVE NOJOBS, PEAR. The device, held out in the rear hand.
      { id: 'device', shape: 'roundRect', anchor: 'armB', dx: 0, dy: 0,
        w: 20, h: 34, fill: 'accent', z: 'front' },
    ],
  },
  {
    id: 'zara', name: 'KIM KOINDASHIAN', title: 'THE RUG-PULLER', company: 'SKIMZCOIN',
    tagline: 'Shilled the coin, dumped the bag, deleted the post.',
    rap: 'Fined · undisclosed promo',
    // FACE (render-only): Bored of you. The heaviest lids in the game, flat brows, a tiny mouth —
    // contempt costs less effort than anger.
    face: { BROW_Y: 7, BROW_TILT: 0.4, BROW_LEN: 5.2, LID_Y: 2.4, PUPIL_R: 2.0, MOUTH_W: 4, MOUTH_CURVE: -0.6 },
    // STANCE (render-only): The most compact outline here, and now a real peek-a-boo guard — both
    // fists up BESIDE the head, so the skull is flanked rather than bare. Two
    // symmetrical bumps at head height is a shape nothing else in the cast makes.
    stance: { hip: 4, lean: 0.16, armF: { x: 18, y: -182 }, armB: { x: 1, y: -178 },
      legF: { x: 13 }, legB: { x: -12 }, sx: 0.97 },
    // MOTION (render-only): Snap. The shortest wind-up and the fastest reset in the game — the hand is
    // back before you have registered it left.
    motion: { windup: 0.75, follow: 0.70, drop: 2, squash: 0.05, brace: 4, thrust: 2 },
    special: 'growthhack', style: 'rushdown',
    // Small and light with an oversized head — reads young and quick, and
    // the smaller hurtbox is what her budget pays for.
    body: { height: 0.90, build: 0.92, reach: 0.96, stride: 0.88, shoulders: 0.90, head: 1.11 },
    stats: { speed: 1.1, power: 0.95, hp: 95 },
    ai: { aggr: 0.75, jump: 0.5, prefRange: 'mid' },
    // Pump it, then pull the floor out. PUMP launches so she can juggle;
    // RUG PULL denies the ground she just knocked you onto. Both pay for
    // themselves with slower startup than her neutral buttons.
    commandNormals: [
      {
        slot: 'fwd+punch', archetype: 'strike', displayName: 'PUMP',
        tags: ['launcher'],
        frameData: {
          startup: 0.0625, active: 0.06, recovery: 0.1265,
          dmg: 8, reach: 78, hitY: -120, kb: 90, kbUp: -400, stun: 0.3,
        },
      },
      {
        slot: 'fwd+kick', archetype: 'trap', displayName: 'RUG PULL',
        tags: ['trap'],
        frameData: { startup: 0.115, active: 0.09, recovery: 0.187, dmg: 12, reach: 60 },
        params: { lifetime: 5.5, radius: 78, armTime: 0.35, dmg: 12, maxActive: 1 },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // zara — KIM KOINDASHIAN, SKIMZCOIN. The ring light haloing the head.
      { id: 'ringlight', shape: 'ellipse', anchor: 'head', dx: 0, dy: -4,
        r: 34, fill: 'accent', z: 'behind' },
    ],
    // Restless: two bounces per breath, never quite still.
    animOverrides: {
      idle: [
        { t: 0,    joints: { hipY: -66, headY: -134, armF: { x: 30, y: -98 }, armB: { x: 18, y: -90 } } },
        { t: 0.25, joints: { hipY: -71, headY: -140, armF: { x: 31, y: -103 }, armB: { x: 19, y: -95 } }, ease: 'outQuad' },
        { t: 0.5,  joints: { hipY: -64, headY: -132, armF: { x: 30, y: -96 }, armB: { x: 18, y: -88 } }, ease: 'inQuad' },
        { t: 0.75, joints: { hipY: -70, headY: -139, armF: { x: 31, y: -102 }, armB: { x: 19, y: -94 } }, ease: 'outQuad' },
        { t: 1,    joints: { hipY: -66, headY: -134, armF: { x: 30, y: -98 }, armB: { x: 18, y: -90 } }, ease: 'inQuad' },
      ],
    },
    c: { skin: '#8a5a3b', suit: '#e332a9', suit2: '#a91277', accent: '#57ff8a', hair: '#0d0a12', pants: '#2c1a3d', shoe: '#57ff8a' },
    hairStyle: 'puffs', outfit: 'bomber', accessory: 'earrings',
  },
  {
    id: 'eleanor', name: 'CATHIE WOODZ', title: 'THE TRUE BELIEVER', company: 'ARKK CAPITAL',
    tagline: 'Bought every dip on the way to zero. Still bullish.',
    rap: 'Down 80% · still posting',
    // FACE (render-only): Serene. The one face in the cast that is not glaring: soft raised brows,
    // open eyes, a level mouth. Absolute faith reads as calm, not aggression.
    face: { BROW_Y: 9.6, BROW_TILT: -0.8, BROW_LEN: 5.4, LID_Y: 5.4, PUPIL_R: 2.9, MOUTH_W: 5.4, MOUTH_CURVE: 0.4 },
    // STANCE (render-only): The only symmetrical stance in the game: upright, feet together, both hands
    // open at the waist, breathing slowly. Serenity reads as verticality.
    stance: { hip: -4, head: -4, lean: -0.02, armF: { x: 26, y: -134 }, armB: { x: -18, y: -134 },
      legF: { x: 10 }, legB: { x: -10 }, sy: 1.05, swayY: 1.1, swayRate: 1.3 },
    // MOTION (render-only): Smooth and level. Nothing is thrown, everything is placed; the hips barely
    // move because she never overcommits to anything.
    motion: { windup: 1.00, follow: 0.95, drop: 1, squash: 0.03, brace: 5, thrust: 2 },
    special: 'fundinground', style: 'zoner',
    // Tall, narrow, and longer in the arm than anyone. The silhouette IS
    // the zoning — you can see the range before she uses it.
    body: { height: 1.2, build: 0.89, reach: 1.06, stride: 1.18, shoulders: 0.88, head: 0.94 },
    stats: { speed: 0.9, power: 1.05, hp: 105 },
    ai: { aggr: 0.65, jump: 0.2, prefRange: 'far' },
    // Almost motionless. The stillness is the threat — she is waiting for you
    // to walk into the range she already has.
    animOverrides: {
      idle: [
        { t: 0,   joints: { hipY: -66, armF: { x: 30, y: -98 } } },
        { t: 0.5, joints: { hipY: -65, armF: { x: 31, y: -96 } }, ease: 'inOutCubic' },
        { t: 1,   joints: { hipY: -66, armF: { x: 30, y: -98 } }, ease: 'inOutCubic' },
      ],
    },
    c: { skin: '#f2cdb2', suit: '#1c2a5e', suit2: '#111a3d', accent: '#ffd23f', hair: '#f2ece0', pants: '#141d42', shoe: '#1a1a24' },
    hairStyle: 'bob', outfit: 'suit', accessory: 'brooch',
    // Buying the dip, forever, on the way down. Two rounds of conviction
    // landing on your head — and like her special, it pays her back a little.
    commandNormals: [
      {
        slot: 'fwd+launch', archetype: 'rain', displayName: 'CONVICTION BUY',
        tags: ['ranged'],
        frameData: { startup: 0.095, active: 0.10, recovery: 0.35, dmg: 6, reach: 74 },
        params: { dmg: 5, count: 2, energyRefund: 4 },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // eleanor — CATHIE WOODZ, ARKK. The tablet, chart out.
      // `accent`, not `suit2`: her suit2 is #111a3d against a #1c2a5e suit, so
      // the first version was dark navy on dark navy and vanished.
      { id: 'tablet', shape: 'roundRect', anchor: 'armB', dx: 20, dy: -10,
        w: 34, h: 46, rot: -0.2, fill: 'accent', z: 'front' },
      // A coat, and the first use of cloth lag: it trails the hips and settles.
      //
      // `hair` (#f2ece0), not `suit2`. suit2 is #111a3d against a #1c2a5e suit
      // AND a dark navy arena — dark on dark twice over, and it vanished. A
      // garment behind the body cannot rely on shape alone when the backdrop is
      // the same value as the fighter. The cream reads as a long coat over the
      // suit, which is also more the part.
      // It must also FLARE past the body. Drawn behind, a 44px-wide coat is
      // entirely covered by the legs; only a hem wider than the silhouette
      // actually reads as a coat.
      { id: 'coat', shape: 'path', anchor: 'hip', dx: 0, dy: -6,
        pts: [[-18, 0], [18, 0], [40, 74], [-40, 74]],
        fill: 'hair', z: 'behind', follow: 0.35 },
    ],
  },
  {
    id: 'dex', name: 'CARL ICAHNT', title: 'THE ASSET STRIPPER', company: 'ICAHNT HOLDINGS',
    tagline: 'Bought it, gutted it, sold the parts, kept the jet.',
    rap: 'Hostile · 12 companies dismantled',
    // FACE (render-only): Predator. Lowest, heaviest brow, eyes down to slits, mouth a thin hard
    // line. He is already valuing the parts of you.
    face: { BROW_Y: 6.2, BROW_TILT: 5.4, BROW_LEN: 6.4, BROW_W: 4.0, LID_Y: 2.0, LID_W: 3.0, PUPIL_R: 1.6, MOUTH_W: 6.4, MOUTH_CURVE: -2.2 },
    // STANCE (render-only): Hunched forward over a wide low base, shoulders up, chin down, both hands
    // out in front at chest height — already reaching for the parts of you.
    stance: { hip: 8, shoulder: 6, head: 10, lean: 0.20, armF: { x: 44, y: -142 }, armB: { x: 26, y: -138 },
      legF: { x: 28 }, legB: { x: -27 }, sx: 1.04, sy: 0.96 },
    // MOTION (render-only): The heaviest motion here. Coils deep, drops his whole weight onto the hit,
    // and takes his time coming back up. Nothing about it is quick.
    motion: { windup: 1.30, follow: 1.25, drop: 10, squash: 0.12, brace: 14, thrust: 6 },
    special: 'takeover', style: 'grappler',
    // Squat, enormous across the shoulders, short in the leg. A fireplug —
    // nothing about him says he can reach you, which is the honest advert.
    body: { height: 0.94, build: 1.08, reach: 0.98, stride: 0.9, shoulders: 1.25, head: 1.06 },
    stats: { speed: 0.85, power: 1.25, hp: 110 },
    ai: { aggr: 0.8, jump: 0.15, prefRange: 'close' },
    // A raider takes what he can reach. ASSET SEIZURE is unblockable and hits
    // hard, and buys that with a short grasp and a slow, punishable wind-up —
    // walk into him and you lose the asset; keep him out and he has nothing.
    commandNormals: [
      {
        slot: 'fwd+kick', archetype: 'grab', displayName: 'ASSET SEIZURE',
        tags: ['command-grab'],
        frameData: {
          startup: 0.13, active: 0.08, recovery: 0.204,
          dmg: 16, reach: 70, hitY: -95, kb: 300, kbUp: -180, stun: 0.34,
        },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // dex — CARL ICAHNT. The briefcase he never puts down.
      { id: 'case', shape: 'roundRect', anchor: 'armB', dx: 18, dy: 26,
        w: 44, h: 34, fill: '#6b4a2b', z: 'front' },
    ],
    // A slow, heavy shift of weight. He does not fidget — he waits.
    animOverrides: {
      idle: [
        { t: 0,   joints: { hipY: -66, armF: { x: 30, y: -98 }, armB: { x: 18, y: -90 } } },
        { t: 0.5, joints: { hipY: -60, armF: { x: 33, y: -92 }, armB: { x: 21, y: -84 } }, ease: 'inOutCubic' },
        { t: 1,   joints: { hipY: -66, armF: { x: 30, y: -98 }, armB: { x: 18, y: -90 } }, ease: 'inOutCubic' },
      ],
    },
    c: { skin: '#d9a06b', suit: '#4a4038', suit2: '#191b23', accent: '#ff3d6e', hair: '#b9bec9', pants: '#22242e', shoe: '#101116' },
    hairStyle: 'slick', outfit: 'pinstripe', accessory: 'shades',
  },
  // ---- cameo tier: 100% parody, 0% affiliation ----
  {
    id: 'elo', name: 'ELO MA', title: 'THE TECHNOKING', company: 'SPACEY-X',
    tagline: 'Bought the platform, torched the value, called it free speech.',
    rap: 'Sued · $44B writedown',
    // FACE (render-only): Thin-skinned. Brows up in permanent grievance, small mouth, eyes that
    // are certain they are the smartest thing on the stage.
    face: { BROW_Y: 9.2, BROW_TILT: -1.8, BROW_LEN: 4.8, LID_Y: 4.6, PUPIL_R: 2.6, MOUTH_W: 4.4, MOUTH_CURVE: -0.4 },
    // STANCE (render-only): Arms folded across the chest — the one crossed silhouette in the cast, and
    // unmistakable at any distance. Chin up, weight back, entirely unimpressed.
    stance: { lean: -0.06, head: -2, armF: { x: -10, y: -140 }, armB: { x: 16, y: -138 },
      legF: { x: 14 }, legB: { x: -13 }, elbowF: 30, elbowB: -30 },
    // MOTION (render-only): Whippy and erratic — a huge wind-up snapped back almost instantly, which is
    // how you get power out of no mass and why he is so punishable.
    motion: { windup: 1.20, follow: 0.75, drop: 3, squash: 0.08, brace: 10, thrust: 4 },
    special: 'burnrate', style: 'glass',
    // Tall and ordinary through the middle. GLASS CANNON is already the most
    // over-budget style shipped, so the frame has to be a real target.
    body: { height: 1.18, build: 0.96, reach: 1.00, stride: 1.18, shoulders: 0.86, head: 0.90 },
    stats: { speed: 1.05, power: 1.15, hp: 100 },
    ai: { aggr: 0.82, jump: 0.4, prefRange: 'close' },
    c: { skin: '#eec9a6', suit: '#1a1c24', suit2: '#0e0f15', accent: '#ff3d2e', hair: '#5a3a22', pants: '#1a1c24', shoe: '#c9ced9' },
    hairStyle: 'buzz', outfit: 'tee', accessory: null, cameo: true,
    // The rocket that does not make it to orbit. A point-blank blast from a
    // glass cannon: it hurts, and standing there to throw it is the price.
    commandNormals: [
      {
        slot: 'fwd+kick', archetype: 'aoe', displayName: 'PLATFORM BURN',
        tags: ['punish'],
        frameData: { startup: 0.14, active: 0.09, recovery: 0.24, dmg: 14, reach: 118 },
        params: { reach: 118, kb: 300, kbUp: -140 },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // elo — ELO MA, SPACEY-X. The booster on the back.
      { id: 'booster', shape: 'capsule', anchor: 'shoulder', dx: -22, dy: 34,
        w: 20, h: 74, fill: 'accent', z: 'behind' },
    ],
  },
  {
    id: 'bozo', name: 'JEFF BOZO', title: 'THE EVERYTHING GUY', company: 'PRIMEZON',
    tagline: 'Your margin is his opportunity. Your warehouse is his gym.',
    rap: 'Antitrust · under investigation',
    // FACE (render-only): The winner's face: hard flat brows, narrow eyes, a wide set jaw. Nothing
    // about it is worried, because nothing about it has ever had to be.
    face: { BROW_Y: 7.2, BROW_TILT: 2.8, BROW_LEN: 6.0, BROW_W: 3.6, LID_Y: 2.8, PUPIL_R: 2.1, MOUTH_W: 7.2, MOUTH_CURVE: 1.2 },
    // STANCE (render-only): Hands on the hips, elbows out wide. The only stance whose outline has holes
    // in it, which makes it the easiest of all nine to recognise as a shape.
    stance: { lean: -0.04, shoulder: -3, armF: { x: 34, y: -104 }, armB: { x: -30, y: -104 },
      legF: { x: 20 }, legB: { x: -19 }, sx: 1.03, elbowF: -34, elbowB: 34 },
    // MOTION (render-only): Efficient. Compact coil, real weight through the hip, crisp return. The
    // motion of someone who has optimised this and knows the numbers.
    motion: { windup: 0.90, follow: 0.85, drop: 4, squash: 0.05, brace: 6, thrust: 3 },
    special: 'takeover', style: 'technical',
    // Compact and barrel-chested with short arms — the warehouse build.
    body: { height: 0.92, build: 1.14, reach: 0.90, stride: 0.92, shoulders: 1.20, head: 1.12 },
    stats: { speed: 0.9, power: 1.2, hp: 108 },
    ai: { aggr: 0.75, jump: 0.2, prefRange: 'close' },
    c: { skin: '#e2ab84', suit: '#1f4a56', suit2: '#141f2c', accent: '#ff9d1a', hair: '#101116', pants: '#2c3644', shoe: '#3d4a5c' },
    hairStyle: 'bald', outfit: 'vest', accessory: 'shades', cameo: true,
    // Undercutting, in both senses: a low sweep from the man whose whole
    // strategy is going under everyone else's price.
    commandNormals: [
      {
        slot: 'fwd+kick', archetype: 'strike', displayName: 'UNDERCUT',
        tags: ['low'],
        frameData: { startup: 0.095, active: 0.08, recovery: 0.19, dmg: 11, reach: 100, hitY: -46, kb: 240 },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // bozo — JEFF BOZO, PRIMEZON. The parcel under the rear arm.
      { id: 'parcel', shape: 'roundRect', anchor: 'armB', dx: -6, dy: 6,
        w: 38, h: 30, rot: 0.15, fill: 'hair', z: 'front' },
    ],
  },
  {
    id: 'scam', name: 'SCAM ALT', title: 'THE ALIGNMENT GUY', company: 'CLOSEDAI',
    tagline: 'Fired by the board on Friday, back by Wednesday.',
    rap: 'Ousted · reinstated · unbothered',
    // FACE (render-only): Reasonable. Deliberately the mildest face here — soft brows, neutral
    // eyes, small even mouth. The unreadable one is the point.
    face: { BROW_Y: 8.4, BROW_TILT: 0.6, BROW_LEN: 5.0, LID_Y: 4.4, PUPIL_R: 2.5, MOUTH_W: 5.0, MOUTH_CURVE: 0.2 },
    // STANCE (render-only): One hand stays in the pocket; the other comes up open-palmed at chest
    // height — the placating gesture of a man explaining why it was fine. That
    // asymmetric bump is the whole read, and it is the opposite of Kim's guard.
    stance: { lean: 0.04, headX: 3, shoulder: -2, armF: { x: 30, y: -146 }, armB: { x: -10, y: -104 },
      legF: { x: 16 }, legB: { x: -12 }, elbowF: -22 },
    // MOTION (render-only): Understated on the way in and lingering on the way out — it reads as less
    // than it was until it has already happened to you.
    motion: { windup: 0.85, follow: 1.05, drop: 2, squash: 0.04, brace: 5, thrust: 2 },
    special: 'alignmentshift', style: 'trickster',
    // Soft and unbothered — the man who was fired on Friday and back by
    // Wednesday does not look worried. TRICKSTER is expensive, so the comfort
    // is also what pays for it.
    body: { height: 0.98, build: 1.14, reach: 0.96, stride: 0.94, shoulders: 1.08, head: 1.08 },
    stats: { speed: 1.1, power: 0.9, hp: 96 },
    ai: { aggr: 0.6, jump: 0.5, prefRange: 'mid' },
    c: { skin: '#ecc39e', suit: '#6d7382', suit2: '#4a4f5c', accent: '#29d9ff', hair: '#7a5230', pants: '#2c3040', shoe: '#f0f0f0' },
    hairStyle: 'curly', outfit: 'henley', accessory: null, cameo: true,
    // Safety memos, thrown at speed. He spaces at ~210px, which is why this is
    // tagged for that band rather than for true zoning range — a tag the AI
    // never reaches is a move that does not exist.
    commandNormals: [
      {
        slot: 'fwd+slap', archetype: 'projectile', displayName: 'SAFETY MEMO',
        tags: ['gapCloser'],
        frameData: { startup: 0.07, active: 0.06, recovery: 0.17, dmg: 6, reach: 78 },
        params: { count: 2, speed: 520, interval: 0.12 },
      },
    ],
    // The block guard, formerly a hardcoded draw call. Universal: every founder
    // raises one. Anchored to the front hand so it tracks the guard pose.
    parts: [
      { id: 'guard-case', shape: 'roundRect', anchor: 'armF', dx: 8, dy: 52,
        w: 40, h: 32, fill: '#6b4a2b', z: 'front', states: ['block'] },
      // scam — SCAM ALT, CLOSEDAI. A single enormous paperclip. He knows what he did.
      // A hairpin OUTLINE, not a centreline. blob() fills the polygon, so the
      // first version — which traced the wire of a paperclip — filled to 118
      // visible pixels and read as nothing at all.
      { id: 'clip', shape: 'path', anchor: 'shoulder', dx: -46, dy: -4,
        pts: [[0,0],[22,0],[22,66],[14,66],[14,9],[8,9],[8,66],[0,66]],
        fill: 'shoe', z: 'behind' },
    ],
  },
];

// ---- BASE CHARACTERS ----------------------------------------------------
// Generic, unbranded silhouettes for the "build your fighter" flow. These are
// the bodies players pick from (NOT the famous-founder roster). Varied skin
// tones, hairstyles and outfits so everyone finds a starting point that fits.
export const BASE_CHARACTERS = [
  { id: 'b-neo',   name: 'THE FOUNDER',   base: true, special: 'pitchdeck', style: 'balanced',
    stats: { speed: 1.0, power: 1.0, hp: 100 }, ai: { aggr: 0.6, jump: 0.35, prefRange: 'mid' },
    c: { skin: '#f0c896', suit: '#5865f2', suit2: '#3d47c9', accent: '#29d9ff', hair: '#2a2320', pants: '#23294f', shoe: '#eef1ff' },
    hairStyle: 'neat', outfit: 'blazer', accessory: 'glasses' },
  { id: 'b-hack',  name: 'THE HACKER',    base: true, special: 'growthhack',
    stats: { speed: 1.15, power: 0.9, hp: 95 }, ai: { aggr: 0.7, jump: 0.5, prefRange: 'mid' },
    c: { skin: '#e8b48c', suit: '#2ee66b', suit2: '#1a9c46', accent: '#0b0e1a', hair: '#191a22', pants: '#20242f', shoe: '#d9ffe6' },
    hairStyle: 'ponytail', outfit: 'hoodie', accessory: null },
  { id: 'b-growth', name: 'THE OPERATOR',  base: true, special: 'fundinground',
    stats: { speed: 1.05, power: 1.0, hp: 100 }, ai: { aggr: 0.72, jump: 0.4, prefRange: 'mid' },
    c: { skin: '#8a5a3b', suit: '#e332a9', suit2: '#a91277', accent: '#ffd23f', hair: '#1c1424', pants: '#2c1a3d', shoe: '#ffd23f' },
    hairStyle: 'puffs', outfit: 'bomber', accessory: 'earrings' },
  { id: 'b-closer', name: 'THE CLOSER',    base: true, special: 'takeover',
    stats: { speed: 0.9, power: 1.2, hp: 108 }, ai: { aggr: 0.8, jump: 0.18, prefRange: 'close' },
    c: { skin: '#d9a06b', suit: '#1c2a5e', suit2: '#111a3d', accent: '#ff3d6e', hair: '#101116', pants: '#141d42', shoe: '#101116' },
    hairStyle: 'slick', outfit: 'pinstripe', accessory: 'shades' },
  { id: 'b-design', name: 'THE DESIGNER',  base: true, special: 'pivot',
    stats: { speed: 1.1, power: 0.95, hp: 96 }, ai: { aggr: 0.62, jump: 0.5, prefRange: 'mid' },
    c: { skin: '#f2cdb2', suit: '#7b5cff', suit2: '#5a3fd6', accent: '#ff9df3', hair: '#3a2a20', pants: '#2a2340', shoe: '#f0eaff' },
    hairStyle: 'bob', outfit: 'turtleneck', accessory: null },
  { id: 'b-builder', name: 'THE BUILDER',  base: true, special: 'burnrate',
    stats: { speed: 0.95, power: 1.15, hp: 102 }, ai: { aggr: 0.82, jump: 0.3, prefRange: 'close' },
    c: { skin: '#7a4a30', suit: '#ff7a1a', suit2: '#d15505', accent: '#ffd23f', hair: '#12100e', pants: '#2a2018', shoe: '#f5f5f5' },
    hairStyle: 'curly', outfit: 'henley', accessory: null },
  { id: 'b-intern', name: 'THE INTERN',    base: true, special: 'growthhack',
    stats: { speed: 1.1, power: 0.9, hp: 94 }, ai: { aggr: 0.6, jump: 0.55, prefRange: 'mid' },
    c: { skin: '#eec9a6', suit: '#29d9ff', suit2: '#1893b3', accent: '#ff3d6e', hair: '#2a2118', pants: '#20263f', shoe: '#ffffff' },
    hairStyle: 'short', outfit: 'tee', accessory: null },
  { id: 'b-shark',  name: 'THE SHARK',     base: true, special: 'fundinground',
    stats: { speed: 0.9, power: 1.1, hp: 105 }, ai: { aggr: 0.68, jump: 0.2, prefRange: 'far' },
    c: { skin: '#c99a6a', suit: '#0f5f57', suit2: '#0a3f3a', accent: '#ffd23f', hair: '#efe6d8', pants: '#0d3a35', shoe: '#1a1a24' },
    hairStyle: 'bald', outfit: 'vest', accessory: 'shades' },
  { id: 'b-vc',     name: 'THE INVESTOR',  base: true, special: 'fundinground',
    stats: { speed: 0.95, power: 1.05, hp: 104 }, ai: { aggr: 0.6, jump: 0.25, prefRange: 'far' },
    c: { skin: '#f5d9bf', suit: '#3a4a6e', suit2: '#232f4a', accent: '#ffd23f', hair: '#5a4632', pants: '#1c2438', shoe: '#12161f' },
    hairStyle: 'slick', outfit: 'suit', accessory: 'brooch' },
  { id: 'b-ceo',    name: 'THE CHIEF',     base: true, special: 'takeover',
    stats: { speed: 0.9, power: 1.2, hp: 110 }, ai: { aggr: 0.78, jump: 0.2, prefRange: 'close' },
    c: { skin: '#5c3620', suit: '#8a1f3d', suit2: '#5e1228', accent: '#ffd23f', hair: '#0c0a08', pants: '#241016', shoe: '#0c0a08' },
    hairStyle: 'bald', outfit: 'blazer', accessory: 'glasses' },
  { id: 'b-maker',  name: 'THE MAKER',     base: true, special: 'burnrate',
    stats: { speed: 1.0, power: 1.1, hp: 100 }, ai: { aggr: 0.78, jump: 0.35, prefRange: 'close' },
    c: { skin: '#b87a4a', suit: '#d94f2a', suit2: '#a5341a', accent: '#ffd23f', hair: '#1a1410', pants: '#2c211a', shoe: '#e8e8e8' },
    hairStyle: 'cap', outfit: 'tee', accessory: 'stubble' },
  { id: 'b-scout',  name: 'THE SCOUT',     base: true, special: 'pitchdeck',
    stats: { speed: 1.1, power: 0.92, hp: 96 }, ai: { aggr: 0.66, jump: 0.5, prefRange: 'mid' },
    c: { skin: '#ecc39e', suit: '#12b3a6', suit2: '#0a7d73', accent: '#ff9df3', hair: '#2a1c12', pants: '#123a37', shoe: '#dffbf7' },
    hairStyle: 'puffs', outfit: 'turtleneck', accessory: 'earrings' },
  { id: 'b-angel',  name: 'THE ANGEL',     base: true, special: 'pivot',
    stats: { speed: 1.05, power: 1.0, hp: 100 }, ai: { aggr: 0.64, jump: 0.45, prefRange: 'mid' },
    c: { skin: '#caa06f', suit: '#e8b93f', suit2: '#b98c14', accent: '#29d9ff', hair: '#20180f', pants: '#3a2c14', shoe: '#fff6d9' },
    hairStyle: 'bob', outfit: 'blazer', accessory: 'visor' },
  { id: 'b-punk',   name: 'THE DISRUPTOR', base: true, special: 'growthhack',
    stats: { speed: 1.18, power: 0.9, hp: 94 }, ai: { aggr: 0.8, jump: 0.55, prefRange: 'mid' },
    c: { skin: '#8a5a3b', suit: '#ff2e88', suit2: '#c40f5e', accent: '#0b0e1a', hair: '#151018', pants: '#241420', shoe: '#ff2e88' },
    hairStyle: 'ponytail', outfit: 'bomber', accessory: 'shades' },
  { id: 'b-sage',   name: 'THE ADVISOR',   base: true, special: 'pitchdeck',
    stats: { speed: 0.92, power: 1.08, hp: 104 }, ai: { aggr: 0.6, jump: 0.2, prefRange: 'far' },
    c: { skin: '#6e4326', suit: '#4a4f5c', suit2: '#2f333d', accent: '#57ff8a', hair: '#d8d2c8', pants: '#26292f', shoe: '#f0f0f0' },
    hairStyle: 'short', outfit: 'henley', accessory: 'glasses' },
  { id: 'b-nomad',  name: 'THE NOMAD',     base: true, special: 'pivot',
    stats: { speed: 1.12, power: 0.95, hp: 97 }, ai: { aggr: 0.68, jump: 0.5, prefRange: 'mid' },
    c: { skin: '#e2b98c', suit: '#7b5cff', suit2: '#5637c2', accent: '#ffd23f', hair: '#2c2018', pants: '#2a2340', shoe: '#efeaff' },
    hairStyle: 'curly', outfit: 'vest', accessory: null },
];

const ALL_BY_ID = new Map([...FIGHTERS, ...BASE_CHARACTERS].map(f => [f.id, f]));

export function getFighter(id) {
  return ALL_BY_ID.get(id) || FIGHTERS[0];
}

// ---- LOOK CUSTOMISATION --------------------------------------------------
// Everything a player can change about their founder. All of it is purely
// cosmetic — see PLAYER_STATS in config.js: nothing here touches speed,
// power or HP. Anything left unset falls back to the chosen base character.
export const LOOKS = {
  hairStyle: [
    { id: 'short', name: 'SHORT' }, { id: 'buzz', name: 'BUZZ' },
    { id: 'neat', name: 'NEAT' }, { id: 'slick', name: 'SLICK' },
    { id: 'quiff', name: 'QUIFF' },
    { id: 'curly', name: 'CURLY' }, { id: 'afro', name: 'AFRO' },
    { id: 'bob', name: 'BOB' }, { id: 'long', name: 'LONG' },
    { id: 'ponytail', name: 'PONYTAIL' }, { id: 'topknot', name: 'TOP KNOT' },
    { id: 'puffs', name: 'PUFFS' }, { id: 'bald', name: 'BALD' },
  ],
  headwear: [
    { id: 'none', name: 'NONE' }, { id: 'headband', name: 'HEADBAND' },
    { id: 'cap', name: 'CAP' }, { id: 'beanie', name: 'BEANIE' },
    { id: 'bandana', name: 'BANDANA' },
  ],
  eyewear: [
    { id: 'none', name: 'NONE' }, { id: 'glasses', name: 'GLASSES' },
    { id: 'shades', name: 'SHADES' }, { id: 'visor', name: 'AR VISOR' },
  ],
  facialHair: [
    { id: 'none', name: 'NONE' }, { id: 'stubble', name: 'STUBBLE' },
    { id: 'moustache', name: 'MOUSTACHE' }, { id: 'goatee', name: 'GOATEE' },
    { id: 'beard', name: 'BEARD' },
  ],
  outfit: [
    { id: 'blazer', name: 'BLAZER' }, { id: 'suit', name: 'SUIT' },
    { id: 'pinstripe', name: 'PINSTRIPE' }, { id: 'hoodie', name: 'HOODIE' },
    { id: 'turtleneck', name: 'TURTLENECK' }, { id: 'tee', name: 'TEE' },
    { id: 'bomber', name: 'BOMBER' }, { id: 'vest', name: 'VEST' },
    { id: 'henley', name: 'HENLEY' },
  ],
};

export const LOOK_FIELDS = Object.keys(LOOKS);

// Picks the valid look overrides out of a profile / challenge payload.
export function pickLook(src) {
  const out = {};
  if (!src) return out;
  for (const k of LOOK_FIELDS) {
    const v = src[k];
    if (v && LOOKS[k].some(o => o.id === v)) out[k] = v;
  }
  return out;
}

export const DEFAULT_BASE_ID = 'b-neo';

// Builds a fighter definition for a user profile (custom colors/special/photo).
// ---------------------------------------------------------------- player build
//
// A player's fighter is assembled from three things a profile can hold: a body,
// a set of move ids chosen off a curated menu, and everything cosmetic. Stats
// are never among them.

export function clampPlayerBody(body) {
  const out = { ...DEFAULT_BODY };
  if (!body) return out;
  for (const key of Object.keys(DEFAULT_BODY)) {
    const v = Number(body[key]);
    if (!Number.isFinite(v)) continue;
    const [lo, hi] = BODY[key];
    out[key] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

// Move ids -> command normals. Unknown ids are dropped rather than throwing:
// a profile saved against an older menu should lose a move, not fail to load.
// Two moves on the same input cannot both exist, so the first one wins.
export function playerCommandNormals(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [], used = new Set();
  for (const id of ids.slice(0, 3)) {
    const cn = toCommandNormal(getPlayerMove(id));
    if (!cn || used.has(cn.slot)) continue;
    used.add(cn.slot);
    out.push(cn);
  }
  return out;
}

// What a player's current build costs. Zero is the target; the profile screen
// shows this live and refuses to save outside ±PLAYER_BUDGET.
export function playerBuildCost(profile) {
  const st = STYLES.balanced;
  return budgetCost(
    { startup: st.startup, dmg: st.dmg, reach: st.reach, recovery: st.recovery, speed: st.speed, hp: st.hp },
    clampPlayerBody(profile?.body),
    playerCommandNormals(profile?.moves),
  );
}

export function buildCustomFighter(profile) {
  const base = getFighter(profile.baseId || DEFAULT_BASE_ID);
  return {
    ...base,
    ...pickLook(profile),        // explicit choices beat the base character
    id: 'custom',
    name: (profile.name || 'YOU').toUpperCase(),
    title: 'CHALLENGER',
    company: (profile.company || 'STEALTH STARTUP').toUpperCase(),
    tagline: 'Player-founded. Player-funded.',
    special: profile.special || base.special,
    photo: profile.photo || null,
    stats: { ...PLAYER_STATS },   // look is cosmetic; every player hits the same
    // PINNED, not inherited. Fighter derives speed and HP from `style`, so
    // letting a player's base pick carry a style through would quietly make a
    // cosmetic click a stat choice — the exact bug v1.7 was written to kill.
    // Player variety lives in silhouette and moves, both budget-balanced.
    style: 'balanced',
    body: clampPlayerBody(profile.body),
    commandNormals: playerCommandNormals(profile.moves),

    // skin/hair come from the uploaded photo when available, so hands + head
    // coloring match the person instead of the generic base founder
    c: {
      ...base.c,
      skin: profile.skin || base.c.skin,
      hair: profile.hair || base.c.hair,
      suit: profile.c1 || base.c.suit,
      suit2: shade(profile.c1 || base.c.suit, -28),
      accent: profile.c2 || base.c.accent,
    },
  };
}

// Ghost fighter for an incoming challenge. `ch` carries the link payload
// (n/co/f/sp/pts) and, when the challenger's cloud profile was fetched,
// their real photo + colors (photo/skin/hair/c1/c2) so the card shows THEM.
export function buildGhostFighter(ch) {
  const base = getFighter(ch.f);
  return {
    ...base,
    ...pickLook(ch),             // so a challenge card shows THEIR look
    id: 'ghost-' + base.id,
    name: (ch.n || 'RIVAL').toUpperCase(),
    company: (ch.co || 'RIVAL VENTURES').toUpperCase(),
    title: 'CHALLENGER',
    special: ch.sp && SPECIALS[ch.sp] ? ch.sp : base.special,
    photo: ch.photo || null,
    stats: { ...PLAYER_STATS },   // a ghost is another human — same footing
    // Their fighting identity, already validated by the link decoder — a ghost
    // that threw a different moveset from the player who made it would not be
    // the fight the link promised. v1 links carry neither, so they fall back.
    style: ch.style || base.style,
    body: ch.body || base.body,
    commandNormals: ch.commandNormals || [],

    c: {
      ...base.c,
      skin: ch.skin || base.c.skin,
      hair: ch.hair || base.c.hair,
      suit: ch.c1 || base.c.suit,
      suit2: shade(ch.c1 || base.c.suit, -28),
      accent: ch.c2 || base.c.accent,
    },
  };
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Adapts a legacy roster entry to a schema v1 character. Roster entries stay
// in their current shape so the rest of the game keeps working unchanged;
// this is the seam the validator and the authoring tool read through.
export function toCharacter(def) {
  const st = STYLES[def.style] || STYLES.balanced;
  const sp = SPECIALS[def.special] || SPECIALS.pitchdeck;
  return {
    schema: SCHEMA_VERSION,
    id: def.id,
    identity: {
      name: def.name,
      title: def.title || 'CHALLENGER',
      company: def.company || 'STEALTH STARTUP',
      tagline: def.tagline || 'Player-founded. Player-funded.',
      rap: def.rap || 'No convictions — yet',
    },
    body: { ...DEFAULT_BODY, ...(def.body || {}) },
    look: {
      ...def.c,
      hairStyle: def.hairStyle, outfit: def.outfit,
      headwear: def.headwear, eyewear: def.eyewear, facialHair: def.facialHair,
      stance: st.stance,
    },
    fighting: {
      preset: def.style || 'balanced',
      startup: st.startup, dmg: st.dmg, reach: st.reach,
      recovery: st.recovery, speed: st.speed, hp: st.hp,
      moves: {
        special: { archetype: sp.type, ...sp },
        signature: null,
      },
    },
    // A character's own vocabulary. Absent means "universal grammar only",
    // which is a complete character — most of the base bodies are exactly that.
    commandNormals: def.commandNormals || [],
    // `parts` is deliberately NOT emitted here. It is render-only geometry, and
    // each peer already has its own copy of every roster fighter — a rival's
    // parts are drawn from OUR local def, keyed by the id both sides agree on,
    // never from anything sent over the wire. `specToDef` in main.js never reads
    // `spec.ch.parts` for exactly this reason: a validated-then-discarded field
    // is worse than no field, because it makes the protocol look like it does
    // something it doesn't. And there is nothing to lose today — no
    // player-authored character can carry its own parts yet, since
    // buildCustomFighter takes them from the base roster def. When that changes,
    // wire it up then, deliberately, with the receiver actually reading it.
    ai: {
      aggr: def.ai?.aggr ?? 0.6,
      jump: def.ai?.jump ?? 0.35,
      prefRange: def.ai?.prefRange ?? 'mid',
    },
  };
}
