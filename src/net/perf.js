// Performance reports: how the game runs on the devices it is played on, sent
// to the uec-game project when a match ends (main.js) and when the phone test
// finishes (lab/phone-test.html), so the owner can see how many devices play
// it, which ones, and where it runs slowly, without anyone pasting results.
//
// What is sent is the device's kind, never the player: the operating system
// and browser by family and version (not the whole user agent), the phone's
// model where the browser names it, the GPU, the screen, the pixel ratio, the
// cores and memory, and the frame rate, slow frames and drawing time. The one
// thing that tells two reports from the same device apart is a random number
// made on that device and kept in its own storage key: never in the save
// (Save.data), never in the profile sync, never beside the account. The table
// keeps no user id either (report_perf on the server, which checks every
// field and limits how often a device may send), and a report goes with the
// game's public key alone, never a signed-in player's session: through the
// Supabase client it would carry the player's token, and the project's request
// logs would tie it to the account for as long as they are kept. Only the
// owner reads the table.
//
// It is on unless the player turns it off in Settings (Save.settings.perf),
// or the browser sends Global Privacy Control, the browser's own off switch.
// A browser driven by a script (the lab's, the tests') is not a player and
// sends nothing.

import { SUPABASE_URL, SUPABASE_KEY } from './online.js';
import { SAVE_KEY } from '../config.js';

export const DEVICE_KEY = 'uec-device';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ---- may this device send?

export function perfAllowed(settings, nav = globalThis.navigator) {
  if (settings?.perf === false) return false;
  if (nav?.globalPrivacyControl === true) return false;
  if (nav?.webdriver) return false;
  return true;
}

// The game's own setting, for a page that runs without the game's state (the
// phone test, which is on the same site and so reads the same save).
export function savedSettings(store = globalThis.localStorage) {
  try { return JSON.parse(store?.getItem(SAVE_KEY) || 'null')?.settings ?? null; } catch (e) { return null; }
}

// ---- the device's random number

function newId(c = globalThis.crypto) {
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;        // version 4
  b[8] = (b[8] & 0x3f) | 0x80;        // the RFC's variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Made once and kept. Without storage (a private window that refuses it) it
// lasts the session, so such a device counts once a visit.
let sessionId = null;
export function deviceId(store = globalThis.localStorage) {
  try {
    const have = store?.getItem(DEVICE_KEY);
    if (have && UUID.test(have)) return have;
    if (!store) return (sessionId ??= newId());
    const id = newId();
    store.setItem(DEVICE_KEY, id);
    return store.getItem(DEVICE_KEY) === id ? id : (sessionId ??= id);
  } catch (e) {
    return (sessionId ??= newId());
  }
}

// ---- what kind of device

const clean = (s, max) => {
  if (s == null) return null;
  const t = String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

// The operating system and browser by family and major version, from the user
// agent. The in-app browsers come first: the game is shared on LinkedIn and
// in messages, and those wear Safari's or Chrome's name inside them.
export function uaFamily(ua = '') {
  let m, os = null, browser = null;
  if ((m = ua.match(/\b(?:iPhone|iPod).*? OS (\d+)[_.](\d+)/))) os = `iOS ${m[1]}.${m[2]}`;
  else if ((m = ua.match(/\biPad.*? OS (\d+)[_.](\d+)/))) os = `iPadOS ${m[1]}.${m[2]}`;
  else if ((m = ua.match(/\bAndroid (\d+(?:\.\d+)?)/))) os = `Android ${m[1]}`;
  else if (/\bCrOS\b/.test(ua)) os = 'ChromeOS';
  else if (/\bWindows\b/.test(ua)) os = 'Windows';
  else if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) os = 'macOS';
  else if (/\bLinux\b/.test(ua)) os = 'Linux';

  if (/\bLinkedInApp\b/.test(ua)) browser = 'LinkedIn app';
  else if (/\bInstagram\b/.test(ua)) browser = 'Instagram app';
  else if (/\bFBA[NV]\b|\bFB_IAB\b/.test(ua)) browser = 'Facebook app';
  else if ((m = ua.match(/\bEdg(?:A|iOS)?\/(\d+)/))) browser = `Edge ${m[1]}`;
  else if ((m = ua.match(/\bSamsungBrowser\/(\d+)/))) browser = `Samsung Internet ${m[1]}`;
  else if ((m = ua.match(/\bOPR\/(\d+)/))) browser = `Opera ${m[1]}`;
  else if ((m = ua.match(/\b(?:Firefox|FxiOS)\/(\d+)/))) browser = `Firefox ${m[1]}`;
  else if ((m = ua.match(/\b(?:CriOS|Chrome)\/(\d+)/))) browser = `Chrome ${m[1]}`;
  else if ((m = ua.match(/\bVersion\/(\d+)(?:\.(\d+))?.*\bSafari\//))) browser = `Safari ${m[1]}${m[2] ? `.${m[2]}` : ''}`;
  else if (ua) browser = 'other';
  return { os, browser };
}

// Everything about the device the report carries, from what the browser
// gives. `hints` is Chromium's answer to getHighEntropyValues: its user agent
// says Android 10 and model K on every Android phone, and only that call names
// the real ones. An iPad says Macintosh unless told apart by its touch screen.
export function describeDevice({ ua = '', hints = null, screen = null, dpr = 1, cores = null, memory = null, touchPoints = 0, gpu = null } = {}) {
  let { os, browser } = uaFamily(ua);
  if (os === 'macOS' && touchPoints > 1) os = 'iPadOS';
  const version = hints?.platformVersion ? String(hints.platformVersion).split('.') : null;
  if (version && os?.startsWith('Android')) os = `Android ${version[0]}`;
  // Windows 11 calls itself Windows NT 10.0 too; its platform version is 13 or more
  if (version && os === 'Windows') os = Number(version[0]) >= 13 ? 'Windows 11' : 'Windows 10';
  const int = (x, lo, hi) => (Number.isFinite(x) && x >= lo && x <= hi ? Math.round(x) : null);
  const real = (x, lo, hi) => (Number.isFinite(x) && x > lo && x <= hi ? Math.round(x * 100) / 100 : null);
  return {
    os: clean(os, 40),
    browser: clean(browser, 40),
    model: clean(hints?.model, 64),
    gpu: clean(gpu, 120),
    screen_w: int(screen?.width, 1, 10000),
    screen_h: int(screen?.height, 1, 10000),
    dpr: real(dpr, 0, 8),
    cores: int(cores, 1, 256),
    memory_gb: real(memory, 0, 1024),
  };
}

// The GPU's name, from a context made for the asking and let go at once (a
// page may hold only so many).
export function gpuName(doc = globalThis.document) {
  try {
    const gl = doc.createElement('canvas').getContext('webgl2') || doc.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name || null;
  } catch (e) {
    return null;
  }
}

// This device, asked once a session. The model waits at most half a second
// for the browser's answer. A failure is not kept: the next report asks again.
let devicePromise = null;
export function thisDevice() {
  if (!devicePromise) {
    devicePromise = (async () => {
      const nav = globalThis.navigator || {};
      let hints = null;
      try {
        hints = nav.userAgentData?.getHighEntropyValues ? await Promise.race([
          nav.userAgentData.getHighEntropyValues(['model', 'platformVersion']),
          new Promise((r) => setTimeout(() => r(null), 500)),
        ]) : null;
      } catch (e) { hints = null; }
      return describeDevice({
        ua: nav.userAgent || '', hints, screen: globalThis.screen, dpr: globalThis.devicePixelRatio || 1,
        cores: nav.hardwareConcurrency, memory: nav.deviceMemory, touchPoints: nav.maxTouchPoints || 0, gpu: gpuName(),
      });
    })();
    devicePromise.catch(() => { devicePromise = null; });
  }
  return devicePromise;
}

// ---- the report

const clamp = (x, lo, hi) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null);
// The server takes a setups list of up to 4 KB as it stores it, about twice
// its length as text (the phone test's twelve are 832 characters, 1.6 KB
// stored). A longer one is left out rather than losing the whole report.
export const SETUPS_MAX_CHARS = 2000;

// The call's arguments, every value inside what the server accepts; null when
// there is nothing to send. `setups` is a list: a match's steps of resolution,
// or the phone test's twelve setups.
export function perfPayload({ source, device, id, version, mode, scale, summary, setups = null }) {
  if (!summary || !Number.isFinite(summary.fps) || !id || !device) return null;
  return {
    p_source: source,
    p_device: id,
    p_version: version,
    p_os: device.os, p_browser: device.browser, p_model: device.model, p_gpu: device.gpu,
    p_screen_w: device.screen_w, p_screen_h: device.screen_h, p_dpr: device.dpr,
    p_cores: device.cores, p_memory_gb: device.memory_gb,
    p_mode: mode === '3d' ? '3d' : '2d',
    p_scale: clamp(scale, 0.01, 4),
    p_fps: clamp(summary.fps, 0, 500),
    p_slow: clamp(summary.slow, 0, 1),
    p_draw_ms: clamp(summary.draw_ms, 0, 1000),
    p_seconds: clamp(summary.seconds, 0, 3600),
    p_setups: Array.isArray(setups) && setups.length && JSON.stringify(setups).length <= SETUPS_MAX_CHARS ? setups : null,
  };
}

// Sends it, with the publishable key and nothing else: no session, no
// cookies. Fire and forget: a report that cannot be sent changes nothing for
// the player. Returns the server's word ('recorded', 'invalid', 'busy') or
// 'error', for the console and the lab.
export const PERF_URL = `${SUPABASE_URL}/rest/v1/rpc/report_perf`;
export async function sendPerf(payload, send = (...a) => globalThis.fetch(...a)) {
  if (!payload) return 'skipped';
  try {
    const res = await send(PERF_URL, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
    });
    if (!res.ok) return 'error';
    const said = await res.json();
    return typeof said === 'string' ? said : 'error';
  } catch (e) {
    return 'error';
  }
}

// Gathers and sends one report, when this device may: what main.js and the
// phone test call. Returns what sendPerf does, or 'off', 'skipped' and
// 'error'; it never throws. `send` is fetch, or a stand-in for the tests.
export async function reportPerf({ settings, send, ...report }) {
  try {
    if (!perfAllowed(settings)) return 'off';
    if (!report.summary) return 'skipped';
    const payload = perfPayload({ ...report, device: await thisDevice(), id: deviceId() });
    return await sendPerf(payload, send);
  } catch (e) {
    return 'error';
  }
}
