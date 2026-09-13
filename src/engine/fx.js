// Juice: particles, comic-book word popups, screen shake, hitstop, rings, flashes.

import { FX_ART } from '../config.js';

// Fighting-game effects for the live 3D prototype (?gl): layered impact bursts,
// guard flashes, and a cut-in when a special starts. This file only keeps their
// state; engine/vfx.js draws them. With the flag off, impact(), guard() and
// cutIn() return at once and store nothing, so the classic effects play exactly
// as they always have. None of it touches hitstop: that is simulation time, and
// a peer with the flag must stay in lockstep with one without it.
export const FX_STYLE = { impact: false };

export class FXSystem {
  constructor() {
    this.particles = [];
    this.popups = [];
    this.rings = [];
    this.bursts = [];            // FX_STYLE.impact only
    this.playing = null;         // the cut-in on screen
    this.dimT = 0;
    this.shakeMag = 0;
    this.hitstopT = 0;
    this.flashCol = null;
    this.flashA = 0;
  }

  update(dt) {
    this.hitstopT = Math.max(0, this.hitstopT - dt);
    this.shakeMag *= Math.pow(0.001, dt);          // fast exponential decay
    if (this.shakeMag < 0.3) this.shakeMag = 0;
    this.flashA = Math.max(0, this.flashA - dt * 3.2);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.g || 0) * dt;
      if (p.spin) p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    for (const w of this.popups) w.t += dt;
    this.popups = this.popups.filter(w => w.t < w.dur);

    for (const r of this.rings) { r.t += dt; r.r += r.vr * dt; }
    this.rings = this.rings.filter(r => r.t < r.dur);

    if (this.bursts.length) {
      for (const b of this.bursts) b.t += dt;
      this.bursts = this.bursts.filter(b => b.t < b.dur);
    }
    if (this.playing) {
      this.playing.t += dt;
      if (this.playing.t >= this.playing.dur) this.playing = null;
    }
    this.dimT = Math.max(0, this.dimT - dt);
  }

  // A landed hit: a white-hot core, spikes thrown away from the attacker and
  // streaks along the blow. `dir` is the way the blow travels (+1 rightward);
  // `weight` runs from 0 (a slap) to 1 (a launcher).
  impact(x, y, dir, color, weight = 0.5) {
    if (!FX_STYLE.impact) return;
    const I = FX_ART.IMPACT, mix = (range) => range[0] + (range[1] - range[0]) * weight;
    const n = Math.round(mix(I.SPIKES));
    const spikes = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const away = Math.max(0, Math.cos(a) * dir);          // 1 straight along the blow
      spikes.push({ a, len: (0.9 + Math.random() * 0.6) * (1 + 0.8 * away), w: 0.14 + Math.random() * 0.1 });
    }
    const streaks = [];
    for (let i = Math.round(mix(I.STREAKS)); i > 0; i--) {
      streaks.push({ dy: (Math.random() - 0.5) * 2, len: 0.6 + Math.random() * 0.8, speed: 0.8 + Math.random() * 0.8 });
    }
    this.bursts.push({ kind: 'hit', x, y, dir, color, r: mix(I.R), t: 0, dur: mix(I.DUR), weight, spikes, streaks });
  }

  // A blocked hit (a hexagonal guard flash) or, with `parry`, a parried one.
  guard(x, y, dir, color = '#8fd8ff', parry = false) {
    if (!FX_STYLE.impact) return;
    const G = FX_ART.GUARD;
    this.bursts.push({ kind: parry ? 'parry' : 'guard', x, y, dir, color,
      r: parry ? G.PARRY_R : G.R, t: 0, dur: parry ? G.PARRY_DUR : G.DUR, rot: Math.random() * 0.5 });
  }

  // A projectile leaving the hand: a flare pointing where it flies, in the
  // colour of `who` (a fighter def) when no colour is given.
  launch(x, y, dir, color, who = null) {
    if (!FX_STYLE.impact) return;
    const L = FX_ART.LAUNCH;
    this.bursts.push({ kind: 'launch', x, y, dir, color, who, r: L.R, t: 0, dur: L.DUR });
  }

  // BURN RATE BLAST and BURN IT ALL: fire erupting out of the fighter's front.
  blast(x, y, dir) {
    if (!FX_STYLE.impact) return;
    const B = FX_ART.BLAST;
    const petals = [];
    for (let i = 0; i < B.PETALS; i++) {
      // mostly up and forward, the way the flames are thrown
      const a = -Math.PI / 2 + (i / (B.PETALS - 1) - 0.5) * Math.PI * 1.25 + dir * 0.35;
      petals.push({ a, len: 0.6 + Math.random() * 0.5, w: 0.18 + Math.random() * 0.1, hue: Math.random() });
    }
    this.bursts.push({ kind: 'blast', x, y, dir, color: '#ff9d1a', r: B.R, t: 0, dur: B.DUR, petals });
  }

  // A teleport: a pillar of light that pinches out where the fighter left and
  // opens where they arrive.
  warp(x, y, color, arriving, who = null) {
    if (!FX_STYLE.impact) return;
    const Wp = FX_ART.WARP;
    this.bursts.push({ kind: arriving ? 'arrive' : 'vanish', x, y, dir: 1, color, who, r: Wp.W, t: 0, dur: Wp.DUR });
  }

  // A special or super announced. `side` is -1 when the fighter is on the
  // left of the fight, +1 on the right; the band slides in from their side.
  // A null `color` wears the fighter's own. One at a time: the newest
  // replaces what is showing.
  cutIn(fighter, name, color, side, big = false) {
    if (!FX_STYLE.impact) return;
    const C = FX_ART.CUTIN;
    this.playing = { fighter, name, color, side, big, t: 0, dur: big ? C.SUPER_DUR : C.DUR, bust: null };
    this.dimT = Math.max(this.dimT, this.playing.dur);
  }

  get shakeX() { return this.shakeMag ? (Math.random() * 2 - 1) * this.shakeMag : 0; }
  get shakeY() { return this.shakeMag ? (Math.random() * 2 - 1) * this.shakeMag * 0.6 : 0; }

  shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); }
  hitstop(sec) { this.hitstopT = Math.max(this.hitstopT, sec); }
  flash(color = '#ffffff', a = 0.4) { this.flashCol = color; this.flashA = Math.max(this.flashA, a); }

  spark(x, y, color = '#ffd23f', n = 10, speed = 380) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 900,
        life: 0.25 + Math.random() * 0.3, size: 3 + Math.random() * 4, color, shape: 'spark', rot: a, spin: 8,
      });
    }
  }

  dust(x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30, y: y - Math.random() * 8,
        vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 70, g: 60,
        life: 0.35 + Math.random() * 0.3, size: 4 + Math.random() * 5, color: 'rgba(210,205,190,0.5)', shape: 'circle',
      });
    }
  }

  flames(x, y, n = 14, dir = 1) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + Math.random() * 60 * dir, y: y - Math.random() * 90,
        vx: dir * (60 + Math.random() * 220), vy: -120 - Math.random() * 200, g: -160,
        life: 0.3 + Math.random() * 0.35, size: 6 + Math.random() * 9,
        color: ['#ffd23f', '#ff9d1a', '#ff3d2e'][i % 3], shape: 'flame',
      });
    }
  }

  coins(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 50, y: y - Math.random() * 30,
        vx: (Math.random() - 0.5) * 260, vy: -220 - Math.random() * 260, g: 1000,
        life: 0.55 + Math.random() * 0.4, size: 5 + Math.random() * 3, color: '#ffd23f', shape: 'coin', rot: 0, spin: 10,
      });
    }
  }

  papers(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y: y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 320, vy: -80 - Math.random() * 200, g: 500,
        life: 0.5 + Math.random() * 0.4, size: 7 + Math.random() * 5, color: '#eef1ff', shape: 'paper', rot: Math.random() * 6, spin: 6,
      });
    }
  }

  // Victory confetti: falls from above the stage rather than bursting from the
  // fighter, so it reads as the room celebrating rather than as another hit.
  confetti(x, n = 26) {
    const cols = ['#ffd23f', '#ff3d6e', '#29d9ff', '#57ff8a', '#e332a9', '#eef1ff'];
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 520,
        y: -30 - Math.random() * 160,
        vx: (Math.random() - 0.5) * 90,
        vy: 90 + Math.random() * 150,
        g: 70,                                  // light: it flutters, it does not drop
        life: 1.6 + Math.random() * 1.4,
        size: 5 + Math.random() * 5,
        color: cols[(Math.random() * cols.length) | 0],
        shape: 'paper', rot: Math.random() * 6, spin: 5 + Math.random() * 6,
      });
    }
  }

  sparkles(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 70, y: y - Math.random() * 140,
        vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 60, g: 0,
        life: 0.4 + Math.random() * 0.4, size: 2 + Math.random() * 3,
        color: `hsl(${Math.floor(Math.random() * 360)}, 95%, 70%)`, shape: 'star', rot: 0, spin: 4,
      });
    }
  }

  ring(x, y, color = '#ffd23f', vr = 700, width = 6, dur = 0.35) {
    this.rings.push({ x, y, r: 10, vr, t: 0, dur, color, width });
  }

  // Comic word popups.
  //
  // A single hit can fire several of these at once — the move's name, an energy
  // number, a combo milestone — and they used to land on top of each other in a
  // jittered heap that read as one unreadable smear. Three rules fix that:
  // never repeat yourself, stack instead of overlap, and stop after a few.
  popup(x, y, text, color = '#ffd23f') {
    // keep long labels (mystery-drop names) on screen even in the corners
    const margin = 40 + text.length * 8;
    const px = Math.max(margin, Math.min(960 - margin, x + (Math.random() - 0.5) * 30));
    let py = y - 20 - Math.random() * 30;

    // 1. A word already on screen is not new information. Two hits landing in
    //    the same instant should say it once, not print it twice.
    if (this.popups.some(w => w.text === text && w.t < 0.2)) return;

    // 2. Stack above anything still occupying that spot, so a name and a number
    //    read as two lines rather than one collision.
    for (let guard = 0; guard < 6; guard++) {
      const clash = this.popups.find(w =>
        Math.abs(w.x - px) < 130 && Math.abs((w.y - w.t / w.dur * 34) - py) < 30);
      if (!clash) break;
      py -= 34;
    }

    this.popups.push({ x: px, y: py, text, color, t: 0, dur: 0.6, rot: (Math.random() - 0.5) * 0.5 });

    // 3. A hard cap. Past a few words the screen is shouting, not informing —
    //    drop the oldest so the newest (most relevant) one always survives.
    if (this.popups.length > 4) this.popups.splice(0, this.popups.length - 4);
  }

  draw(ctx) {
    for (const r of this.rings) {
      const k = r.t / r.dur;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const p of this.particles) {
      const k = Math.max(0, p.life / (p.maxLife || 0.5));
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle' || p.shape === 'flame') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.shape === 'flame' ? k : 1), 0, 7); ctx.fill();
      } else if (p.shape === 'coin') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.scale(Math.abs(Math.sin(p.rot * 2)) * 0.7 + 0.3, 1);
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.fill();
        ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      } else if (p.shape === 'paper') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      } else if (p.shape === 'star') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -1, p.size * 2, 2);
        ctx.fillRect(-1, -p.size, 2, p.size * 2);
        ctx.restore();
      } else { // spark
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size / 3, p.size * 2, p.size / 1.5);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // comic word popups
    for (const w of this.popups) {
      const k = w.t / w.dur;
      const scale = k < 0.25 ? 0.4 + (k / 0.25) * 0.8 : 1.2 - k * 0.2;
      ctx.save();
      ctx.translate(w.x, w.y - k * 34);
      ctx.rotate(w.rot);
      ctx.scale(scale, scale);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = '900 italic 34px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#05070f'; ctx.lineWidth = 7;
      ctx.strokeText(w.text, 0, 0);
      ctx.fillStyle = w.color;
      ctx.fillText(w.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawOverlay(ctx, W, H) {
    if (this.flashA > 0 && this.flashCol) {
      ctx.globalAlpha = Math.min(0.85, this.flashA);
      ctx.fillStyle = this.flashCol;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
}
