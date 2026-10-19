// All audio is synthesized live with the Web Audio API — no samples, no assets.
// SFX are one-shot synth recipes; music is a generative loop tuned per arena.

import { Save } from '../state.js';

const MINOR = [0, 2, 3, 5, 7, 8, 10, 12];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuf = null;
    this.music = null;
  }

  // Create/resume on a user gesture (autoplay policy).
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { return; }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applySettings();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applySettings() {
    if (!this.ctx) return;
    const s = Save.settings;
    this.master.gain.value = (s.volume / 100) * 0.9;
    this.sfxBus.gain.value = s.sfx ? 1 : 0;
    this.musicBus.gain.value = s.music ? 0.32 : 0;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  tone({ freq = 440, type = 'square', dur = 0.15, vol = 0.5, slide = 0, attack = 0.005, delay = 0, bus = null }) {
    if (!this.ctx) return;
    const t0 = this.t + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.5, freq = 1200, q = 1, slide = 0, type = 'bandpass', delay = 0, bus = null }) {
    if (!this.ctx) return;
    const t0 = this.t + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  sfx(name) {
    if (!this.ctx || !Save.settings.sfx) return;
    const S = {
      click:      () => this.tone({ freq: 660, type: 'square', dur: 0.06, vol: 0.25 }),
      select:     () => { this.tone({ freq: 440, dur: 0.07, vol: 0.3 }); this.tone({ freq: 660, dur: 0.09, vol: 0.3, delay: 0.06 }); },
      back:       () => this.tone({ freq: 330, type: 'square', dur: 0.08, vol: 0.25, slide: -110 }),
      whiff:      () => this.noise({ dur: 0.09, vol: 0.16, freq: 900, slide: 1400, q: 2 }),
      kickWhiff:  () => this.noise({ dur: 0.13, vol: 0.2, freq: 500, slide: 900, q: 2 }),
      punchHit:   () => { this.noise({ dur: 0.07, vol: 0.6, freq: 2600, slide: -1900, q: 0.9 }); this.tone({ freq: 170, type: 'sine', dur: 0.11, vol: 0.7, slide: -100 }); this.tone({ freq: 950, type: 'square', dur: 0.03, vol: 0.18 }); },
      slapHit:    () => { this.noise({ dur: 0.035, vol: 0.7, freq: 4200, slide: -2600, q: 0.8 }); this.noise({ dur: 0.02, vol: 0.5, freq: 7000, q: 2.5, delay: 0.002 }); this.tone({ freq: 360, type: 'sine', dur: 0.05, vol: 0.4, slide: -180 }); },
      kickHit:    () => { this.noise({ dur: 0.16, vol: 0.6, freq: 900, slide: -700, q: 0.8 }); this.tone({ freq: 110, type: 'sine', dur: 0.18, vol: 0.75, slide: -60 }); },
      block:      () => { this.tone({ freq: 2200, type: 'triangle', dur: 0.05, vol: 0.3 }); this.noise({ dur: 0.06, vol: 0.2, freq: 3000, q: 4 }); },
      grab:       () => { this.noise({ dur: 0.2, vol: 0.4, freq: 400, slide: 600 }); this.tone({ freq: 90, type: 'sawtooth', dur: 0.25, vol: 0.35, slide: -40 }); },
      throwSlam:  () => { this.noise({ dur: 0.3, vol: 0.7, freq: 500, slide: -420, q: 0.6 }); this.tone({ freq: 70, type: 'sine', dur: 0.35, vol: 0.9, slide: -35 }); },
      projectile: () => this.tone({ freq: 700, type: 'sawtooth', dur: 0.16, vol: 0.25, slide: 500 }),
      paperHit:   () => { this.noise({ dur: 0.1, vol: 0.4, freq: 2400, slide: -1600, q: 1.4 }); this.tone({ freq: 300, dur: 0.08, vol: 0.3, slide: -140 }); },
      burn:       () => { this.noise({ dur: 0.5, vol: 0.55, freq: 500, slide: 2200, q: 0.5, type: 'lowpass' }); this.tone({ freq: 80, type: 'sawtooth', dur: 0.4, vol: 0.4, slide: 60 }); },
      teleport:   () => { this.tone({ freq: 900, type: 'sine', dur: 0.18, vol: 0.3, slide: -700 }); this.tone({ freq: 300, type: 'sine', dur: 0.2, vol: 0.3, slide: 900, delay: 0.1 }); },
      rush:       () => this.noise({ dur: 0.4, vol: 0.4, freq: 700, slide: 2400, q: 1.5 }),
      coin:       () => { this.tone({ freq: 1320, type: 'square', dur: 0.09, vol: 0.22 }); this.tone({ freq: 1760, type: 'square', dur: 0.16, vol: 0.22, delay: 0.07 }); },
      special:    () => { this.tone({ freq: 220, type: 'sawtooth', dur: 0.3, vol: 0.35, slide: 660 }); this.noise({ dur: 0.25, vol: 0.25, freq: 1200, slide: 2400 }); },
      unicorn:    () => { [0, 4, 7, 12].forEach((s, i) => this.tone({ freq: 523 * Math.pow(2, s / 12), type: 'triangle', dur: 0.5, vol: 0.3, delay: i * 0.07 })); this.noise({ dur: 0.7, vol: 0.2, freq: 3000, slide: 4000, q: 0.7 }); },
      meterFull:  () => { this.tone({ freq: 880, type: 'triangle', dur: 0.1, vol: 0.3 }); this.tone({ freq: 1174, type: 'triangle', dur: 0.2, vol: 0.3, delay: 0.09 }); },
      hurt:       () => this.tone({ freq: 240, type: 'square', dur: 0.1, vol: 0.2, slide: -120 }),
      ko:         () => { this.noise({ dur: 0.8, vol: 0.9, freq: 400, slide: -320, q: 0.5, type: 'lowpass' }); this.tone({ freq: 60, type: 'sine', dur: 0.9, vol: 1, slide: -25 }); this.tone({ freq: 1200, type: 'sawtooth', dur: 0.5, vol: 0.2, slide: -1100 }); },
      round:      () => { this.tone({ freq: 392, type: 'triangle', dur: 0.4, vol: 0.5 }); this.tone({ freq: 196, type: 'triangle', dur: 0.5, vol: 0.5 }); },
      fight:      () => { this.tone({ freq: 523, type: 'sawtooth', dur: 0.12, vol: 0.4 }); this.tone({ freq: 784, type: 'sawtooth', dur: 0.3, vol: 0.4, delay: 0.1 }); },
      victory:    () => [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ freq: 392 * Math.pow(2, s / 12), type: 'square', dur: 0.22, vol: 0.3, delay: i * 0.12 })),
      defeat:     () => [7, 5, 3, 0].forEach((s, i) => this.tone({ freq: 294 * Math.pow(2, s / 12), type: 'triangle', dur: 0.3, vol: 0.35, delay: i * 0.18 })),
      timeTick:   () => this.tone({ freq: 1000, type: 'square', dur: 0.05, vol: 0.2 }),
      parry:      () => { this.tone({ freq: 1900, type: 'triangle', dur: 0.09, vol: 0.4 }); this.tone({ freq: 2540, type: 'triangle', dur: 0.16, vol: 0.32, delay: 0.05 }); this.noise({ dur: 0.08, vol: 0.16, freq: 5200, q: 3 }); },
      // SAME-DAY DELIVERY: a two-note scanner chirp when the order goes out,
      // and a falling whistle into a cardboard thud when it lands.
      order:      () => { this.tone({ freq: 1568, type: 'square', dur: 0.05, vol: 0.2 }); this.tone({ freq: 2093, type: 'square', dur: 0.08, vol: 0.2, delay: 0.07 }); },
      parcel:     () => { this.tone({ freq: 1400, type: 'sine', dur: 0.16, vol: 0.18, slide: -1000 }); this.noise({ dur: 0.18, vol: 0.6, freq: 380, slide: -260, q: 0.7, delay: 0.12 }); this.tone({ freq: 95, type: 'sine', dur: 0.2, vol: 0.7, slide: -45, delay: 0.12 }); },
      steal:      () => { this.tone({ freq: 1320, type: 'square', dur: 0.07, vol: 0.24 }); this.tone({ freq: 1980, type: 'square', dur: 0.09, vol: 0.24, delay: 0.06 }); this.noise({ dur: 0.14, vol: 0.2, freq: 2400, slide: 2600, q: 1.6, delay: 0.03 }); },
    };
    (S[name] || (() => {}))();
  }

  startMusic(arena) {
    this.stopMusic();
    if (!this.ctx) return;
    this.music = new MusicLoop(this, arena);
    this.music.start();
  }

  stopMusic() {
    if (this.music) { this.music.stop(); this.music = null; }
  }
}

// Generative fight loop: kick/snare/hat + bassline + arp, keyed off the arena.
class MusicLoop {
  constructor(engine, arena) {
    this.e = engine;
    this.arena = arena;
    this.step = 0;
    this.nextT = 0;
    this.timer = null;
    this.stepDur = 60 / (arena.tempo || 110) / 4;   // 16th notes
    this.rootHz = 65.4 * Math.pow(2, (arena.root || 0) / 12); // C2 base
    const dance = arena.mood === 'party' || arena.mood === 'hype' || arena.mood === 'tense';
    this.kickSteps = dance ? [0, 4, 8, 12] : [0, 8, 10];
    this.bassPat = [0, null, 0, null, 3, null, 0, null, 5, null, 3, null, 7, 5, 3, 2];
    this.arpPat = dance ? [0, 3, 5, 7, 10, 7, 5, 3] : [0, null, 3, null, 5, null, 3, null];
  }

  start() {
    this.nextT = this.e.t + 0.06;
    this.timer = setInterval(() => this.tick(), 40);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  tick() {
    if (!this.e.ctx) return;
    while (this.nextT < this.e.t + 0.14) {
      this.schedule(this.step % 16, this.nextT);
      this.nextT += this.stepDur;
      this.step++;
    }
  }

  note(deg, oct, t0, dur, type, vol) {
    const semis = MINOR[((deg % 7) + 7) % 7] + Math.floor(deg / 7) * 12;
    const freq = this.rootHz * Math.pow(2, semis / 12) * Math.pow(2, oct);
    const o = this.e.ctx.createOscillator();
    const g = this.e.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.e.musicBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  drum(kind, t0) {
    const e = this.e;
    if (kind === 'kick') {
      const o = e.ctx.createOscillator(), g = e.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t0);
      o.frequency.exponentialRampToValueAtTime(45, t0 + 0.1);
      g.gain.setValueAtTime(0.9, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      o.connect(g); g.connect(e.musicBus); o.start(t0); o.stop(t0 + 0.16);
    } else if (kind === 'snare') {
      const s = e.ctx.createBufferSource(); s.buffer = e.noiseBuf; s.loop = true;
      const f = e.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
      const g = e.ctx.createGain();
      g.gain.setValueAtTime(0.4, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
      s.connect(f); f.connect(g); g.connect(e.musicBus); s.start(t0); s.stop(t0 + 0.12);
    } else {
      const s = e.ctx.createBufferSource(); s.buffer = e.noiseBuf; s.loop = true;
      const f = e.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500;
      const g = e.ctx.createGain();
      g.gain.setValueAtTime(0.14, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
      s.connect(f); f.connect(g); g.connect(e.musicBus); s.start(t0); s.stop(t0 + 0.05);
    }
  }

  schedule(step, t0) {
    if (this.kickSteps.includes(step)) this.drum('kick', t0);
    if (step === 4 || step === 12) this.drum('snare', t0);
    if (step % 2 === 0) this.drum('hat', t0);
    const bar = Math.floor(this.step / 16) % 4;
    const b = this.bassPat[step];
    if (b !== null) this.note(b + (bar === 3 ? 2 : 0), 0, t0, this.stepDur * 1.8, 'sawtooth', 0.25);
    const a = this.arpPat[step % 8];
    if (a !== null && bar % 2 === 1) this.note(a, 2, t0, this.stepDur * 1.1, 'square', 0.07);
  }
}

export const audio = new AudioEngine();

// Unlock audio on the first real user gesture anywhere.
export function installAudioUnlock() {
  const unlock = () => { audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}
