// AI opponent: periodic decision ticks (rate = difficulty reaction speed),
// personality-flavored per fighter (aggression / jumpiness / preferred range).

import { AI_LEVELS, METER, STAGE, RUNWAY } from '../config.js';
import { slotButton } from '../data/schema.js';

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
    this.pulse = {};           // one-frame button presses
    this.isHuman = false;
    this.cmds = (def.commandNormals || []).filter(cn => cn && cn.slot);
  }

  // Pulses a command normal if one fits the range, and holds forward so it
  // actually comes out — the button alone would produce the neutral basic.
  // Returns true when it committed to one.
  tryCommand(dist, toward) {
    if (!this.cmds.length) return false;
    const P = this.persona;
    for (const cn of this.cmds) {
      const tags = cn.tags && cn.tags.length ? cn.tags : ['safe'];
      if (!tags.some(t => (CMD_FIT[t] || (() => false))(dist))) continue;
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
        if (atk.kind === 'slap') {
          this.pulse.punch = true;                 // slap escalates into punches
        } else if (atk.kind === 'punch') {
          if (n < 3) this.pulse.punch = true;
          else this.pulse.kick = true;
        } else if (f.energy >= METER.SPECIAL_COST) {
          // A stance special is a toggle toward preferredStance(). Pressing it
          // while already there paid full meter and started the cooldown for
          // a switch that changed nothing; decide() guards this, and this
          // reflex did not.
          if (f.special.type !== 'stance' || this.preferredStance(f) !== f.stanceId) {
            this.pulse.special = true;
          }
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

    if (this.dir === 1) pad.right = true;
    else if (this.dir === -1) pad.left = true;

    this.decideT -= game.dt;
    if (this.decideT <= 0 && f.actionable) {
      this.decideT = this.level.react * (0.75 + Math.random() * 0.7);
      this.decide(f, opp, game);
    }

    f.pad = pad;
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
    // A toggle, but NOT a free one — STANCE.COST is unused (nothing reads it);
    // the real price is METER.SPECIAL_COST, charged unconditionally by
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
        (sp === 'rush' && dist > 150 && dist < 460) ||
        (sp === 'teleport' && dist > 200) ||
        // Same range band as the `aoe` it replaces, plus the resource gate:
        // BURN IT ALL spends the whole tank whatever is in it, so throwing it
        // near-empty pays 50 meter for the floor damage AND winds you. Half a
        // tank is the point below which it is strictly a bad idea.
        (sp === 'burn' && dist < 170 && f.runway >= RUNWAY.MAX * 0.5);
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
      if (this.tryCommand(dist, toward)) return;
      const r = Math.random();
      if (r < L.aggr * 0.28) this.pulse.slap = true;        // quick slap to start a string
      else if (r < L.aggr * 0.66) this.pulse.punch = true;
      else if (r < L.aggr) this.pulse.kick = true;
      else if (r < L.aggr + 0.18) { this.blockT = 0.25; this.dir = 0; return; }
      else this.dir = -toward;                   // create space
      this.dir = 0;
      return;
    }

    // --- neutral: approach, space, or jump in ---
    // Ranged and area-denial normals belong out here, not in the scramble.
    if (this.tryCommand(dist, toward)) return;
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
