// Match controller: best-of-3 rounds, timers, hit resolution, projectiles,
// special-move orchestration, KO/victory cinematics. Emits result via onEnd().

import { STAGE, PHYS, ROUND, METER, BLOCK, UNICORN, BOMB, DROPS, COMBO, STEAL, PARRY, RUNWAY } from '../config.js';
import { Fighter } from './fighter.js';
import { FXSystem } from './fx.js';
import { audio } from './audio.js';
import { isTouchDevice } from './input.js';

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Seeded PRNG for anything gameplay-random (mystery drops) — the seed is
// shared by both peers online, so the sims stay identical.
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hidden powers — the crate never tells you which one you're getting.
export const DROP_EFFECTS = [
  { id: 'funding', label: '💰 SECRET FUNDING!', apply(f, g) { g.giveEnergy(f, 30); } },
  { id: 'runway', label: '❤️ RUNWAY EXTENSION!', apply(f) { f.hp = Math.min(f.maxHp, f.hp + 18); } },
  { id: 'coffee', label: '⚡ CAFFEINE OVERDRIVE!', apply(f) { f.speedBuffT = DROPS.BUFF_TIME; } },
  { id: 'tenx', label: '💪 10X ENGINEER!', apply(f) { f.dmgBuffT = DROPS.BUFF_TIME; } },
  { id: 'legal', label: '🛡 LEGAL SHIELD!', apply(f) { f.shieldT = DROPS.SHIELD_TIME; } },
  { id: 'crash', label: '📉 MARKET CRASH!', apply(f, g) { const o = g.other(f); o.energy = Math.max(0, o.energy - 25); } },
  { id: 'toxic', label: '💣 TOXIC ASSET!', apply(f) { f.hp = Math.max(1, f.hp - 10); } },
  { id: 'moon', label: '🚀 TO THE MOON!', apply(f, g) {
    const o = g.other(f);
    if (o.state === 'ko') return;
    o.vy = Math.min(o.vy, -520);          // works on airborne rivals too
    o.airborne = true;
    o.vx = (Math.sign(o.x - f.x) || 1) * 260;
  } },
];

// Drawn from the seeded RNG, so both peers in a live match see the same one.
const VICTORY_CRIES = ['ACQUIRED!', 'EXIT!', 'LIQUIDATED!', 'UNICORN!', 'IPO!', 'DUE DILIGENCE!'];

export class Game {
  constructor({ p1, p2, arena, mode, difficulty, isChallenge, onEnd, hud, seed }) {
    this.arena = arena;
    this.mode = mode;                        // 'solo' | 'versus'
    this.difficulty = difficulty;
    this.isChallenge = !!isChallenge;
    this.onEnd = onEnd;
    this.hud = hud;
    this.audio = audio;
    this.fx = new FXSystem();
    this.fighters = [new Fighter(p1.def, 0, p1.controller), new Fighter(p2.def, 1, p2.controller)];
    this.projectiles = [];
    this.traps = [];
    this.afterimages = [];
    this.roundWins = [0, 0];
    this.koRounds = [0, 0];
    this.maxCombo = [0, 0];
    this.roundNum = 1;
    this.timer = ROUND.TIME;
    this.state = 'intro';
    this.stateT = 0;
    this.timescale = 1;
    this.dt = 0;
    this.t = 0;
    this.paused = false;
    this.winnerIdx = -1;
    this.roundWinner = -1;
    this.roundWasKO = false;
    this.lastTickSec = -1;
    this.hintFlags = { special: false, super: false, combo: false };
    this.finished = false;
    this.introStep = -1;
    // mystery drops (seeded so online peers agree)
    this.seed = (seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.rng = mulberry32(this.seed);
    this.drops = [];
    this.dropClock = 0;
    this.nextDropAt = DROPS.FIRST_AT + this.rng() * DROPS.FIRST_JITTER;
  }

  other(f) { return this.fighters[0] === f ? this.fighters[1] : this.fighters[0]; }

  update(rawDt) {
    if (this.paused) return;
    this.t += rawDt;
    this.fx.update(rawDt);
    if (this.fx.hitstopT > 0) { this.hud.update(this); return; }

    const dt = rawDt * this.timescale;
    this.dt = dt;

    switch (this.state) {
      case 'intro': this.updateIntro(rawDt); break;
      case 'fighting': this.updateFighting(dt); break;
      case 'roundEnd': this.updateRoundEnd(rawDt); break;
      case 'matchEnd': this.updateMatchEnd(rawDt); break;
    }

    this.hud.update(this);
  }

  // ---------------- intro ----------------
  updateIntro(dt) {
    this.stateT += dt;
    if (this.introStep < 0) {
      this.introStep = 0;
      const label = this.roundWins[0] === 1 && this.roundWins[1] === 1 ? 'FINAL ROUND' : `ROUND ${this.roundNum}`;
      this.hud.announce(label);
      this.audio.sfx('round');
    }
    if (this.introStep === 0 && this.stateT >= ROUND.INTRO_ROUND_T) {
      this.introStep = 1;
      this.hud.announce('FIGHT!');
      this.audio.sfx('fight');
    }
    if (this.introStep === 1 && this.stateT >= ROUND.INTRO_ROUND_T + ROUND.INTRO_FIGHT_T) {
      this.hud.clearAnnounce();
      this.setState('fighting');
    }
    for (const f of this.fighters) f.update(dt, this, true);
  }

  // ---------------- fighting ----------------
  updateFighting(dt) {
    this.timer = Math.max(0, this.timer - dt);
    const sec = Math.ceil(this.timer);
    if (sec <= 10 && sec !== this.lastTickSec && sec > 0) {
      this.lastTickSec = sec;
      this.audio.sfx('timeTick');
    }

    this.drainRunway(dt);
    for (const f of this.fighters) f.update(dt, this, false);
    this.pushApart();
    this.updateProjectiles(dt);
    this.resolveHits();
    this.updateTraps(dt);
    this.updateDrops(dt);
    this.updateAfterimages(dt);
    this.updateHints();

    // KO?
    for (let i = 0; i < 2; i++) {
      if (this.fighters[i].hp <= 0 && this.fighters[i].state !== 'ko') {
        this.doKO(1 - i, i);
        return;
      }
    }

    // time up
    if (this.timer <= 0) {
      const [a, b] = this.fighters;
      const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
      const winner = ra === rb ? -1 : (ra > rb ? 0 : 1);
      this.hud.announce('TIME UP');
      this.audio.sfx('round');
      this.endRound(winner, false);
    }
  }

  // The clock only runs while the round does. This lives in updateFighting
  // rather than in Fighter.update because THIS is the only place
  // `state === 'fighting'` is already true: updateIntro, updateRoundEnd and
  // updateMatchEnd all call Fighter.update too (locked), and Game.update
  // returns early on `paused` and on hitstop before the switch is even reached.
  // Scoping by call site means there is no condition here to get wrong later.
  drainRunway(dt) {
    for (const f of this.fighters) {
      if (!f.usesRunway) continue;
      f.runway = Math.max(0, f.runway - RUNWAY.DRAIN * dt);
    }
  }

  // The counterweight to the drain: connecting is the only way to buy time.
  // Called from exactly the two places that award METER.HIT_DEAL — the normal
  // hit in strike() and the throw in doGrab(). Nothing that fails to land is on
  // that list: a shield absorb, a parry and a chipped block all return from
  // strike() before those lines, and a counter's payback damages the ATTACKER,
  // who did not land anything.
  refillRunway(f) {
    if (!f.usesRunway) return;
    f.runway = Math.min(RUNWAY.MAX, f.runway + RUNWAY.REFILL_ON_HIT);
  }

  pushApart() {
    const [a, b] = this.fighters;
    if (a.state === 'ko' || b.state === 'ko') return;
    const dx = b.x - a.x;
    const minGap = PHYS.BODY_W * 0.92;
    if (Math.abs(dx) < minGap && Math.abs(a.y - b.y) < 120) {
      const push = (minGap - Math.abs(dx)) / 2;
      const dir = dx >= 0 ? 1 : -1;
      a.x -= dir * push;
      b.x += dir * push;
      a.x = Math.max(STAGE.MIN_X, Math.min(STAGE.MAX_X, a.x));
      b.x = Math.max(STAGE.MIN_X, Math.min(STAGE.MAX_X, b.x));
    }
  }

  // ---------------- hits ----------------
  resolveHits() {
    for (const att of this.fighters) {
      const hb = att.hitbox();
      if (!hb) continue;
      const a = hb.a;
      const def = this.other(att);
      if (def.state === 'ko') continue;

      if (a.kind === 'rush') {
        const sp = a.special;
        const activeT = att.stateT - a.startup;
        if (!overlap(hb, def.hurtbox())) continue;
        if (a.contactT === undefined) {
          // first contact: lock in place and extend the window to fit the full flurry
          a.contactT = activeT;
          a.lockedOn = true;
          a.active = activeT + sp.hits * sp.hitInterval + 0.04;
        }
        const idx = Math.floor((activeT - a.contactT) / sp.hitInterval);
        if (idx === a.lastRushHit || idx >= sp.hits) continue;
        a.lastRushHit = idx;
        this.strike(att, def, { ...a, dmg: sp.dmg, kb: sp.kb, kbUp: 0, stun: 0.3, shake: 5 });
        continue;
      }

      if (a.hasHit) continue;
      if (!overlap(hb, def.hurtbox())) continue;

      if (a.kind === 'steal') {
        a.hasHit = true;
        this.doSteal(att, def);
        continue;
      }

      if (a.kind === 'grab') {
        a.hasHit = true;
        if (def.airborne) continue;                    // grabs whiff vs air
        this.doGrab(att, def, a);
        continue;
      }
      a.hasHit = true;
      this.strike(att, def, a);
    }
  }

  strike(att, def, a, fromProjectile = false) {
    const dir = Math.sign(def.x - att.x) || att.facing;
    const cx = def.x - dir * 20;
    const cy = def.y - 100 + Math.random() * 24;

    // Legal Shield: one free "objection" absorbs the hit entirely
    if (def.shieldT > 0) {
      def.shieldT = 0;
      def.vx = dir * 180;
      this.audio.sfx('block');
      this.fx.ring(cx, cy, '#8fd8ff', 620, 6, 0.35);
      this.fx.guard(cx, cy, dir);
      this.fx.popup(cx, cy - 40, 'OBJECTION!', '#8fd8ff');
      this.fx.shake(4);
      return;
    }
    // COUNTER: a stance that turns an incoming strike back on its owner. Sits
    // above block/parry in the same rock-paper-scissors — grabs beat it, it
    // beats everything else — so it is a read, not a free defensive option.
    const ctr = def.counterActive();
    if (ctr && a.kind !== 'grab' && !fromProjectile) {
      def.attack = null;
      def.setState('idle');
      this.giveEnergy(def, PARRY.ENERGY);
      this.audio.sfx('parry');
      this.fx.ring(cx, cy, '#ff9df3', 720, 7, 0.34);
      this.fx.impact(cx, cy, -dir, '#ff9df3', 0.8);     // the blow goes back the way it came
      this.fx.popup(cx, cy - 44, 'COUNTERED!', '#ff9df3');
      this.fx.hitstop(0.13);
      this.fx.shake(6);
      att.applyHit({
        dmg: Math.max(1, Math.round(ctr.dmg * def.dmgMult * att.takenMult)),
        kb: ctr.kb, kbUp: 0, stun: 0.42, dir: -dir,
      });
      return;
    }

    const blocked = def.state === 'block' && def.grounded;

    // PARRY: block started within the parry window → attack turned away
    if (blocked && def.stateT <= PARRY.WINDOW && a.kind !== 'grab') {
      this.giveEnergy(def, PARRY.ENERGY);
      this.audio.sfx('parry');
      this.fx.ring(cx, cy, '#8fd8ff', 700, 7, 0.32);
      this.fx.guard(cx, cy, dir, '#8fd8ff', true);
      this.fx.popup(cx, cy - 44, 'PARRIED!', '#8fd8ff');
      this.fx.hitstop(0.12);
      this.fx.shake(5);
      if (!fromProjectile) {
        att.attack = null;
        att.setState('hitstun');
        att.stunT = PARRY.STAGGER;
        att.vx = -dir * 260;
        att.flashT = 0.06;
      }
      return;
    }

    if (blocked) {
      let chip = Math.max(1, Math.round(a.dmg * att.dmgMult * BLOCK.CHIP * def.takenMult));
      if (def.unicornT > 0) chip = 0;
      def.hp = Math.max(1, def.hp - chip);             // chip can't KO
      def.vx = dir * BLOCK.PUSH;
      this.giveEnergy(att, METER.CHIP_DEAL);
      this.audio.sfx('block');
      this.fx.spark(cx, cy, '#8fd8ff', 6, 240);
      this.fx.ring(cx, cy, '#8fd8ff', 350, 3, 0.22);
      this.fx.guard(cx, cy, dir);
      this.fx.shake(2);
      return;
    }

    // combo damage scaling: deeper into a chain → lighter hits
    const depth = Math.min(def.comboTaken, COMBO.SCALING.length - 1);
    const dmg = Math.max(1, Math.round(a.dmg * att.dmgMult * COMBO.SCALING[depth] * def.takenMult));
    // chained jabs shove less so strings stay in range; finishers launch normally
    let kb = a.kb;
    if (a.kind === 'punch' && def.comboTaken >= 1) kb *= COMBO.JAB_CHAIN_KB;
    def.applyHit({ dmg, kb, kbUp: a.kbUp || 0, stun: a.stun, dir });
    this.giveEnergy(att, METER.HIT_DEAL);
    this.giveEnergy(def, METER.HIT_TAKE);
    // BURN IT ALL is the ONE deliberate exception to the refill rule, and it is
    // marked so nobody "fixes" it. The move's whole cost is that it empties the
    // tank; handing 15 straight back on its own hit would refund that cost and
    // turn the signature trade into a free damage spike.
    //
    // Gated on usesRunway, same as refillRunway: a non-user's runway is pinned
    // at MAX and must stay untouched by this move too, not just by drain and
    // refill. (Plan bug: the original line here was `att.runway = 0` with no
    // guard, which would zero a non-user's pinned tank on contact.)
    if (a.kind === 'burn') { if (att.usesRunway) att.runway = 0; }
    else this.refillRunway(att);

    const attIdx = this.fighters.indexOf(att);
    this.maxCombo[attIdx] = Math.max(this.maxCombo[attIdx], def.comboTaken);
    if (def.comboTaken >= 2) this.hud.combo(attIdx, def.comboTaken);
    const milestone = COMBO.MILESTONES[def.comboTaken];
    if (milestone) {
      this.fx.popup(def.x, def.y - 170, milestone, '#29d9ff');
      this.audio.sfx('select');
      if (def.comboTaken >= 7) { this.fx.flash('#29d9ff', 0.14); this.fx.shake(6); }
    }

    const slap = a.kind === 'slap';
    const heavy = a.kind !== 'punch' && !slap;
    this.audio.sfx(fromProjectile ? (a.sfx || 'paperHit') : slap ? 'slapHit' : heavy ? 'kickHit' : 'punchHit');
    const words = a.words || ['POW!'];
    this.fx.popup(cx, cy - 30, words[Math.floor(Math.random() * words.length)], slap ? '#ff9df3' : heavy ? '#ff3d6e' : '#ffd23f');
    this.fx.spark(cx, cy, slap ? '#ff9df3' : heavy ? '#ff5c39' : '#ffd23f', slap ? 7 : heavy ? 14 : 9, slap ? 280 : heavy ? 430 : 330);
    this.fx.impact(cx, cy, dir, slap ? '#ff9df3' : heavy ? '#ff5c39' : '#ffd23f', slap ? 0.15 : heavy ? 0.85 : 0.45);
    this.fx.shake(a.shake || 6);
    this.fx.hitstop(slap ? 0.045 : heavy ? 0.1 : 0.06);
  }

  // 💸 Acqui-Hire: siphon energy instead of dealing damage.
  doSteal(att, def) {
    const dir = Math.sign(def.x - att.x) || att.facing;
    if (def.shieldT > 0) {
      def.shieldT = 0;
      def.vx = dir * 160;
      this.audio.sfx('block');
      this.fx.ring(def.x, def.y - 100, '#8fd8ff', 620, 6, 0.35);
      this.fx.popup(def.x, def.y - 140, 'OBJECTION!', '#8fd8ff');
      return;
    }
    const blocked = def.state === 'block' && def.grounded;
    if (blocked && def.stateT <= PARRY.WINDOW) {
      this.giveEnergy(def, PARRY.ENERGY);
      this.audio.sfx('parry');
      this.fx.ring(def.x, def.y - 100, '#8fd8ff', 700, 7, 0.32);
      this.fx.popup(def.x, def.y - 144, 'PARRIED!', '#8fd8ff');
      att.attack = null;
      att.setState('hitstun');
      att.stunT = PARRY.STAGGER;
      att.vx = -dir * 260;
      return;
    }
    if (blocked) {
      this.audio.sfx('block');
      this.fx.spark(def.x - dir * 20, def.y - 100, '#8fd8ff', 6, 240);
      this.fx.guard(def.x - dir * 20, def.y - 100, dir);
      return;
    }
    const amt = Math.min(STEAL.AMOUNT, Math.floor(def.energy));
    def.energy = Math.max(0, def.energy - amt);
    this.giveEnergy(att, amt);
    def.applyHit({ dmg: 0, kb: 110, kbUp: 0, stun: STEAL.stun, dir });
    def.hp = Math.min(def.maxHp, def.hp);            // dmg 0 → no health change
    const attIdx = this.fighters.indexOf(att);
    this.maxCombo[attIdx] = Math.max(this.maxCombo[attIdx], def.comboTaken);
    this.audio.sfx('steal');
    this.fx.coins(def.x, def.y - 90, 7);
    this.fx.spark(att.x, att.y - 100, '#ffd23f', 6, 260);
    this.fx.impact(def.x - dir * 20, def.y - 90, dir, '#ffd23f', 0.3);
    this.fx.popup(def.x, def.y - 150, amt > 0 ? '💸 ACQUI-HIRED!' : 'ALREADY BROKE!', '#ffd23f');
    if (amt > 0) this.fx.popup(att.x, att.y - 175, `+${amt}⚡`, '#57ff8a');
    this.fx.hitstop(0.07);
    this.fx.shake(4);
  }

  doGrab(att, def, a) {
    const dir = Math.sign(def.x - att.x) || att.facing;
    if (def.shieldT > 0) {
      def.shieldT = 0;
      def.vx = -dir * 220;
      att.vx = dir * -160;
      this.audio.sfx('block');
      this.fx.ring(def.x, def.y - 100, '#8fd8ff', 620, 6, 0.35);
      this.fx.popup(def.x, def.y - 140, 'OBJECTION!', '#8fd8ff');
      return;
    }
    const sp = a.special;
    const dmg = Math.max(1, Math.round(sp.dmg * att.dmgMult * def.takenMult));
    this.audio.sfx('grab');
    this.fx.hitstop(0.3);
    this.fx.popup(def.x, def.y - 150, 'ACQUIRED!', '#ff3d6e');
    // hoisted and thrown behind the attacker — sides swap
    def.x = att.x;
    def.applyHit({ dmg, kb: -dir * sp.kb, kbUp: sp.kbUp, stun: 0.55, dir: -dir });
    this.giveEnergy(att, METER.HIT_DEAL);
    this.giveEnergy(def, METER.HIT_TAKE);
    this.refillRunway(att);
    this.audio.sfx('throwSlam');
    this.fx.shake(14);
    this.fx.spark(att.x, att.y - 110, '#ff3d6e', 16, 460);
    this.fx.impact(att.x, att.y - 110, -dir, '#ff3d6e', 1);
    const attIdx = this.fighters.indexOf(att);
    this.maxCombo[attIdx] = Math.max(this.maxCombo[attIdx], def.comboTaken);
  }

  giveEnergy(f, amt) {
    const before = f.energy;
    f.energy = Math.min(METER.MAX, f.energy + amt);
    if (before < METER.MAX && f.energy >= METER.MAX) this.audio.sfx('meterFull');
  }

  // ---------------- specials plumbing ----------------
  onSpecialStart(f, sp) {
    this.fx.flash(f.def.c.accent, 0.12);
    this.fx.cutIn(f, sp.name || 'SPECIAL', null, f.x <= this.other(f).x ? -1 : 1);
    if (sp.type === 'grab') this.audio.sfx('grab');
    if (sp.type === 'rush') this.audio.sfx('rush');
  }

  // A button that appears to "do nothing" is the worst feel in a fighter.
  // Every rejected input now says why, right above the fighter's head.
  onSpecialDenied(f, kind) {
    this.audio.sfx('back');
    const i = this.fighters.indexOf(f);
    this.hud.denyMeter(i);
    const need = { special: METER.SPECIAL_COST, bomb: METER.BOMB_COST, super: METER.SUPER_COST };
    let msg = null;
    if (kind === 'steal') msg = `💸 RECHARGING ${f.stealCD.toFixed(1)}s`;
    else if (kind === 'dash') msg = `💨 RECHARGING ${f.dashCD.toFixed(1)}s`;
    else if (kind === 'stance') msg = `🔄 RECHARGING ${f.stanceCD.toFixed(1)}s`;
    else if (need[kind] !== undefined) {
      msg = `NEED ${Math.ceil(need[kind] - f.energy)} MORE ⚡`;
    }
    if (msg && this.fx.popup) this.fx.popup(f.x, f.y - 178, msg, '#ff8f8f');
  }

  spawnSlide(owner, i) {
    this.audio.sfx('projectile');
    // Read the params of the move that FIRED, not the character's signature
    // special — otherwise a projectile command normal quietly borrows the
    // signature's numbers. During a signature special the two are the same
    // object, so shipped behaviour is unchanged.
    const sp = owner.attack?.special || owner.special;
    this.projectiles.push({
      type: 'slide', owner, delay: 0,
      x: owner.x + owner.facing * 48, y: owner.y - 112 + (i - 1) * 10,
      vx: owner.facing * sp.speed, vy: 0, rot: 0,
      dmg: sp.dmg, kb: 220, kbUp: 0, stun: 0.24, dead: false,
      words: ['SLIDE!', 'NEXT SLIDE!'], sfx: 'paperHit', shake: 5,
    });
    this.fx.ring(owner.x + owner.facing * 48, owner.y - 112, owner.def.c.accent, 260, 3, 0.18);
  }

  spawnRain(owner) {
    this.audio.sfx('special');
    const opp = this.other(owner);
    const sp = owner.attack?.special || owner.special;
    for (let i = 0; i < sp.count; i++) {
      this.projectiles.push({
        type: 'coin', owner, delay: i * 0.16,
        x: Math.max(STAGE.MIN_X, Math.min(STAGE.MAX_X, opp.x + (i - 1) * 52)),
        y: -40, vx: 0, vy: 660, rot: 0,
        dmg: sp.dmg, kb: 120, kbUp: 0, stun: 0.3, dead: false,
        words: ['FUNDED!', 'CHA-CHING!'], sfx: 'coin', shake: 6, refund: sp.energyRefund,
      });
    }
  }

  // ---------------- PR bomb ----------------
  spawnBomb(owner) {
    this.audio.sfx('projectile');
    this.projectiles.push({
      type: 'bomb', owner, delay: 0,
      x: owner.x + owner.facing * 34, y: owner.y - 118,
      vx: owner.facing * BOMB.vx, vy: BOMB.vy, g: BOMB.g, rot: 0,
      dmg: BOMB.dmg, kb: BOMB.kb, kbUp: BOMB.kbUp, stun: BOMB.stun, dead: false,
      words: ['SERVED!', 'C&D!'], sfx: 'kickHit', shake: 8,
    });
  }

  explodeBomb(p) {
    p.dead = true;
    this.audio.sfx('paperHit');
    this.audio.sfx('grab');
    this.fx.ring(p.x, p.y, '#ff4757', 760, 8, 0.32);
    this.fx.impact(p.x, p.y, Math.sign(p.vx) || 1, '#ff4757', 0.9);
    this.fx.papers(p.x, p.y, 16);
    this.fx.shake(8);
    this.fx.flash('#ff4757', 0.1);
    const def = this.other(p.owner);
    if (def.state === 'ko') return;
    const hb = def.hurtbox();
    const nx = Math.max(hb.x, Math.min(p.x, hb.x + hb.w));
    const ny = Math.max(hb.y, Math.min(p.y, hb.y + hb.h));
    if (Math.hypot(nx - p.x, ny - p.y) <= BOMB.radius) {
      this.strike(p.owner, def, {
        kind: 'bomb', dmg: p.dmg, kb: p.kb, kbUp: p.kbUp, stun: p.stun,
        words: p.words, sfx: p.sfx, shake: p.shake, hasHit: false,
      }, true);
    }
  }

  // The victory beat. No new motion source is needed — the pose is the existing
  // arm-pump; what was missing was the room reacting to it.
  celebrate(winner, matchOver) {
    this.fx.confetti(winner.x, matchOver ? 40 : 20);
    this.fx.popup(winner.x, winner.y - 200,
      matchOver ? VICTORY_CRIES[(this.rng() * VICTORY_CRIES.length) | 0] : 'ROUND!',
      winner.def.c?.accent || '#ffd23f');
    if (matchOver) {
      this.fx.ring(winner.x, winner.y - 90, '#ffd23f', 640, 7, 0.5);
      this.fx.sparkles(winner.x, winner.y - 110, 8);
    }
  }

  // ---------------- traps ----------------
  // A placed hazard that arms on its own clock, then bites the first opponent
  // who walks over it. Deliberately area-denial rather than damage: it makes
  // ground the opponent used to own expensive to stand on.
  spawnTrap(owner, sp) {
    const max = sp.maxActive ?? 2;
    const mine = this.traps.filter(t => t.owner === owner);
    // At the cap the oldest gives way, so placing never silently does nothing.
    if (mine.length >= max) mine[0].dead = true;
    this.traps.push({
      owner,
      x: owner.x,
      y: STAGE.FLOOR,
      radius: sp.radius ?? 70,
      dmg: sp.dmg ?? 10,
      armT: sp.armTime ?? 0.35,
      life: sp.lifetime ?? 6,
      born: 0,
      dead: false,
    });
    this.audio.sfx('whiff');
    this.fx.dust(owner.x, owner.y, 4);
  }

  updateTraps(dt) {
    if (!this.traps.length) return;
    for (const t of this.traps) {
      if (t.dead) continue;
      t.born += dt;
      t.life -= dt;
      t.armT -= dt;
      if (t.life <= 0) { t.dead = true; continue; }
      if (t.armT > 0) continue;                       // still arming — harmless
      const victim = this.other(t.owner);
      if (victim.state === 'ko' || !victim.grounded) continue;   // jump it
      if (Math.abs(victim.x - t.x) > t.radius) continue;
      t.dead = true;
      this.fx.ring(t.x, STAGE.FLOOR - 10, '#ffd23f', 520, 6, 0.3);
      // Flagged as indirect: a counter stance turns a *swing* back on its
      // owner, and there is nobody swinging here — the floor bit you.
      this.strike(t.owner, victim, {
        kind: 'trap', dmg: t.dmg, kb: 180, kbUp: -240, stun: 0.32, shake: 7,
        sfx: 'paperHit', words: ['SNARED!', 'DUE DILIGENCE!', 'CLAWED BACK!'],
      }, true);
    }
    this.traps = this.traps.filter(t => !t.dead);
  }

  // ---------------- mystery drops ----------------
  updateDrops(dt) {
    this.dropClock += dt;
    if (!this.drops.length && this.dropClock >= this.nextDropAt) {
      this.drops.push({
        x: 180 + this.rng() * 600, y: -40, vy: DROPS.FALL_SPEED,
        landed: false, lifeT: DROPS.LIFETIME,
        effect: DROP_EFFECTS[Math.floor(this.rng() * DROP_EFFECTS.length)],
      });
      this.scheduleNextDrop();
    }
    for (const d of this.drops) {
      if (!d.landed) {
        d.y += d.vy * dt;
        if (d.y >= STAGE.FLOOR - 6) {
          d.y = STAGE.FLOOR - 6;
          d.landed = true;
          this.fx.dust(d.x, STAGE.FLOOR, 6);
          this.audio.sfx('block');
        }
        continue;
      }
      d.lifeT -= dt;
      if (d.lifeT <= 0) { d.dead = true; continue; }
      for (const f of this.fighters) {
        if (f.grounded && f.state !== 'ko' && f.state !== 'hitstun' && Math.abs(f.x - d.x) < DROPS.PICKUP_RANGE) {
          d.dead = true;
          this.applyDrop(f, d);
          break;
        }
      }
    }
    this.drops = this.drops.filter(d => !d.dead);
  }

  // fresh=true → round just started: use the short first-drop timing so even
  // quick KO rounds get their briefcase.
  scheduleNextDrop(fresh = false) {
    this.nextDropAt = this.dropClock + (fresh
      ? DROPS.FIRST_AT + this.rng() * DROPS.FIRST_JITTER
      : DROPS.INTERVAL_MIN + this.rng() * (DROPS.INTERVAL_MAX - DROPS.INTERVAL_MIN));
  }

  applyDrop(f, d) {
    const e = d.effect;
    e.apply(f, this);
    this.fx.popup(f.x, f.y - 175, e.label, e.id === 'toxic' ? '#ff4757' : '#ffd23f');
    if (e.id === 'toxic') {
      this.audio.sfx('burn');
      this.fx.flames(f.x, f.y - 20, 12, f.facing);
      this.fx.shake(7);
      f.flashT = 0.1;
    } else if (e.id === 'moon') {
      this.audio.sfx('unicorn');
      this.fx.ring(f.x, f.y - 80, '#ffd23f', 700, 6, 0.4);
    } else if (e.id === 'crash') {
      this.audio.sfx('back');
      const o = this.other(f);
      this.fx.popup(o.x, o.y - 160, '−25 ENERGY', '#9aa3c7');
    } else {
      this.audio.sfx('meterFull');
      this.fx.sparkles(f.x, f.y, 12);
      this.fx.ring(f.x, f.y - 80, '#8fd8ff', 480, 4, 0.3);
    }
  }

  doTeleport(f) {
    const opp = this.other(f);
    const dir = Math.sign(opp.x - f.x) || 1;
    this.fx.dust(f.x, f.y - 40, 10);
    this.fx.ring(f.x, f.y - 90, f.def.c.accent, 420, 4, 0.3);
    f.x = Math.max(STAGE.MIN_X, Math.min(STAGE.MAX_X, opp.x + dir * 84));
    f.facing = Math.sign(opp.x - f.x) || -dir;
    this.fx.dust(f.x, f.y - 40, 10);
    this.fx.ring(f.x, f.y - 90, f.def.c.accent, 420, 4, 0.3);
    this.audio.sfx('teleport');
  }

  onBurnBlast(f) {
    this.audio.sfx('burn');
    this.fx.flames(f.x + f.facing * 30, f.y, 22, f.facing);
    this.fx.ring(f.x + f.facing * 70, f.y - 80, '#ff9d1a', 600, 7, 0.3);
    this.fx.flash('#ff9d1a', 0.18);
    this.fx.shake(8);
  }

  onUnicorn(f) {
    this.audio.sfx('unicorn');
    this.fx.hitstop(UNICORN.POP_FREEZE);
    this.fx.flash('#ffffff', 0.5);
    this.fx.ring(f.x, f.y - 80, '#ffd23f', 900, 8, 0.5);
    this.fx.sparkles(f.x, f.y, 26);
    this.fx.popup(f.x, f.y - 190, 'UNICORN MODE!', '#ff9df3');
    this.fx.cutIn(f, 'UNICORN MODE', '#ff9df3', f.x <= this.other(f).x ? -1 : 1, true);
    this.fx.shake(10);
    const opp = this.other(f);
    if (Math.abs(opp.x - f.x) < 160 && opp.state !== 'ko') {
      opp.vx = (Math.sign(opp.x - f.x) || 1) * 340;
    }
  }

  pushAfterimage(f) {
    const last = this.afterimages[this.afterimages.length - 1];
    if (last && last.owner === f && this.t - last.born < 0.03) return;
    this.afterimages.push({ owner: f, x: f.x, y: f.y, facing: f.facing, color: f.def.c.suit, life: 0.25, born: this.t });
  }

  updateAfterimages(dt) {
    for (const g of this.afterimages) g.life -= dt;
    this.afterimages = this.afterimages.filter(g => g.life > 0);
  }

  // ---------------- projectiles ----------------
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      if (p.g) p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 9;
      if (p.type === 'slide') p.y += Math.sin(this.t * 10 + p.x * 0.02) * 18 * dt;

      if (p.type === 'bomb') {
        const target = this.other(p.owner);
        const hitFighter = target.state !== 'ko' && overlap({ x: p.x - 14, y: p.y - 14, w: 28, h: 28 }, target.hurtbox());
        if (hitFighter || p.y >= STAGE.FLOOR - 4) this.explodeBomb(p);
        if (p.x < -60 || p.x > STAGE.W + 60) p.dead = true;
        continue;
      }

      const def = this.other(p.owner);
      if (def.state !== 'ko' && overlap({ x: p.x - 16, y: p.y - 12, w: 32, h: 24 }, def.hurtbox())) {
        p.dead = true;
        const wasBlocked = def.state === 'block' && def.grounded;
        this.strike(p.owner, def, {
          kind: 'projectile', dmg: p.dmg, kb: p.kb, kbUp: p.kbUp, stun: p.stun,
          words: p.words, sfx: p.sfx, shake: p.shake, hasHit: false,
        }, true);
        if (p.refund && !wasBlocked) this.giveEnergy(p.owner, p.refund);
        if (p.type === 'coin') this.fx.coins(p.x, def.y - 60, 5);
        continue;
      }
      if (p.type === 'coin' && p.y >= STAGE.FLOOR) {
        p.dead = true;
        this.fx.coins(p.x, STAGE.FLOOR, 4);
        this.audio.sfx('coin');
      }
      if (p.x < -60 || p.x > STAGE.W + 60 || p.y > STAGE.H + 60) p.dead = true;
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  // ---------------- hints ----------------
  updateHints() {
    if (this.mode !== 'solo') return;
    const f = this.fighters[0];
    if (!f.controller.isHuman) return;
    const touch = isTouchDevice();
    if (!this.hintFlags.special && f.energy >= METER.SPECIAL_COST) {
      this.hintFlags.special = true;
      this.hud.hint(touch
        ? `⚡ SPECIAL READY — tap ⚡ for ${f.special.name}`
        : `⚡ SPECIAL READY — press L (or B) for ${f.special.name}`);
    }
    if (!this.hintFlags.super && f.energy >= METER.SUPER_COST) {
      this.hintFlags.super = true;
      this.hud.hint(touch
        ? '🦄 FULL METER — tap 🦄 for UNICORN MODE'
        : '🦄 FULL METER — press U (or G) for UNICORN MODE');
    }
    if (!this.hintFlags.combo && this.maxCombo[0] >= 3) {
      this.hintFlags.combo = true;
      this.hud.hint('🔥 COMBO! Keep hitting — punch, punch, punch, then 👟, then ⚡!');
    }
  }

  // ---------------- round & match flow ----------------
  doKO(winnerIdx, loserIdx) {
    const loser = this.fighters[loserIdx];
    const winner = this.fighters[winnerIdx];
    const dir = Math.sign(loser.x - winner.x) || 1;
    loser.setState('ko');
    loser.vx = dir * 380;
    loser.vy = -420;
    loser.airborne = true;
    this.hud.announce('K.O.!', 'ko');
    this.audio.sfx('ko');
    this.fx.flash('#ffffff', 0.65);
    this.fx.impact(loser.x - dir * 10, loser.y - 100, dir, '#ffffff', 1);
    this.fx.shake(22);
    this.fx.hitstop(0.32);
    this.timescale = 0.3;
    this.endRound(winnerIdx, true);
  }

  endRound(winnerIdx, byKO) {
    this.roundWinner = winnerIdx;
    this.roundWasKO = byKO;
    if (winnerIdx >= 0) {
      this.roundWins[winnerIdx] += 1;
      if (byKO) this.koRounds[winnerIdx] += 1;
    } else {
      this.hud.announce('DRAW');
    }
    this.setState('roundEnd');
  }

  updateRoundEnd(dt) {
    this.stateT += dt;
    this.timescale = Math.min(1, this.timescale + dt * 0.9);
    for (const f of this.fighters) f.update(dt * this.timescale, this, true);

    if (this.stateT >= ROUND.KO_SLOWMO_T && !this.roundBannerDone) {
      this.roundBannerDone = true;
      this.timescale = 1;
      if (this.roundWinner >= 0) {
        const w = this.fighters[this.roundWinner];
        if (w.state !== 'ko') { w.setState('victory'); this.celebrate(w, false); }
        const matchOver = this.roundWins[this.roundWinner] >= ROUND.WINS_NEEDED;
        if (!matchOver) this.hud.announce(`${w.def.name} TAKES IT`, 'small');
      }
    }

    if (this.stateT >= ROUND.KO_SLOWMO_T + ROUND.ROUND_END_T) {
      this.roundBannerDone = false;
      if (this.roundWinner >= 0 && this.roundWins[this.roundWinner] >= ROUND.WINS_NEEDED) {
        this.winnerIdx = this.roundWinner;
        this.setState('matchEnd');
        const w = this.fighters[this.winnerIdx];
        w.setState('victory');
        this.celebrate(w, true);
        this.hud.announce(`${w.def.name} WINS!`);
        this.audio.sfx(this.mode === 'solo' && this.winnerIdx !== 0 ? 'defeat' : 'victory');
      } else {
        this.nextRound();
      }
    }
  }

  nextRound() {
    this.roundNum += 1;
    this.timer = ROUND.TIME;
    this.lastTickSec = -1;
    this.projectiles = [];
    this.traps = [];
    this.afterimages = [];
    this.drops = [];
    this.scheduleNextDrop(true);
    this.fighters[0].resetForRound(0);
    this.fighters[1].resetForRound(1);
    this.hud.clearAnnounce();
    this.introStep = -1;
    this.setState('intro');
  }

  updateMatchEnd(dt) {
    this.stateT += dt;
    for (const f of this.fighters) f.update(dt, this, true);
    if (this.stateT >= ROUND.VICTORY_T) this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.audio.stopMusic();
    this.onEnd({
      mode: this.mode,
      difficulty: this.difficulty,
      isChallenge: this.isChallenge,
      winnerIdx: this.winnerIdx,
      score: [...this.roundWins],
      koRounds: [...this.koRounds],
      maxCombo: [...this.maxCombo],
      defs: [this.fighters[0].def, this.fighters[1].def],
    });
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }
}
