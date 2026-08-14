// Fighter entity: physics, state machine, attacks and specials.
// Hit *detection/resolution* lives in game.js; fighters own their own state.

import { STAGE, PHYS, ATTACKS, METER, UNICORN, BOMB, DASH, DROPS, COMBO, STEAL, STYLES, PLAYER_STATS, STANCE } from '../config.js';
import { SPECIALS } from '../data/fighters.js';
import { clampBody } from './proportions.js';
import { shapeAttack, ARCHETYPE_TICKS } from './moves.js';
import { slotButton, NO_SWING } from '../data/schema.js';
import { initState, resetState } from './fighterState.js';

function blankPad() {
  return { left: false, right: false, up: false, block: false, punch: false, kick: false, special: false, super: false };
}

export class Fighter {
  constructor(def, side, controller) {
    this.def = def;
    this.body = clampBody(def.body);
    this.side = side;                       // 0 = left start, 1 = right start
    this.controller = controller;
    // STYLE is the single source of character variation. The roster's legacy
    // per-fighter `stats` used to stack on top of it, which made Carl hit 58%
    // harder AND carry 10% more HP than a player's own founder — a straight
    // power tier, not a playstyle. Everyone now starts from PLAYER_STATS and
    // is differentiated only by their style's compensating multipliers.
    const st = STYLES[def.style] || STYLES.balanced;
    this.stats = {
      speed: PLAYER_STATS.speed * (st.speed ?? 1),
      power: PLAYER_STATS.power,            // damage variation lives in style.dmg
      hp: Math.round(PLAYER_STATS.hp * (st.hp ?? 1)),
    };
    this.maxHp = this.stats.hp;
    this.hp = this.maxHp;
    this.x = side === 0 ? 300 : 660;
    this.y = STAGE.FLOOR;
    this.vx = 0;                            // knockback velocity (decays)
    this.vy = 0;
    this.facing = side === 0 ? 1 : -1;
    this.state = 'idle';
    this.attack = null;
    this.pad = blankPad();
    this.prevPad = blankPad();
    this.special = SPECIALS[def.special] || SPECIALS.pitchdeck;
    // The character's own vocabulary, indexed by input. Everyone shares the
    // same grammar — movement, block, the four basics, the universal moves —
    // and differs only in what these add on top. A character with none is
    // complete, not broken.
    this.cmdBySlot = new Map();
    for (const cn of def.commandNormals || []) {
      if (cn && cn.slot) this.cmdBySlot.set(cn.slot, cn);
    }
    // Everything the simulation remembers, from one declaration.
    initState(this);
  }

  resetForRound(side) {
    this.hp = this.maxHp;
    this.x = side === 0 ? 300 : 660;
    this.y = STAGE.FLOOR;
    this.vx = this.vy = 0;
    this.facing = side === 0 ? 1 : -1;
    this.state = 'idle';
    this.attack = null;
    this.pad = blankPad();
    this.prevPad = blankPad();
    resetState(this);
  }

  get grounded() { return !this.airborne; }
  get alive() { return this.hp > 0; }
  get speedMult() {
    return this.stats.speed
      * (this.unicornT > 0 ? UNICORN.SPEED_MULT : 1)
      * (this.speedBuffT > 0 ? DROPS.BUFF_SPEED : 1);
  }
  get dmgMult() {
    return this.stats.power
      * (this.unicornT > 0 ? UNICORN.DMG_MULT : 1)
      * (this.dmgBuffT > 0 ? DROPS.BUFF_DMG : 1)
      * (this.stanceSet ? this.stanceSet.dmg : 1);
  }

  // A toggle, gated by its own cooldown. Order is fixed (null -> safety ->
  // capabilities -> safety) so two peers stepping the same inputs land in the
  // same stance — an order derived from Object.keys would depend on source
  // layout, which is not something lockstep should ever depend on.
  switchStance() {
    if (this.stanceCD > 0) return false;
    this.stanceId = this.stanceId === 'safety' ? 'capabilities' : 'safety';
    this.stanceCD = STANCE.CD;
    return true;
  }

  get stanceSet() { return this.stanceId ? STANCE.SETS[this.stanceId] : null; }

  get takenMult() { return this.stanceSet ? this.stanceSet.taken : 1; }
  get actionable() {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'jump'
      || this.state === 'block' || this.state === 'crouch';
  }

  pressed(k) { return this.pad[k] && !this.prevPad[k]; }

  // "Forward" is toward the opponent. Facing auto-tracks them while grounded
  // and free, so this is just the walk direction agreeing with where we point.
  get holdingForward() {
    const dir = (this.pad.right ? 1 : 0) - (this.pad.left ? 1 : 0);
    return dir !== 0 && dir === this.facing;
  }

  // Genre-standard rule: the direction held on the frame the button goes down
  // picks the variant. No command normal on that input ⇒ the neutral basic.
  // Returns a string (a basic) or the command-normal object itself.
  //
  // This lives inside the simulation, downstream of the Controller contract,
  // so keyboard, touch, AI and network players all resolve identically and the
  // netcode needs no knowledge of command normals at all.
  resolveBasic(button) {
    if (!this.cmdBySlot.size || !this.holdingForward) return button;
    return this.cmdBySlot.get('fwd+' + button) || button;
  }

  // Buffer the next chain input so mashing never drops a link.
  //
  // Resolution happens HERE, at press time, while the direction that selected
  // the variant is still readable. Storing the bare button and resolving later
  // would silently collapse every command normal back to its neutral basic the
  // moment it was used inside a combo — which is exactly where it matters.
  bufferChainInput(a) {
    if (a.buffered) return;
    for (const k of ['launch', 'slap', 'punch', 'kick', 'special', 'bomb', 'super', 'steal']) {
      if (this.pressed(k)) {
        a.buffered = COMBO.BASICS.includes(k) ? this.resolveBasic(k) : k;
        return;
      }
    }
  }

  hurtbox() {
    // crouching ducks you under high attacks — the reward for the stance.
    // A bigger body is a bigger target, which is what pays for its damage.
    const b = this.body;
    const full = PHYS.BODY_H * b.height;
    const h = this.airborne ? 120 * b.height : (this.crouching ? full * 0.68 : full);
    const w = PHYS.BODY_W * b.build;
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  // Active hit window → world-space hitbox rect (or null).
  hitbox() {
    const a = this.attack;
    if (!a) return null;
    if (this.stateT < a.startup || this.stateT > a.startup + a.active) return null;
    if (a.kind === 'projectile' || a.kind === 'rain' || a.kind === 'bomb') return null;   // damage via projectiles
    if (a.noHitbox) return null;              // counters absorb, traps place — neither swings
    const reach = a.reach || 82;
    const x0 = this.x + (this.facing > 0 ? 14 : -14 - reach);
    const yC = this.y + (a.hitY || -95);
    const tall = a.kind === 'aoe' ? 150 : 74;
    return { x: x0, y: yC - tall / 2, w: reach, h: tall, a };
  }

  // The counter stance, if it is currently open. Read by game.strike when a hit
  // arrives — nothing polls it, because nothing happens until someone swings.
  counterActive() {
    const a = this.attack;
    if (!a || a.kind !== 'counter') return null;
    const t = this.stateT - a.startup;
    if (t < 0 || t > (a.counterWindow || 0)) return null;
    const sp = a.special || {};
    return { dmg: sp.dmg ?? 14, kb: sp.kb ?? 300 };
  }

  update(dt, game, locked = false) {
    if (locked) this.pad = blankPad();       // intros/cinematics: no inputs, physics still runs
    else this.controller.update(this, game);
    const pad = this.pad;
    const opp = game.other(this);

    // Crouch is resolved once per frame so it can't go stale when an attack or
    // a jump takes over the state machine mid-hold.
    this.crouching = !!pad.down && this.grounded && this.state !== 'block';

    // timers
    this.flashT = Math.max(0, this.flashT - dt);
    this.dashCD = Math.max(0, this.dashCD - dt);
    this.stealCD = Math.max(0, this.stealCD - dt);
    this.stanceCD = Math.max(0, this.stanceCD - dt);
    this.speedBuffT = Math.max(0, this.speedBuffT - dt);
    this.dmgBuffT = Math.max(0, this.dmgBuffT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    if (this.unicornT > 0) {
      this.unicornT = Math.max(0, this.unicornT - dt);
      if (Math.random() < 12 * dt) game.fx.sparkles(this.x, this.y, 2);
    }
    if (this.comboTaken > 0 && this.state !== 'hitstun') {
      this.comboDropT -= dt;
      if (this.comboDropT <= 0) this.comboTaken = 0;
    }

    // auto-face the opponent while free and grounded
    if (this.grounded && this.state !== 'attack' && this.state !== 'ko' && this.state !== 'hitstun') {
      this.facing = opp.x >= this.x ? 1 : -1;
    }

    this.moveVx = 0;

    switch (this.state) {
      case 'ko':
      case 'victory':
        this.stateT += dt;
        break;

      case 'hitstun': {
        this.stateT += dt;
        if (this.stateT >= this.stunT && this.grounded) this.setState('idle');
        break;
      }

      case 'attack': {
        this.stateT += dt;
        this.updateAttack(dt, game);
        const a = this.attack;
        // buffer the next chain input even before this attack connects —
        // mashing must never drop a link
        this.bufferChainInput(a);
        // chain cancels — only once the attack CONNECTED (hit or block).
        // ONE RULE: any basic cancels into any other basic, up to MAX_CHAIN,
        // then a finisher. Command normals sit on a basic's button, so they
        // chain on exactly the same terms — no ladder, nothing extra to learn.
        if (a.hasHit && this.grounded && this.stateT >= a.startup && a.buffered) {
          const want = a.buffered;
          a.buffered = null;
          const wantKey = typeof want === 'string' ? want : slotButton(want.slot);
          const isBasic = COMBO.BASICS.includes(a.button || a.kind);
          const wantBasic = COMBO.BASICS.includes(wantKey);
          if (isBasic && wantBasic) {
            const n = a.chainN || 1;
            if (n < COMBO.MAX_CHAIN) {                              // any basic → any basic
              this.startAttack(want, game);
              this.attack.chainN = n + 1;
              if (wantKey !== 'kick') this.x += this.facing * 12;   // slaps/jabs step in
              break;
            }
          } else if (isBasic) {                                     // finishers from any basic
            if (want === 'steal' && this.stealCD <= 0) { this.startSteal(game); break; }
            if (want === 'special' && this.energy >= METER.SPECIAL_COST) { this.startSpecial(game); break; }
            if (want === 'bomb' && this.energy >= METER.BOMB_COST) { this.startBomb(game); break; }
            if (want === 'super' && this.energy >= METER.SUPER_COST) {
              this.activateUnicorn(game);
              this.attack = null;
              this.setState('idle');
              break;
            }
          }
        }
        const total = a.startup + a.active + a.recovery;
        if (this.stateT >= total) {
          this.attack = null;
          this.setState(this.airborne ? 'jump' : 'idle');
        }
        break;
      }

      case 'dash': {
        this.stateT += dt;
        this.moveVx = this.dashDir * DASH.SPEED;
        game.pushAfterimage(this);
        // dashes cancel into attacks for pressure
        if (this.stateT >= DASH.CANCEL_AFTER) {
          // A dash holds forward by definition, so a dash-cancel naturally
          // comes out as the command normal — the intended pressure route.
          if (this.pressed('punch')) { this.startAttack(this.resolveBasic('punch'), game); break; }
          if (this.pressed('kick')) { this.startAttack(this.resolveBasic('kick'), game); break; }
          if (this.pressed('special') && this.energy >= METER.SPECIAL_COST) { this.startSpecial(game); break; }
        }
        if (this.stateT >= DASH.DURATION) this.setState('idle');
        break;
      }

      default: {  // idle / walk / jump / crouch / block — actionable
        // Block is its own button now. Crouch (DOWN) is a stance you can still
        // attack from, so holding down no longer disables the whole moveset.
        if (pad.block && this.grounded) {
          this.setState('block');
        } else if (this.state === 'block' && !pad.block) {
          this.setState('idle');
        } else if (this.state !== 'block') {
          if (this.crouching && this.state !== 'attack') this.setState('crouch');
          else if (this.state === 'crouch' && !this.crouching) this.setState('idle');
        }

        if (this.state !== 'block') {
          if (this.pressed('super')) {
            if (this.energy >= METER.SUPER_COST) this.activateUnicorn(game);
            else game.onSpecialDenied(this, 'super');
          } else if (this.pressed('special')) {
            if (this.energy >= METER.SPECIAL_COST) this.startSpecial(game);
            else game.onSpecialDenied(this, 'special');
          } else if (this.pressed('bomb') && this.grounded) {
            if (this.energy >= METER.BOMB_COST) this.startBomb(game);
            else game.onSpecialDenied(this, 'bomb');
          } else if (this.pressed('steal') && this.grounded) {
            if (this.stealCD <= 0) this.startSteal(game);
            else game.onSpecialDenied(this, 'steal');
          } else if (this.pressed('dash') && this.grounded) {
            if (this.dashCD <= 0) this.startDash(game);
            else game.onSpecialDenied(this, 'dash');
          } else if (this.pressed('launch') && this.grounded) {
            this.startAttack(this.resolveBasic('launch'), game);
          } else if (this.pressed('slap') && !(this.airborne && this.airAttackUsed)) {
            this.startAttack(this.resolveBasic('slap'), game);
          } else if (this.pressed('punch') && !(this.airborne && this.airAttackUsed)) {
            this.startAttack(this.resolveBasic('punch'), game);
          } else if (this.pressed('kick') && !(this.airborne && this.airAttackUsed)) {
            this.startAttack(this.resolveBasic('kick'), game);
          } else if (pad.up && this.grounded) {
            this.vy = PHYS.JUMP_V;
            this.airborne = true;
            this.airAttackUsed = false;
            this.setState('jump');
            game.fx.dust(this.x, this.y, 4);
            game.audio.sfx('whiff');
          }

          if (this.state !== 'attack') {
            const dir = (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
            if (dir !== 0) {
              const sp = PHYS.WALK * this.speedMult * (this.airborne ? PHYS.AIR_DRIFT : 1);
              this.moveVx = dir * sp;
              this.movingBack = (dir !== this.facing);
              if (this.grounded) {
                if (this.state !== 'walk') this.setState('walk');
                this.walkPhase += dt * 11 * this.speedMult;
              }
            } else if (this.state === 'walk') {
              this.setState('idle');
            }
          }
        }
      }
    }

    // ---- physics ----
    this.x += (this.moveVx + this.vx) * dt;
    this.vx *= Math.exp(-PHYS.KB_DECAY * dt);
    if (Math.abs(this.vx) < 4) this.vx = 0;

    if (this.airborne) {
      this.y += this.vy * dt;
      this.vy += PHYS.GRAVITY * dt;
      if (this.y >= STAGE.FLOOR) {
        this.y = STAGE.FLOOR;
        this.airborne = false;
        this.vy = 0;
        game.fx.dust(this.x, this.y, 5);
        if (this.state === 'jump') this.setState('idle');
        else if (this.state === 'attack') { this.attack = null; this.setState('idle'); }
        else if (this.state === 'hitstun' && this.stateT >= this.stunT) this.setState('idle');
        else if (this.state === 'ko') this.vx *= 0.3;
      }
    }

    this.x = Math.max(STAGE.MIN_X, Math.min(STAGE.MAX_X, this.x));
    this.prevPad = { ...pad };
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  // The character's fighting style scales the shared move set, so the same
  // three buttons feel different in each pair of hands. Multipliers compensate
  // (faster ⇒ weaker) so a style is a flavour, not a power tier.
  get style() { return STYLES[this.def.style] || STYLES.balanced; }

  // `move` is either a basic's name or a command-normal object. A command
  // normal inherits its basic's presentation (words, shake, hitY) and overrides
  // only what it authored, so sparse frame data is still a complete move.
  startAttack(move, game) {
    const cn = typeof move === 'string' ? null : move;
    const button = cn ? slotButton(cn.slot) : move;
    const base = ATTACKS[button] || ATTACKS.punch;
    const fd = cn ? { ...base, ...cn.frameData } : base;
    const s = this.style;
    this.attack = {
      ...fd,
      // A non-strike archetype routes through the engine branch that already
      // implements it, so `kind` carries the archetype. `button` remembers
      // which basic the move sits on — that is what the cancel system reads,
      // so a command normal chains exactly like the basic it replaces.
      kind: cn && cn.archetype !== 'strike' ? cn.archetype : button,
      button,
      cmd: cn,
      hasHit: false,
      startup: fd.startup * s.startup,
      recovery: fd.recovery * s.recovery,
      dmg: fd.dmg * s.dmg,
      reach: (fd.reach || 84) * s.reach,
    };
    if (cn) {
      // Archetype params travel as the attack's own `special`, so every
      // existing per-frame implementation works on a command normal untouched.
      // Spread order decides which value the engine actually uses, and the
      // budget has already charged for one of them. For a counter or a trap
      // the params ARE the move and frameData is only the stance's timing, so
      // params must win — spreading frameData last let its `dmg` shadow them,
      // and LAWYERED was priced at 13 damage while hitting for 10. The price
      // is the contract; the move honours it. Every other archetype is priced
      // off frameData, so frameData stays last for those.
      const sp = NO_SWING.has(cn.archetype)
        ? { ...cn.frameData, ...(cn.params || {}), type: cn.archetype }
        : { ...(cn.params || {}), ...cn.frameData, type: cn.archetype };
      this.attack.special = sp;
      shapeAttack(this.attack, sp);
      // The move announces itself on impact. That popup is most of what makes
      // it read as this character's move rather than a retuned punch.
      this.attack.words = [cn.displayName];
    }
    this.setState('attack');
    game.audio.sfx(button === 'kick' ? 'kickWhiff' : 'whiff');
    if (this.airborne) this.airAttackUsed = true;
  }

  startBomb(game) {
    this.energy -= METER.BOMB_COST;
    this.attack = {
      kind: 'bomb', hasHit: false, hasFired: false,
      startup: BOMB.startup, active: BOMB.active, recovery: BOMB.recovery,
    };
    this.setState('attack');
    game.audio.sfx('whiff');
  }

  startSteal(game) {
    this.stealCD = STEAL.COOLDOWN;
    this.attack = {
      kind: 'steal', hasHit: false,
      startup: STEAL.startup, active: STEAL.active, recovery: STEAL.recovery,
      reach: STEAL.reach, hitY: -95,
    };
    this.setState('attack');
    game.audio.sfx('whiff');
  }

  startDash(game) {
    const dir = (this.pad.right ? 1 : 0) - (this.pad.left ? 1 : 0);
    this.dashDir = dir || this.facing;
    this.dashCD = DASH.COOLDOWN;
    this.setState('dash');
    game.fx.dust(this.x, this.y, 6);
    game.audio.sfx('rush');
  }

  startSpecial(game) {
    if (this.airborne) return;                       // specials are grounded
    const sp = this.special;
    // A stance switch is a toggle, not a strike — it never becomes an attack.
    // Intercepted here, before the attack object is built, so it does not
    // fall through to `kind: 'stance'` with no engine branch to run it.
    if (sp.type === 'stance') {
      this.energy -= METER.SPECIAL_COST;
      this.switchStance();
      this.attack = null;
      this.setState('idle');
      game.onSpecialStart(this, sp);
      return;
    }
    this.energy -= METER.SPECIAL_COST;
    const a = {
      kind: sp.type, special: sp, hasHit: false,
      startup: sp.startup || 0.15,
      active: sp.active || 0.1,
      recovery: sp.recovery || 0.3,
      dmg: sp.dmg, reach: sp.reach, kb: sp.kb || 260, kbUp: sp.kbUp || 0,
      stun: 0.34, shake: 9, words: ['ZAP!'],
      // projectile's fired/fireT are seeded by shapeAttack below — one owner,
      // so the command-normal path can't drift out of sync with this one again.
      rushT: 0, lastRushHit: -1, teleported: false,
    };
    this.attack = shapeAttack(a, sp);
    this.setState('attack');
    game.onSpecialStart(this, sp);
  }

  updateAttack(dt, game) {
    const a = this.attack;
    if (a.kind === 'bomb') {
      if (this.stateT >= a.startup && !a.hasFired) {
        a.hasFired = true;
        game.spawnBomb(this);
      }
      return;
    }
    const sp = a.special;
    if (!sp) return;
    const activeT = this.stateT - a.startup;

    if (activeT < 0) return;
    const tick = ARCHETYPE_TICKS[sp.type];
    if (tick) tick(this, a, sp, dt, game, activeT);
  }

  activateUnicorn(game) {
    this.energy -= METER.SUPER_COST;
    this.unicornT = UNICORN.DURATION;
    game.onUnicorn(this);
  }

  // Applied by game when a hit lands on this fighter.
  applyHit({ dmg, kb, kbUp, stun, dir }) {
    this.hp = Math.max(0, this.hp - dmg);
    this.vx = dir * kb;
    if (kbUp) {
      this.vy = kbUp;
      this.airborne = true;
    }
    this.stunT = stun;
    this.flashT = 0.09;
    this.attack = null;
    this.setState('hitstun');
    this.comboTaken += 1;
    this.comboDropT = 0.55;
  }
}
