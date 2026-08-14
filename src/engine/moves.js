// Move archetypes. The engine implements these; characters compose and tune
// them. Extracted verbatim from the sp.type chains that used to live in
// fighter.js — behaviour is unchanged, only the dispatch moved.
//
// Seven for now: `strike` covers the basics, and the other six mirror the
// shipped special types one-for-one. `counter` and `trap` arrive in P2,
// alongside the authoring UI that can actually create them.

// Per-archetype shaping applied when a special starts.
export const ARCHETYPE_SHAPES = {
  strike: (a) => { a.words = ['ZAP!']; },
  projectile: (a, sp) => {
    a.active = 0.05 + sp.count * sp.interval;
    a.words = ['SLIDE!', 'DECK!'];
    // The tick counts these, so they must exist as NUMBERS before the first
    // frame: `undefined < sp.count` is false, and the move then fires nothing
    // for its whole active window. Seeded here rather than at the call site
    // because a projectile can start as a special OR as a command normal, and
    // only the special path used to set them — which left every projectile
    // command normal silently inert. Shaping is the one step both paths share,
    // so per-frame archetype state belongs here.
    a.fired = 0;
    a.fireT = 0;
  },
  aoe: (a) => { a.words = ['BURN!', 'TORCHED!']; a.hitY = -80; },
  teleport: (a) => { a.words = ['PIVOT!']; a.reach = 92; a.hitY = -95; },
  rush: (a, sp) => {
    a.active = sp.duration;
    a.words = ['VIRAL!', 'GROWTH!'];
    a.reach = 70; a.hitY = -90;
  },
  rain: (a) => { a.words = ['FUNDED!']; },
  grab: (a) => { a.words = ['ACQUIRED!']; a.hitY = -95; },

  // A counter swings nothing. It opens a window during which an incoming
  // strike is turned back on its owner, which is why `active` IS the window:
  // the move is over the moment the chance to be hit has passed.
  counter: (a, sp) => {
    a.words = ['DENIED!', 'OBJECTION!', 'COUNTERSUED!'];
    a.counterWindow = sp.window ?? 0.2;
    a.active = a.counterWindow;
    a.noHitbox = true;
    a.hitY = -95;
  },
  // A trap places a hazard and walks away — the placing animation is not the
  // threat, so it has no hitbox either. The hazard arms on its own clock.
  trap: (a) => {
    a.words = ['PLANTED!', 'DUE DILIGENCE!'];
    a.noHitbox = true;
    a.hitY = -95;
  },

  // A stance never actually reaches shapeAttack in normal play —
  // Fighter.startAttack intercepts `sp.type === 'stance'` and calls
  // switchStance() before it builds an attack object at all, so this branch
  // is unreachable from any shipped input. It is declared anyway, because
  // `shapeAttack` falls back to ARCHETYPE_SHAPES.strike for an unlisted type
  // — and falling back to `strike` for a stray stance call would hand it a
  // real swinging hitbox, the one thing a toggle must never have. `noHitbox`
  // here is a second line of defence, matching counter/trap, not the
  // primary mechanism.
  stance: (a) => { a.words = ['SHIFT!']; a.noHitbox = true; },
};

// Applies archetype shaping to a freshly built attack object. Returns it.
export function shapeAttack(a, sp) {
  const shape = ARCHETYPE_SHAPES[sp.type] || ARCHETYPE_SHAPES.strike;
  if (!a.words) a.words = ['ZAP!'];
  shape(a, sp);
  return a;
}

// Per-frame behaviour while a special is active. Called from
// Fighter.updateAttack once `activeT >= 0`.
//
// Every branch of the original if/else-if chain was gated on `activeT >= 0`
// and the types are mutually exclusive, so hoisting that guard to a single
// early return and dispatching by type is equivalent. `strike` and `grab`
// have no per-frame behaviour and are deliberately absent.
export const ARCHETYPE_TICKS = {
  projectile: (f, a, sp, dt, game) => {
    a.fireT -= dt;
    if (a.fired < sp.count && a.fireT <= 0) {
      game.spawnSlide(f, a.fired);
      a.fired++;
      a.fireT = sp.interval;
    }
  },
  rain: (f, a, sp, dt, game) => {
    if (a.hasFired) return;
    a.hasFired = true;
    game.spawnRain(f);
  },
  teleport: (f, a, sp, dt, game) => {
    if (a.teleported) return;
    a.teleported = true;
    game.doTeleport(f);
  },
  rush: (f, a, sp, dt, game, activeT) => {
    if (activeT > a.active) return;
    // free flight until contact; after lock-on, chase to stay glued for the flurry
    const opp = game.other(f);
    const gap = (opp.x - f.x) * f.facing;
    if (!a.lockedOn) {
      f.x += f.facing * sp.speed * dt;
    } else if (gap > 62) {
      f.x += f.facing * Math.min(sp.speed * dt, gap - 58);
    }
    if (Math.random() < 30 * dt) game.fx.spark(f.x - f.facing * 30, f.y - 80, f.def.c.accent, 2, 160);
    game.pushAfterimage(f);
  },
  aoe: (f, a, sp, dt, game, activeT) => {
    if (a.fxDone || activeT >= 0.1) return;
    a.fxDone = true;
    game.onBurnBlast(f);
  },
  trap: (f, a, sp, dt, game) => {
    if (a.hasFired) return;
    a.hasFired = true;
    game.spawnTrap(f, sp);
  },
  // `counter` has no tick on purpose: nothing happens until someone swings at
  // it, so the window is read by the hit resolver rather than polled here.
};
