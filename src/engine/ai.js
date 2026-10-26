// AI opponent: periodic decision ticks (rate = difficulty reaction speed),
// personality-flavored per fighter (aggression / jumpiness / preferred range).

import { AI_LEVELS, METER, STAGE, RUNWAY, PHYS, DASH, COMBO } from '../config.js';
import { slotButton } from '../data/schema.js';

// How far outside a trap's radius the AI stops. The bite is measured from the
// body's centre, and pushApart can nudge a fighter a pixel or two after it has
// moved, so the edge it keeps to sits a little outside the one that bites.
const TRAP_EDGE = 4;
// A jump's time in the air, from standing. Its drift at that speed is how far
// a jump carries a body, which is what decides whether one clears a trap.
const JUMP_AIR = -2 * PHYS.JUMP_V / PHYS.GRAVITY;
// Game.doTeleport sets the body down this far past the rival.
const TELEPORT_PAST = 84;

// When a command normal is worth throwing, by its combo verb. An AI that never
// used its character's own moves would make every ghost play like the same
// fighter wearing a different suit — which is the whole problem we are solving.
const CMD_FIT = {
  'command-grab': (d) => d < 130,
  launcher:       (d) => d < 150,
  overhead:       (d) => d < 150,
  low:            (d) => d < 140,
  gapCloser:      (d) => d > 150 && d < 400,
  ranged:         (d) => d > 240,
  trap:           (d) => d > 170,      // lay it in the space they must cross
  punish:         (d) => d < 160,
  safe:           (d) => d < 160,
  counter:        () => false,         // reactive — handled in threat response
};

export class AIController {
  constructor(levelKey, def) {
    this.levelKey = levelKey;
    this.level = AI_LEVELS[levelKey] || AI_LEVELS.founder;
    this.persona = def.ai || { aggr: 0.6, jump: 0.3, prefRange: 'mid' };
    this.decideT = 0.4;
    this.dir = 0;
    this.blockT = 0;
    this.counterCD = 0;
    this.heedOrder = false;    // has this AI noticed the rival's current delivery?
    this.orderT = 0;           // that delivery's clock when last seen, to tell a new one
    this.seenTraps = new WeakSet();   // the rival's traps this AI has noticed
    this.pulse = {};           // one-frame button presses
    this.isHuman = false;
    this.cmds = (def.commandNormals || []).filter(cn => cn && cn.slot);
  }

  // Pulses a command normal if one fits the range, and holds forward so it
  // actually comes out — the button alone would produce the neutral basic.
  // Returns true when it committed to one.
  tryCommand(dist, toward, f, opp, game) {
    if (!this.cmds.length) return false;
    const P = this.persona;
    for (const cn of this.cmds) {
      const tags = cn.tags && cn.tags.length ? cn.tags : ['safe'];
      if (!tags.some(t => (CMD_FIT[t] || (() => false))(dist))) continue;
      if (this.carriesOntoTrap(f, opp, cn.archetype, game)) continue;
      // Aggressive characters reach for their own move more often; a coin flip
      // for everyone would make every roster fighter feel the same again.
      if (Math.random() > 0.35 + P.aggr * 0.45) continue;
      this.pulse[slotButton(cn.slot)] = true;
      this.dir = toward;                 // forward MUST be held on the press frame
      return true;
    }
    return false;
  }

  update(f, game) {
    const opp = game.other(f);
    const pad = { left: false, right: false, up: false, block: false, punch: false, kick: false, special: false, super: false };

    // apply queued pulses (single frame)
    for (const k of Object.keys(this.pulse)) { pad[k] = true; }
    this.pulse = {};

    this.blockT -= game.dt;
    if (this.blockT > 0) pad.block = true;

    // chain reflex: the instant a strike connects, decide once whether to
    // continue the string (slap → punch → kick → special)
    const atk = f.attack;
    if (f.state === 'attack' && atk && atk.hasHit && !atk.aiChainDecided
      && (atk.kind === 'slap' || atk.kind === 'punch' || atk.kind === 'kick')) {
      atk.aiChainDecided = true;
      if (Math.random() < (this.level.chain ?? 0.4)) {
        const n = atk.chainN || 1;
        // A slap or jab link steps the attacker in; a kick does not. From the
        // edge of a trap it has stopped short of, that step is what puts it
        // on the trap (found in review: about one champion in five did), so
        // there the string goes straight to the kick.
        const stepOnTrap = this.heededTraps(f, game)
          .some(t => this.inTrap(f.x + f.facing * COMBO.STEP_IN, t));
        if (atk.kind === 'slap') {
          if (stepOnTrap) this.pulse.kick = true;
          else this.pulse.punch = true;            // slap escalates into punches
        } else if (atk.kind === 'punch') {
          if (n < 3 && !stepOnTrap) this.pulse.punch = true;
          else this.pulse.kick = true;
        } else if (f.energy >= METER.SPECIAL_COST) {
          // A stance special is a toggle toward preferredStance(). Pressing it
          // while already there paid full meter and started the cooldown for
          // a switch that changed nothing; decide() guards this, and this
          // reflex did not. An order already out is the same shape: the press
          // is refused, so it is a wasted beat in the middle of a combo.
          if (this.specialWorthPressing(f, opp, game)) this.pulse.special = true;
        } else if (f.energy >= METER.SUPER_COST) {
          this.pulse.super = true;
        }
      }
    }

    // Counter reflex — checked EVERY FRAME, not on the decision timer.
    //
    // decide() only runs every `react` seconds, and a counter has to be up
    // during the opponent's STARTUP, which is 0.05s on a punch. On a ~0.25s
    // cadence the stance essentially never lined up with an incoming swing, so
    // the archetype read as broken even once it had an AI path at all.
    // Blocking gets away with the timer because blockT persists once set; a
    // counter has no such window. This is the same reflex as the chain check
    // above: reactive, per-frame, and cheap.
    if (this.counterCD > 0) this.counterCD -= game.dt;
    if (this.counterCD <= 0 && f.actionable && this.cmds.length) {
      const oa = opp.state === 'attack' && opp.attack && !opp.attack.hasHit;
      if (oa && opp.attack.kind !== 'grab' && Math.abs(opp.x - f.x) < 200) {
        const cn = this.cmds.find(c => (c.tags || []).includes('counter'));
        if (cn && Math.random() < this.level.blockProb * 0.5) {
          pad[slotButton(cn.slot)] = true;
          this.dir = Math.sign(opp.x - f.x) || 1;   // forward MUST be held to select it
          this.counterCD = 0.9;                     // don't spam the read
        }
      }
    }

    const dir = this.fenceTraps(f, opp, game, pad, this.dir);
    if (dir === 1) pad.right = true;
    else if (dir === -1) pad.left = true;

    this.decideT -= game.dt;
    if (this.decideT <= 0 && f.actionable) {
      this.decideT = this.level.react * (0.75 + Math.random() * 0.7);
      this.decide(f, opp, game);
    }

    f.pad = pad;
  }

  // False when pressing special would change nothing: a stance switch to the
  // stance already held, or a second order while the first is still out. Or
  // when it would carry the body onto a trap this AI has already read, which
  // decide() checks for the same specials and this reflex did not.
  specialWorthPressing(f, opp, game) {
    if (this.carriesOntoTrap(f, opp, f.special.type, game)) return false;
    if (f.special.type === 'stance') return this.preferredStance(f) !== f.stanceId;
    if (f.special.type === 'deferred') return f.deliveryT <= 0;
    return true;
  }

  // Where to stand while a rival's parcel is on its way, or null when there is
  // nothing to do about it. `safe` is how far from the mark a body is clear of
  // the drop; the escape goes out the near side unless a wall or the rival is
  // in the way, and blocks when there is no time left to walk it.
  dodgeDelivery(f, opp, toward) {
    if (!(opp.deliveryT > 0)) return null;
    const safe = opp.special.radius + PHYS.BODY_W * f.body.build * 0.6;
    const off = f.x - opp.deliveryX;
    if (Math.abs(off) >= safe) {
      // Clear of it. Do not walk back in while it could still land on you: an
      // approach toward the rival that would cross the mark before it lands
      // waits instead. Only when the mark really is between the two of them.
      const between = Math.sign(-off) === toward && Math.abs(off) < Math.abs(opp.x - f.x);
      const reach = PHYS.WALK * f.speedMult * (opp.deliveryT + 0.1);
      return between && Math.abs(off) - safe < reach ? { dir: 0 } : null;
    }
    const room = (d) => (d < 0 ? f.x - STAGE.MIN_X : STAGE.MAX_X - f.x);
    const blocked = (d) => room(d) < safe - d * off + 8
      || (Math.sign(opp.x - f.x) === d && Math.abs(opp.x - f.x) < safe * 2);
    let away = off !== 0 ? Math.sign(off) : (room(1) >= room(-1) ? 1 : -1);
    if (blocked(away)) away = -away;
    const need = (safe - away * off) / (PHYS.WALK * f.speedMult);
    if (blocked(away) || need > opp.deliveryT) return { dir: 0, block: opp.deliveryT + 0.25 };
    return { dir: away };
  }

  // ---- the rival's traps ----
  // A trap bites a grounded body within its radius once it arms, and a jump
  // clears it, but only while in the air: what matters is where the body comes
  // down. A jump carries 120 to 160 px and RUG PULL denies about 160, so most
  // of the roster cannot jump one from its edge; only a quick or buffed
  // fighter can. The stage is a line, so there is no going around: the ways
  // past are over, or to wait for it to expire while fighting from the edge.

  // The rival's traps this AI has noticed that are still down. update() is
  // also driven by unit tests with a bare stand-in for the game, which has no
  // trap list, and a list that is not there holds no traps.
  heededTraps(f, game) {
    return (game.traps || []).filter(t => !t.dead && t.owner !== f && this.seenTraps.has(t));
  }

  inTrap(x, t) { return Math.abs(x - t.x) <= t.radius + TRAP_EDGE; }

  // Whether a walk or a dash from x0 to x1, along the ground, touches the trap.
  crosses(x0, x1, t) {
    return Math.max(x0, x1) >= t.x - t.radius - TRAP_EDGE
      && Math.min(x0, x1) <= t.x + t.radius + TRAP_EDGE;
  }

  // A body coming down at x in `airT` seconds lands clear of every trap that
  // will still be down by then.
  landsClear(x, airT, traps) {
    return traps.every(t => t.life <= airT || !this.inTrap(x, t));
  }

  jumpDrift(f) { return PHYS.WALK * f.speedMult * PHYS.AIR_DRIFT * JUMP_AIR; }

  // How far this fighter can carry itself before its next decision: walking
  // for the whole interval, a dash if one is ready, or a jump. A trap further
  // away than that cannot be stepped on before the AI gets another look.
  trapSight(f) {
    return Math.max(PHYS.WALK * f.speedMult * this.decideT,
      f.dashCD <= 0 ? DASH.SPEED * DASH.DURATION : 0, this.jumpDrift(f));
  }

  // A rush runs along the ground at the rival and a teleport sets the body
  // down just past them, so either one can be a step onto a noticed trap that
  // the walk would have stopped short of. A teleport over a trap that lies
  // between the two of them is the best way past it, and stays allowed.
  carriesOntoTrap(f, opp, type, game) {
    if (type !== 'rush' && type !== 'teleport') return false;
    const traps = this.heededTraps(f, game);
    if (!traps.length) return false;
    if (type === 'rush') return traps.some(t => this.crosses(f.x, opp.x, t));
    const toward = Math.sign(opp.x - f.x) || 1;
    const land = Math.max(STAGE.MIN_X, Math.min(STAGE.MAX_X, opp.x + toward * TELEPORT_PAST));
    return traps.some(t => this.inTrap(land, t));
  }

  // Where to go from inside a noticed trap that has not armed yet (an armed
  // one would already have bitten): out the near side if that is walkable
  // before it goes live, up and out if only a jump is quick enough, and on the
  // guard when a wall or the rival is in the way, since a blocked bite is chip.
  // Inside the radius only: the margin outside it is safe to stand in, and
  // fenceTraps() already stops any step deeper.
  leaveTrap(f, opp, game) {
    if (!f.grounded) return null;
    const t = this.heededTraps(f, game).find(t => Math.abs(f.x - t.x) <= t.radius);
    if (!t) return null;
    const off = f.x - t.x;
    const gap = (d) => t.radius + TRAP_EDGE + 1 - d * off;
    const room = (d) => (d < 0 ? f.x - STAGE.MIN_X : STAGE.MAX_X - f.x);
    const shut = (d) => room(d) < gap(d)
      || (Math.sign(opp.x - f.x) === d && Math.abs(opp.x - f.x) < gap(d));
    let out = off !== 0 ? Math.sign(off) : (room(1) >= room(-1) ? 1 : -1);
    if (shut(out)) out = -out;
    const guard = { dir: 0, block: Math.max(0, t.armT) + 0.25 };
    if (shut(out)) return guard;
    if (gap(out) <= PHYS.WALK * f.speedMult * t.armT) return { dir: out };
    if (gap(out) <= this.jumpDrift(f)) return { dir: out, up: true };
    return guard;
  }

  // Per frame, for the traps it has noticed: a walk that would step onto one
  // stops at the edge, or becomes a jump when the jump lands clear on the far
  // side and the rival is out there; a dash that would run across one is not
  // taken; and in the air it drifts to come down clear. Per frame rather than
  // in decide(), because `dir` holds until the next decision and a rookie
  // walks for over half a second between them, a long way past any edge.
  // Returns the direction to walk this frame and never writes `dir`, so the
  // moment the trap is gone the walk it interrupted carries on.
  fenceTraps(f, opp, game, pad, dir) {
    const traps = this.heededTraps(f, game);
    if (!traps.length) return dir;
    if (f.airborne) {
      if (f.state !== 'jump') return dir;      // only a jump steers
      const g = PHYS.GRAVITY;
      const airT = (-f.vy + Math.sqrt(f.vy * f.vy + 2 * g * Math.max(0, STAGE.FLOOR - f.y))) / g;
      const speed = PHYS.WALK * f.speedMult * PHYS.AIR_DRIFT;
      // The arc is stepped a frame at a time, so the body can drift up to one
      // frame longer than the smooth arc says: both ends have to land clear.
      // Found in review, when champions came down a pixel inside the edge.
      const clear = (d) => this.landsClear(f.x + d * speed * airT, airT, traps)
        && this.landsClear(f.x + d * speed * (airT + game.dt), airT, traps);
      // An attack in the air holds the body where it is until it ends, so one
      // thrown over a trap drops the fighter onto it. Found in review: a jump
      // that was clearing RUG PULL came down on it after a slap at the top.
      if ((pad.slap || pad.punch || pad.kick || pad.launch) && !clear(0)) {
        pad.slap = pad.punch = pad.kick = pad.launch = false;
      }
      // The drift it wanted, then none, then the other way. Both sides are
      // tried by name as well: with no drift wanted (dir 0) the first three
      // are all "fall straight down" (found in review).
      const toward = Math.sign(opp.x - f.x) || 1;
      for (const d of [dir, 0, -dir, toward, -toward]) {
        if (clear(d)) return d;
      }
      return dir;
    }
    let walk = dir;
    // A basic that starts this frame holds forward to pick the move, and an
    // attack does not walk, so there is no step to stop.
    const swing = pad.slap || pad.punch || pad.kick || pad.launch;
    if (walk && !swing) {
      // Any step that goes deeper, not only the one across the edge: a body
      // can come down from a jump just inside the margin, and from there the
      // next step is the bite. Inside the radius itself the trap has not armed
      // yet (or it would have bitten), and leaveTrap() is steering it out.
      const next = f.x + walk * PHYS.WALK * f.speedMult * game.dt;
      const t = traps.find(t => Math.abs(f.x - t.x) > t.radius && this.inTrap(next, t)
        && Math.abs(next - t.x) < Math.abs(f.x - t.x));
      if (t) {
        const land = Math.max(STAGE.MIN_X, Math.min(STAGE.MAX_X, f.x + walk * this.jumpDrift(f)));
        const beyond = Math.sign(opp.x - t.x) === walk && !this.inTrap(opp.x, t);
        if (beyond && this.landsClear(land, JUMP_AIR, traps)) pad.up = true;
        else walk = 0;
      }
    }
    if (pad.dash) {
      const d = walk || f.facing;              // where startDash will send it
      const end = f.x + d * DASH.SPEED * DASH.DURATION;
      if (traps.some(t => this.crosses(f.x, end, t))) pad.dash = false;
    }
    return walk;
  }

  // Below a third HP, survive; above it, close the round out. Exposed as its
  // own method so the threshold is testable without driving a whole match.
  preferredStance(f) {
    return f.hp / f.maxHp < 0.34 ? 'safety' : 'capabilities';
  }

  decide(f, opp, game) {
    const L = this.level, P = this.persona;
    const dist = Math.abs(opp.x - f.x);
    const toward = Math.sign(opp.x - f.x) || 1;

    // random hesitation (harder AIs hesitate less)
    if (Math.random() < L.mistake) { this.dir = 0; return; }

    // --- threat response ---
    const oppAttacking = opp.state === 'attack' && opp.attack && !opp.attack.hasHit;
    const oppGrabbing = oppAttacking && opp.attack.kind === 'grab';
    const projThreat = game.projectiles.some(p =>
      p.owner !== f && Math.sign(f.x - p.x) === Math.sign(p.vx || 1) && Math.abs(p.x - f.x) < 300 && !p.delay);
    if (oppGrabbing && dist < 190 && Math.random() < L.blockProb + 0.15) {
      this.pulse.up = true;                      // grabs must be jumped
      this.dir = 0;
      return;
    }
    if ((oppAttacking && dist < 220) || projThreat) {
      if (Math.random() < L.blockProb) {
        this.blockT = 0.28 + Math.random() * 0.3;
        this.dir = 0;
        return;
      }
      if (Math.random() < P.jump * 0.6) {
        this.pulse.up = true;
        this.dir = toward;
        return;
      }
    }

    // --- a parcel on its way to where I am standing ---
    // A delivery is a clock, and a second and a half is long enough for
    // decide() to read it on its own cadence; it needs no per-frame reflex the
    // way a counter does. After the threat response, so a real swing is still
    // blocked first, and gated on blockProb, so a rookie sometimes stands
    // there and signs for it.
    // Noticing is rolled each decision until it happens, and then holds for
    // that order: rolled every time, a fighter that had stepped clear walked
    // straight back over the mark on the next failed roll (found in review).
    if (!(opp.deliveryT > 0) || opp.deliveryT > this.orderT + 1e-9) this.heedOrder = false;
    this.orderT = opp.deliveryT || 0;
    const dodge = this.dodgeDelivery(f, opp, toward);
    if (dodge && !this.heedOrder && Math.random() < L.blockProb + 0.25) this.heedOrder = true;
    if (dodge && this.heedOrder) {
      this.dir = dodge.dir;
      if (dodge.block) this.blockT = dodge.block;
      return;
    }

    // --- the rival's traps ---
    // Read the way an order is: noticing is rolled each decision while a trap
    // is close enough to step onto before the next one, gated on blockProb so
    // a rookie still walks onto some, and once noticed it holds for that trap.
    // Noticing does not take the decision. What it buys happens per frame in
    // fenceTraps(), under whatever this decision chooses, so an AI kept at the
    // edge still swings, specials and blocks from there instead of standing
    // still for the trap's whole life. The one exception is being inside a
    // trap that has not armed yet: the way out is a walk, not a swing.
    const sight = this.trapSight(f);
    for (const t of game.traps || []) {
      if (t.dead || t.owner === f || this.seenTraps.has(t)) continue;
      if (Math.abs(f.x - t.x) - t.radius - TRAP_EDGE > sight) continue;
      if (Math.random() < L.blockProb + 0.25) this.seenTraps.add(t);
    }
    const out = this.leaveTrap(f, opp, game);
    if (out) {
      this.dir = out.dir;
      if (out.up) this.pulse.up = true;
      if (out.block) this.blockT = out.block;
      return;
    }

    // --- winded ---
    // At zero runway the only way out is to connect, so a basic that lands
    // beats a special that whiffs: no dash, no jump-in, no meter spend, just
    // close the gap and swing. Placed AFTER threat response so a winded
    // fighter still blocks a real swing and still jumps a grab — being
    // desperate is not the same as being suicidal.
    //
    // EVERY path out of this branch either sets a pulse or sets `dir`. A
    // branch that returns having done neither freezes the controller for the
    // rest of the match, which is precisely how the stance branch shipped
    // broken with a green suite.
    if (f.winded) {
      if (dist < 128) {
        const r = Math.random();
        if (r < 0.45) this.pulse.punch = true;
        else if (r < 0.80) this.pulse.slap = true;
        else this.pulse.kick = true;
        this.dir = 0;
      } else {
        this.dir = toward;
      }
      return;
    }

    // --- stance ---
    // A toggle, but NOT a free one: the price is METER.SPECIAL_COST, charged unconditionally by
    // startSpecial() same as any other special. Fighter.pressed('special')
    // refuses the press outright below that cost, routing to
    // game.onSpecialDenied() instead, so an ungated branch here just fires
    // dead presses (and, before energy exists, locks the controller on this
    // branch forever since `dir` is zeroed every time). Checked here (after
    // threat response, so a fighter still blocks/jumps out of real danger
    // first) rather than folded into the `sp === archetype` fits-list below
    // it, because that list already assumes a stance switch is a separate
    // concern from the archetypes it fits distance for.
    if (f.special.type === 'stance' && f.stanceCD <= 0 && f.energy >= METER.SPECIAL_COST
      && this.preferredStance(f) !== f.stanceId) {
      this.pulse.special = true;
      this.dir = 0;
      return;
    }

    // --- race to a mystery drop if one is up for grabs ---
    const drop = game.drops.find(d => d.landed);
    if (drop && Math.random() < 0.5 && Math.abs(drop.x - f.x) < 320) {
      this.dir = Math.sign(drop.x - f.x) || 0;
      if (Math.abs(drop.x - f.x) > 200 && f.dashCD <= 0 && Math.random() < 0.4) this.pulse.dash = true;
      return;
    }

    // --- supers & specials ---
    if (f.energy >= METER.SUPER_COST && (f.hp < f.maxHp * 0.5 || Math.random() < 0.25)) {
      this.pulse.super = true;
      return;
    }
    // PR bomb: lob one from range
    if (f.energy >= METER.BOMB_COST && f.energy < METER.SPECIAL_COST && dist > 260 && Math.random() < 0.3) {
      this.pulse.bomb = true;
      this.dir = 0;
      return;
    }
    if (f.energy >= METER.SPECIAL_COST && Math.random() < L.specialProb) {
      const sp = f.special.type;
      const fits =
        (sp === 'projectile' && dist > 240) ||
        (sp === 'rain' && dist > 180) ||
        (sp === 'aoe' && dist < 170) ||
        (sp === 'grab' && dist < 130 && opp.grounded) ||
        (sp === 'rush' && dist > 150 && dist < 460 && !this.carriesOntoTrap(f, opp, sp, game)) ||
        (sp === 'teleport' && dist > 200 && !this.carriesOntoTrap(f, opp, sp, game)) ||
        // Same range band as the `aoe` it replaces, plus the resource gate:
        // BURN IT ALL spends the whole tank whatever is in it, so throwing it
        // near-empty pays 50 meter for the floor damage AND winds you. Half a
        // tank is the point below which it is strictly a bad idea.
        (sp === 'burn' && dist < 170 && f.runway >= RUNWAY.MAX * 0.5) ||
        // From mid range, where the rival has to choose between walking at
        // Jeff and backing toward the corner, and never with an order out.
        (sp === 'deferred' && dist > 140 && dist < 520 && f.deliveryT <= 0);
      if (fits) {
        this.pulse.special = true;
        this.dir = 0;
        return;
      }
    }

    // --- melee range ---
    if (dist < 128) {
      if (opp.energy >= 25 && f.stealCD <= 0 && Math.random() < L.aggr * 0.3) {
        this.pulse.steal = true;
        this.dir = 0;
        return;
      }
      // Its own move first, before falling back to the shared basics.
      if (this.tryCommand(dist, toward, f, opp, game)) return;
      const r = Math.random();
      if (r < L.aggr * 0.28) this.pulse.slap = true;        // quick slap to start a string
      else if (r < L.aggr * 0.66) this.pulse.punch = true;
      else if (r < L.aggr) this.pulse.kick = true;
      else if (r < L.aggr + 0.18) { this.blockT = 0.25; this.dir = 0; return; }
      // Create space. This used to set the direction and then fall through to
      // the `dir = 0` below, so the step back never happened and a rookie
      // stood still in melee range for a third of its decisions.
      else { this.dir = -toward; return; }
      this.dir = 0;
      return;
    }

    // --- neutral: approach, space, or jump in ---
    // Ranged and area-denial normals belong out here, not in the scramble.
    if (this.tryCommand(dist, toward, f, opp, game)) return;
    const wantRange = P.prefRange === 'far' ? 330 : P.prefRange === 'mid' ? 210 : 110;
    if (dist > wantRange + 60) {
      this.dir = toward;
      if (f.dashCD <= 0 && dist > 280 && Math.random() < L.aggr * 0.3) this.pulse.dash = true;
      else if (Math.random() < P.jump * 0.35) this.pulse.up = true;
    } else if (dist < wantRange - 70 && Math.random() > L.aggr) {
      // too close for a zoner's comfort — back off unless cornered
      const backX = f.x - toward * 60;
      this.dir = (backX > STAGE.MIN_X + 30 && backX < STAGE.MAX_X - 30) ? -toward : toward;
    } else if (Math.random() < L.aggr) {
      this.dir = toward;
    } else {
      this.dir = 0;
    }
  }
}
