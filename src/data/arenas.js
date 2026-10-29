// Six startup-themed arenas, fully procedural and animated.
// Each arena draws its own background + floor; fighters render on top.

import { STAGE } from '../config.js';

const { W, H, FLOOR } = STAGE;

// Deterministic pseudo-random (stable per frame — no flicker).
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Future sponsorship hook: swap in real sponsors later.
export const SPONSORS = ['BOARDR', 'SNACKR', 'MYLO CRM', 'VULTURE CAP', 'YETI CLOUD', 'PIVOTPAL'];

function sky(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, FLOOR);
}

function floor(ctx, top, bottom, lineColor) {
  const g = ctx.createLinearGradient(0, FLOOR, 0, H);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.strokeStyle = lineColor; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, FLOOR); ctx.lineTo(W, FLOOR); ctx.stroke();
  // perspective slats
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const y = FLOOR + (H - FLOOR) * (i / 5);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function billboard(ctx, x, y, w, h, t, hue) {
  ctx.fillStyle = '#05070f';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = `hsl(${hue}, 70%, 12%)`;
  ctx.fillRect(x, y, w, h);
  const name = SPONSORS[Math.floor(t / 4) % SPONSORS.length];
  ctx.fillStyle = `hsla(${hue}, 90%, 65%, ${0.75 + 0.25 * Math.sin(t * 3)})`;
  ctx.font = `900 italic ${Math.floor(h * 0.44)}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, x + w / 2, y + h / 2 + 1);
}

// -------------------- The Boardroom --------------------
const cityR = rng(7);
const CITY = Array.from({ length: 26 }, (_, i) => ({ h: 40 + cityR() * 140, w: 22 + cityR() * 26, lit: cityR() }));
function drawBoardroom(ctx, t) {
  sky(ctx, '#0d1226', '#1a2138');
  // window wall
  ctx.fillStyle = '#070a18';
  ctx.fillRect(90, 60, 780, 300);
  const g = ctx.createLinearGradient(0, 60, 0, 360);
  g.addColorStop(0, '#101b3d'); g.addColorStop(1, '#1c1230');
  ctx.fillStyle = g; ctx.fillRect(100, 70, 760, 280);
  // moon
  ctx.fillStyle = '#f5efdc'; ctx.beginPath(); ctx.arc(760, 130, 26, 0, 7); ctx.fill();
  // skyline
  let x = 105;
  for (const b of CITY) {
    if (x > 850) break;
    ctx.fillStyle = '#0a0f24';
    ctx.fillRect(x, 350 - b.h, b.w, b.h);
    if (b.lit > 0.3) {
      ctx.fillStyle = Math.sin(t * 0.7 + b.h) > -0.6 ? 'rgba(255,210,63,0.5)' : 'rgba(255,210,63,0.12)';
      for (let wy = 350 - b.h + 8; wy < 342; wy += 14) ctx.fillRect(x + 5, wy, 4, 6);
    }
    x += b.w + 8;
  }
  // mullions
  ctx.strokeStyle = '#05070f'; ctx.lineWidth = 6;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(100 + i * 190, 70); ctx.lineTo(100 + i * 190, 350); ctx.stroke(); }
  // wall TV with live chart
  ctx.fillStyle = '#05070f'; ctx.fillRect(20, 150, 120, 80);
  ctx.fillStyle = '#0d2417'; ctx.fillRect(26, 156, 108, 68);
  ctx.strokeStyle = '#2ee66b'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const px = 28 + i * 5.2;
    const py = 210 - Math.max(0, Math.sin(i * 0.6 + Math.floor(t)) * 14 + i * 1.6);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
  billboard(ctx, 830, 380, 110, 40, t, 220);
  // ceiling light pools
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'rgba(120,150,255,0.05)';
    ctx.beginPath(); ctx.ellipse(240 + i * 240, FLOOR, 150, 24, 0, 0, 7); ctx.fill();
  }
  floor(ctx, '#232a4d', '#12162c', '#39406e');
}

// For rendered stages: a painter that runs a drawing made in world px inside a
// screen, by mapping the world rect (x, y, w, h) onto the screen's own box.
function inScreen(x, y, w, h, draw) {
  return (ctx, sw, sh, t) => {
    ctx.scale(sw / w, sh / h);
    ctx.translate(-x, -y);
    draw(ctx, t);
  };
}

// The Boardroom's wall TV, for the rendered stage: the same live chart, drawn
// into a screen of any size.
function tvChart(ctx, w, h, t) {
  ctx.fillStyle = '#0d2417';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2ee66b'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const px = w * (0.02 + i * 0.048);
    const py = h * 0.8 - Math.max(0, Math.sin(i * 0.6 + Math.floor(t)) * 14 + i * 1.6) * (h / 68);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
}

// -------------------- Demo Day --------------------
const crowdR = rng(23);
const CROWD = Array.from({ length: 60 }, () => ({ x: crowdR() * W, s: 8 + crowdR() * 10, p: crowdR() * 6.28, c: crowdR() }));
// The big screen, in world px: the 200x240 frame at (200, 55) and what is on it.
function demoScreen(ctx, t) {
  ctx.fillStyle = '#05070f'; ctx.fillRect(200, 55, 560, 240);
  const g = ctx.createLinearGradient(210, 65, 750, 285);
  g.addColorStop(0, '#2a1a66'); g.addColorStop(1, '#571d8f');
  ctx.fillStyle = g; ctx.fillRect(210, 65, 540, 220);
  ctx.fillStyle = '#ffd23f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 italic 64px system-ui';
  ctx.fillText('DEMO DAY', 480, 150);
  ctx.font = '800 22px system-ui'; ctx.fillStyle = '#29d9ff';
  ctx.fillText('LIVE  ·  PITCH BATTLE', 480, 205);
  ctx.fillStyle = '#ff3d6e';
  ctx.beginPath(); ctx.arc(365, 205, 6 + 2 * Math.sin(t * 6), 0, 7); ctx.fill();
}

function spotlights(ctx, t) {
  for (let i = 0; i < 2; i++) {
    const ang = Math.sin(t * 0.8 + i * 2.4) * 0.5 + (i ? 0.35 : -0.35);
    ctx.save();
    ctx.translate(i ? 40 : 920, 20);
    ctx.rotate(ang + (i ? 2.6 : 0.55));
    ctx.fillStyle = 'rgba(255,210,63,0.09)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(90, 620); ctx.lineTo(-90, 620); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function demoCrowd(ctx, t) {
  for (const c of CROWD) {
    const bounce = Math.abs(Math.sin(t * 2.2 + c.p)) * 6;
    ctx.fillStyle = c.c > 0.5 ? '#0d0618' : '#120a20';
    ctx.beginPath(); ctx.arc(c.x, H - 8 - bounce, c.s, Math.PI, 0); ctx.fill();
  }
}

function confetti(ctx, t) {
  const cr = rng(4);
  for (let i = 0; i < 26; i++) {
    const cx = cr() * W, sp = 24 + cr() * 60, ph = cr() * 500;
    const cy = ((t * sp + ph) % 560) - 20;
    ctx.fillStyle = ['#ffd23f', '#ff3d6e', '#29d9ff', '#57ff8a'][i % 4];
    ctx.fillRect(cx + Math.sin(t * 3 + i) * 8, cy, 5, 8);
  }
}

function drawDemoDay(ctx, t) {
  sky(ctx, '#140a2e', '#2a1152');
  demoScreen(ctx, t);
  spotlights(ctx, t);
  billboard(ctx, 30, 320, 130, 44, t, 290);
  billboard(ctx, 800, 320, 130, 44, t + 2, 180);
  floor(ctx, '#33195e', '#160b2e', '#5b2d9e');
  demoCrowd(ctx, t);          // in front of the stage lip
  confetti(ctx, t);
}

// -------------------- The Startup Garage --------------------
function drawGarage(ctx, t) {
  sky(ctx, '#20180f', '#302013');
  // garage door
  ctx.fillStyle = '#3d2c18';
  ctx.fillRect(230, 40, 500, 320);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? '#4a3720' : '#443119';
    ctx.fillRect(238, 48 + i * 62, 484, 56);
    ctx.strokeStyle = '#241708'; ctx.strokeRect(238, 48 + i * 62, 484, 56);
  }
  // door windows
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#0e1c33';
    ctx.fillRect(262 + i * 118, 58, 90, 36);
    ctx.fillStyle = 'rgba(180,210,255,0.15)';
    ctx.beginPath(); ctx.moveTo(262 + i * 118, 94); ctx.lineTo(302 + i * 118, 58); ctx.lineTo(322 + i * 118, 58); ctx.lineTo(282 + i * 118, 94); ctx.closePath(); ctx.fill();
  }
  // whiteboard
  ctx.fillStyle = '#e8e6df'; ctx.fillRect(40, 120, 150, 110);
  ctx.strokeStyle = '#9b8f77'; ctx.lineWidth = 5; ctx.strokeRect(40, 120, 150, 110);
  ctx.strokeStyle = '#d33'; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(55, 205); ctx.quadraticCurveTo(110, 200, 130, 160); ctx.quadraticCurveTo(150, 130, 172, 133); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = '900 16px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('MVP!!', 54, 145);
  ctx.fillStyle = '#1a6ed8'; ctx.font = '700 11px system-ui';
  ctx.fillText('users → moon', 54, 162);
  // shelf + junk
  ctx.fillStyle = '#241708'; ctx.fillRect(780, 150, 150, 10);
  ctx.fillStyle = '#c2b280'; ctx.fillRect(795, 122, 44, 28);
  ctx.fillStyle = '#8aa3c2'; ctx.fillRect(850, 130, 26, 20);
  ctx.fillStyle = '#b5493a'; ctx.fillRect(884, 118, 30, 32);
  // pizza boxes
  ctx.fillStyle = '#c9a35f'; ctx.fillRect(60, 452, 90, 12); ctx.fillRect(70, 440, 90, 12);
  ctx.fillStyle = '#a8813c'; ctx.fillRect(60, 452, 90, 3); ctx.fillRect(70, 440, 90, 3);
  // string lights
  ctx.strokeStyle = '#241708'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 30); ctx.quadraticCurveTo(480, 90, 960, 30); ctx.stroke();
  for (let i = 0; i < 14; i++) {
    const lx = 30 + i * 68;
    const ly = 30 + Math.sin((lx / 960) * Math.PI) * 55;
    const on = Math.sin(t * 2 + i * 1.7) > -0.7;
    ctx.fillStyle = on ? ['#ffd23f', '#ff3d6e', '#29d9ff', '#57ff8a'][i % 4] : '#443322';
    ctx.beginPath(); ctx.arc(lx, ly + 8, 5, 0, 7); ctx.fill();
    if (on) { ctx.fillStyle = 'rgba(255,220,120,0.12)'; ctx.beginPath(); ctx.arc(lx, ly + 8, 12, 0, 7); ctx.fill(); }
  }
  billboard(ctx, 40, 300, 120, 40, t, 40);
  floor(ctx, '#4a4038', '#241f1a', '#5e5248');
  // oil stain
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(660, 505, 70, 12, 0, 0, 7); ctx.fill();
}

// -------------------- The Stock Exchange --------------------
const candleR = rng(99);
const CANDLES = Array.from({ length: 30 }, () => ({ o: candleR(), c: candleR(), w: candleR() }));
const TICKER = 'NMBS +42.0%   ROCK −13.2%   LOOP +7.7%   HYPR +88.8%   APEX +3.1%   OMNI −2.4%   UEC +900%   ';
// The candlestick board and the index above it, in world px.
function marketBoard(ctx, t) {
  ctx.fillStyle = '#04121c'; ctx.fillRect(190, 110, 580, 210);
  ctx.strokeStyle = '#0f3852'; ctx.strokeRect(190, 110, 580, 210);
  const phase = Math.floor(t * 2);
  for (let i = 0; i < 28; i++) {
    const c = CANDLES[(i + phase) % 30];
    const cx = 205 + i * 20;
    const up = c.c > c.o;
    const bodyTop = 150 + Math.min(c.o, c.c) * 120;
    const bodyH = Math.max(6, Math.abs(c.o - c.c) * 120);
    ctx.strokeStyle = up ? '#2ee66b' : '#ff4757';
    ctx.beginPath(); ctx.moveTo(cx + 5, bodyTop - c.w * 18); ctx.lineTo(cx + 5, bodyTop + bodyH + c.w * 14); ctx.stroke();
    ctx.fillStyle = up ? '#2ee66b' : '#ff4757';
    ctx.fillRect(cx, bodyTop, 10, bodyH);
  }
  // big index number
  ctx.fillStyle = Math.sin(t * 2) > 0 ? '#2ee66b' : '#29d9ff';
  ctx.font = '900 italic 30px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('UEC 500  ▲ ' + (9000 + Math.floor(Math.sin(t) * 500)), 205, 100);
}

// The scrolling ticker band over (x, y, w, h), sized to the 34 px band it was drawn for.
function tickerBand(ctx, x, y, w, h, t) {
  const k = h / 34;
  ctx.fillStyle = '#05070f'; ctx.fillRect(x, y, w, h);
  ctx.font = `800 ${20 * k}px ui-monospace, monospace`; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(TICKER).width;
  const off = (t * 90 * k) % tw;
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(TICKER + TICKER, x - off, y + h / 2);
}

function drawExchange(ctx, t) {
  sky(ctx, '#061018', '#0a1f2e');
  // columns
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#0e2a40';
    ctx.fillRect(60 + i * 200, 90, 46, 300);
    ctx.fillStyle = '#123852';
    ctx.fillRect(52 + i * 200, 78, 62, 14);
    ctx.fillRect(52 + i * 200, 388, 62, 14);
  }
  marketBoard(ctx, t);
  tickerBand(ctx, 0, 344, W, 34, t);
  billboard(ctx, 812, 400, 120, 42, t, 150);
  floor(ctx, '#12303f', '#081820', '#1d4b5e');
}

// -------------------- The Unicorn Club --------------------
const sparkleR = rng(55);
const SPARKLES = Array.from({ length: 40 }, () => ({ x: sparkleR() * W, y: sparkleR() * 420, p: sparkleR() * 6.28, s: 1 + sparkleR() * 2.5 }));
function sparkles(ctx, t) {
  for (const s of SPARKLES) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.5 + s.p));
    ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    ctx.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
  }
}

function drawUnicornClub(ctx, t) {
  sky(ctx, '#12041f', '#2a0a3d');
  // neon rainbow arcs
  const cols = ['#ff3d6e', '#ff9d1a', '#ffd23f', '#57ff8a', '#29d9ff', '#7b5cff'];
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = cols[i];
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2 + i);
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(480, 430, 320 - i * 26, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // neon unicorn sign
  ctx.save();
  ctx.translate(480, 120);
  const glow = 0.75 + 0.25 * Math.sin(t * 5);
  ctx.strokeStyle = `rgba(255,120,240,${glow})`; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-46, 26); ctx.quadraticCurveTo(-50, -6, -22, -10);
  ctx.quadraticCurveTo(-12, -30, 8, -22); ctx.lineTo(26, -46);
  ctx.lineTo(20, -16); ctx.quadraticCurveTo(46, -6, 44, 26);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,120,240,${glow})`;
  ctx.font = '900 italic 17px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('THE UNICORN CLUB', 0, 58);
  ctx.restore();
  sparkles(ctx, t);
  billboard(ctx, 30, 330, 128, 42, t, 320);
  billboard(ctx, 802, 330, 128, 42, t + 3, 260);
  // disco floor
  floor(ctx, '#2a1048', '#120626', '#6e2d9e');
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = `hsla(${(i * 47 + t * 80) % 360}, 80%, 50%, 0.13)`;
    ctx.fillRect(i * 80, FLOOR + 3, 80, H - FLOOR);
  }
}

// -------------------- The VC Summit --------------------
function clouds(ctx, t) {
  for (let i = 0; i < 4; i++) {
    const cx = ((t * (9 + i * 4) + i * 300) % (W + 260)) - 130;
    const cy = 70 + i * 52;
    ctx.fillStyle = 'rgba(255,220,220,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 75, 17, 0, 0, 7);
    ctx.ellipse(cx + 45, cy - 9, 48, 14, 0, 0, 7);
    ctx.fill();
  }
}

// The waving banner between the poles at x 120 and 840, in world px.
function bannerCloth(ctx, t) {
  ctx.fillStyle = '#1c2a5e';
  ctx.beginPath();
  ctx.moveTo(120, 105); ctx.quadraticCurveTo(480, 140 + Math.sin(t * 1.4) * 8, 840, 105);
  ctx.lineTo(840, 150); ctx.quadraticCurveTo(480, 185 + Math.sin(t * 1.4) * 8, 120, 150);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.font = '900 italic 26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('VENTURE CAPITAL SUMMIT', 480, 132 + Math.sin(t * 1.4) * 8);
}

function drawSummit(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
  g.addColorStop(0, '#2c1250'); g.addColorStop(0.55, '#a1345c'); g.addColorStop(1, '#ff8f4d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, FLOOR);
  // sun
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(480, 300, 70, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,210,63,0.25)';
  ctx.beginPath(); ctx.arc(480, 300, 95 + Math.sin(t * 2) * 6, 0, 7); ctx.fill();
  clouds(ctx, t);
  // mountain layers
  ctx.fillStyle = '#3d1a52';
  ctx.beginPath(); ctx.moveTo(0, 420);
  ctx.lineTo(140, 280); ctx.lineTo(280, 400); ctx.lineTo(430, 250); ctx.lineTo(600, 410); ctx.lineTo(760, 290); ctx.lineTo(960, 420);
  ctx.lineTo(960, 480); ctx.lineTo(0, 480); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a1040';
  ctx.beginPath(); ctx.moveTo(0, 480);
  ctx.lineTo(200, 360); ctx.lineTo(400, 470); ctx.lineTo(560, 340); ctx.lineTo(740, 470); ctx.lineTo(880, 380); ctx.lineTo(960, 480);
  ctx.closePath(); ctx.fill();
  // snow caps
  ctx.fillStyle = 'rgba(255,240,250,0.85)';
  ctx.beginPath(); ctx.moveTo(430, 250); ctx.lineTo(455, 278); ctx.lineTo(438, 276); ctx.lineTo(420, 290); ctx.lineTo(408, 272); ctx.closePath(); ctx.fill();
  // summit banner
  ctx.strokeStyle = '#241708'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(120, 100); ctx.lineTo(120, 230); ctx.moveTo(840, 100); ctx.lineTo(840, 230); ctx.stroke();
  bannerCloth(ctx, t);
  // pennant flags
  for (let i = 0; i < 12; i++) {
    const fx = 150 + i * 60;
    const fy = 172 + Math.sin((fx / 960) * Math.PI) * 16 + Math.sin(t * 1.4) * 6;
    ctx.fillStyle = ['#ffd23f', '#ff3d6e', '#29d9ff'][i % 3];
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 16, fy); ctx.lineTo(fx + 8, fy + 18); ctx.closePath(); ctx.fill();
  }
  billboard(ctx, 30, 400, 120, 40, t, 20);
  floor(ctx, '#5e3a2d', '#2c1a14', '#7a4c38');
}

export const ARENAS = [
  // scrim: 30.7% -> 28.6%. Nothing is wrong with this stage structurally — set
  // it beside the Unicorn Club, the best arena on the roster, and the loss
  // breaks down identically (legs 70%, torso 28%, head 2%). The only
  // difference was that the skyline sits about 5 luminance brighter behind the
  // body, 26.5 against 20.9. 0.45 closes that gap and costs the night city
  // nothing that matters.
  { id: 'boardroom', name: 'THE BOARDROOM', tag: 'Quarterly results are in.', draw: drawBoardroom, tempo: 96, root: 0, mood: 'dark', scrim: 0.57,
    // Rendered in Blender for the 3D prototype (lab/blender/stages/boardroom.py).
    stage: {
      dir: 'assets/stages/boardroom',
      // cool, with the moon rimming the fighters from the window behind them
      light: { lit: [0.94, 0.97, 1.05], shadow: [0.8, 0.86, 1.06], rim: [0.16, 0.21, 0.34], back: [0.2, 0.4, -1], backColor: [0.37, 0.51, 0.85] },
      screens: {
        chart: tvChart,
        sponsor: (ctx, w, h, t) => billboard(ctx, 0, 0, w, h, t, 220),
      },
    } },
  { id: 'demoday', name: 'DEMO DAY', tag: 'Live on the main stage.', draw: drawDemoDay, tempo: 118, root: 3, mood: 'hype',
    stage: {
      dir: 'assets/stages/demoday',
      // a magenta wash from the truss behind, a cyan rim in front
      light: { lit: [1.01, 0.97, 1.02], shadow: [0.86, 0.8, 1.02], rim: [0.13, 0.31, 0.39], back: [-0.3, 0.3, -1], backColor: [0.61, 0.17, 0.54] },
      screens: {
        main: inScreen(200, 55, 560, 240, demoScreen),
        left: (ctx, w, h, t) => billboard(ctx, 0, 0, w, h, t, 290),
        right: (ctx, w, h, t) => billboard(ctx, 0, 0, w, h, t + 2, 180),
      },
      overlay(ctx, t) { spotlights(ctx, t); demoCrowd(ctx, t); confetti(ctx, t); },
    } },
  // scrim: 32.1% -> 29.2% of the body near-invisible. Stops at 0.45 rather than
  // the 0.52 the metric prefers — this stage is already the dimmest on the
  // roster, and past here the whiteboard, the shelving and the string lights
  // stop reading, which is the entire character of the room.
  { id: 'garage', name: 'THE STARTUP GARAGE', tag: 'Where it all begins.', draw: drawGarage, tempo: 104, root: 5, mood: 'lofi', scrim: 0.57,
    // Rendered in Blender for the 3D prototype (lab/blender/stages/garage.py).
    stage: {
      dir: 'assets/stages/garage',
      // the work lamp's warmth in front, moonlight through the door behind
      light: { lit: [1.04, 0.98, 0.9], shadow: [0.84, 0.81, 0.92], rim: [0.34, 0.25, 0.13], back: [0, 0.5, -1], backColor: [0.17, 0.27, 0.51] },
      screens: { sponsor: (ctx, w, h, t) => billboard(ctx, 0, 0, w, h, t, 40) },
    } },
  { id: 'exchange', name: 'THE STOCK EXCHANGE', tag: 'Buy the dip. Throw the punch.', draw: drawExchange, tempo: 124, root: 7, mood: 'tense',
    stage: {
      dir: 'assets/stages/exchange',
      // hall light, with the market board glowing green behind
      light: { lit: [0.96, 1, 1], shadow: [0.8, 0.9, 0.97], rim: [0.16, 0.29, 0.31], back: [0, 0.3, -1], backColor: [0.14, 0.51, 0.31] },
      screens: {
        board: inScreen(190, 80, 580, 240, marketBoard),
        ticker: (ctx, w, h, t) => tickerBand(ctx, 0, 0, w, h, t),
        sponsor: (ctx, w, h, t) => billboard(ctx, 0, 0, w, h, t, 150),
      },
    } },
  { id: 'unicorn', name: 'THE UNICORN CLUB', tag: 'Members only. Valuations $1B+.', draw: drawUnicornClub, tempo: 122, root: 8, mood: 'party',
    stage: {
      dir: 'assets/stages/unicorn',
      // neon: pink from the rainbow behind, violet at the edges
      light: { lit: [1.02, 0.95, 1.04], shadow: [0.87, 0.78, 1.05], rim: [0.34, 0.16, 0.44], back: [0, 0.2, -1], backColor: [0.71, 0.2, 0.61] },
      screens: {
        left: (ctx, w, h, t) => billboard(ctx, 0, 0, w, h, t, 320),
        right: (ctx, w, h, t) => billboard(ctx, 0, 0, w, h, t + 3, 260),
      },
      overlay: sparkles,
      overlayP: 0.65,          // they glitter on the back wall, so they move with it
    } },
  // scrim: the mountains sit directly behind the fighters at close to their own
  // mid-tones, which makes this the hardest stage to read a character against.
  // 34.1% -> 32.5% of the body near-invisible. Past ~0.55 the gold sun and the
  // bunting go grey and the stage stops looking like a summit, so this is as
  // far as it goes — it is still the worst arena, capped by its own art.
  // (An earlier revision claimed 41.8% -> 34.9% here. That came from a mask
  // that scored the contact shadow and floor pool as character, and from an
  // unpinned cast. See the note on KEEP in lab/contrast.js.)
  { id: 'summit', name: 'THE VC SUMMIT', tag: 'The air is thin up here.', draw: drawSummit, tempo: 100, root: 2, mood: 'epic', scrim: 0.62,
    stage: {
      dir: 'assets/stages/summit',
      // a low sun behind the fighters, warm on everything it can reach
      light: { lit: [1.05, 0.96, 0.9], shadow: [0.84, 0.8, 1], rim: [0.39, 0.26, 0.16], back: [0, 0.15, -1], backColor: [1.02, 0.51, 0.17] },
      screens: {
        banner: inScreen(120, 105, 720, 45, bannerCloth),
        sponsor: (ctx, w, h, t) => billboard(ctx, 0, 0, w, h, t, 20),
      },
      overlay: clouds,
      // the clouds drift in the sky, so they move with it when the camera
      // pans (the far layer is about 0.07), not with the fighters
      overlayP: 0.1,
    } },
];

export function getArena(id) {
  return ARENAS.find(a => a.id === id) || ARENAS[0];
}

export function randomArena() {
  return ARENAS[Math.floor(Math.random() * ARENAS.length)];
}
