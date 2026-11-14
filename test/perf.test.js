// Performance reports (v3.22): how a match ran on this device, sent to the
// uec-game project's report_perf() when it ends (engine/perfmeter.js,
// net/perf.js, main.js), and the phone test's results the same way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerfMeter } from '../src/engine/perfmeter.js';
import { PERF, SAVE_KEY, VERSION } from '../src/config.js';
import {
  DEVICE_KEY, perfAllowed, savedSettings, deviceId, uaFamily, describeDevice, perfPayload,
} from '../src/net/perf.js';

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// What report_perf() and the perf_reports table accept (HANDOFF "Backend"):
// change the two together. A report outside them is refused whole, so the
// client keeps every value inside.
function serverAccepts(p) {
  const len = (s, n) => s == null || (typeof s === 'string' && s.length <= n);
  const range = (x, lo, hi, open = false) => x == null || (Number.isFinite(x) && (open ? x > lo : x >= lo) && x <= hi);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return ['match', 'test'].includes(p.p_source) && uuid.test(p.p_device)
    && /^v[0-9]+(\.[0-9]+){1,2}$/.test(p.p_version)
    && len(p.p_os, 40) && len(p.p_browser, 40) && len(p.p_model, 64) && len(p.p_gpu, 120)
    && range(p.p_screen_w, 1, 10000) && range(p.p_screen_h, 1, 10000) && range(p.p_dpr, 0, 8, true)
    && range(p.p_cores, 1, 256) && range(p.p_memory_gb, 0, 1024, true)
    && ['3d', '2d'].includes(p.p_mode) && range(p.p_scale, 0, 4, true)
    && p.p_fps != null && range(p.p_fps, 0, 500) && range(p.p_slow, 0, 1)
    && range(p.p_draw_ms, 0, 1000) && range(p.p_seconds, 0, 3600)
    && (p.p_setups == null || (Array.isArray(p.p_setups) && JSON.stringify(p.p_setups).length <= 8000));
}

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()] };
};

// ---- the meter

test('the meter gives a match its frame rate, slow frames and drawing time', () => {
  const m = new PerfMeter();
  for (let i = 0; i < 720; i++) m.sample(1000 / 60, 3, 2);          // 12 s at 60
  let s = m.summary();
  assert.equal(s.fps, 60);
  assert.equal(s.slow, 0);
  assert.equal(s.draw_ms, 3);
  assert.equal(s.seconds, 12);
  assert.deepEqual(s.steps, [{ scale: 2, fps: 60, seconds: 12 }]);
  // one frame in ten dropped (two frames' time) is slow; one a touch late is not
  m.restart();
  for (let i = 0; i < 900; i++) m.sample(i % 10 === 0 ? 33.4 : i % 10 === 5 ? 20 : 16.7, 2, 2);
  s = m.summary();
  assert.equal(s.slow, 0.1);
  assert.ok(s.fps > 50 && s.fps < 57, `fps ${s.fps}`);
});

test('the meter leaves out a stall, a match too short to say anything and what came before restart', () => {
  const m = new PerfMeter();
  for (let i = 0; i < 300; i++) m.sample(16.7, 2, 2);                // 5 s
  assert.equal(m.summary(), null, `${PERF.MIN_SECONDS} s is the least worth sending`);
  m.sample(PERF.STALL + 1, 50, 2);                                    // the tab put away and back
  m.sample(0, 2, 2);
  m.sample(NaN, 2, 2);
  for (let i = 0; i < 400; i++) m.sample(16.7, 2, 2);
  assert.equal(m.summary().seconds, 11.7);
  assert.equal(m.summary().slow, 0);
  m.restart();
  assert.equal(m.summary(), null);
});

test('the meter says how long the match was drawn at each scale, as the resolution steps down', () => {
  const m = new PerfMeter();
  for (let i = 0; i < 100; i++) m.sample(40, 9, 2);                   // 4 s at 25 fps, 2x
  for (let i = 0; i < 360; i++) m.sample(25, 5, 1.5);                 // 9 s at 40 fps, 1.5x
  const s = m.summary();
  assert.deepEqual(s.steps, [{ scale: 2, fps: 25, seconds: 4 }, { scale: 1.5, fps: 40, seconds: 9 }]);
  assert.equal(s.seconds, 13);
});

// ---- who may send

test('a report goes unless the player turned it off, the browser asks not to, or a script drives it', () => {
  const nav = {};
  assert.equal(perfAllowed({ perf: true }, nav), true);
  assert.equal(perfAllowed({ volume: 80, music: true }, nav), true, 'a save from before v3.22, with no perf setting, reads as on');
  assert.equal(perfAllowed(null, nav), true);
  assert.equal(perfAllowed({ perf: false }, nav), false);
  assert.equal(perfAllowed({ perf: true }, { globalPrivacyControl: true }), false);
  assert.equal(perfAllowed({ perf: true }, { webdriver: true }), false);
  const store = memStore();
  store.setItem(SAVE_KEY, JSON.stringify({ settings: { perf: false } }));
  assert.equal(perfAllowed(savedSettings(store), nav), false, "the phone test does not read the game's own off switch");
  assert.equal(savedSettings(memStore()), null);
  assert.equal(savedSettings({ getItem() { throw new Error('denied'); } }), null);
});

test('the setting is on for a new player and the switch is in Settings, with a line in the story saying what is sent', async () => {
  const { Save } = await import('../src/state.js');
  assert.equal(Save.settings.perf, true);
  const html = src('index.html');
  assert.match(html, /<div class="modal hidden" id="modal-settings">[\s\S]*id="setPerf"[\s\S]*id="setPerfHint"[\s\S]*data-close/);
  const about = html.slice(html.indexOf('id="scr-about"'), html.indexOf('<!-- ============ MODALS'));
  assert.match(about, /id="aboutPerf"[^>]*>[^<]*frame rate[^<]*random number[^<]*nothing about you[^<]*Settings/);
  const screens = src('src/ui/screens.js');
  assert.match(screens, /Save\.setSetting\('perf', Save\.settings\.perf === false\)/);
});

// ---- the device's number

test("the device's number is made once, kept in its own key, and never in the save", () => {
  const store = memStore();
  const id = deviceId(store);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(deviceId(store), id);
  assert.deepEqual(store.keys(), [DEVICE_KEY]);
  assert.notEqual(DEVICE_KEY, SAVE_KEY);
  // a storage that refuses: one number for the session
  const refusing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const a = deviceId(refusing), b = deviceId(refusing);
  assert.equal(a, b);
  assert.notEqual(a, id);
  // a stored value that is not a number of ours is replaced
  const bad = memStore();
  bad.setItem(DEVICE_KEY, 'firdous@example.com');
  assert.notEqual(deviceId(bad), 'firdous@example.com');
  assert.match(bad.getItem(DEVICE_KEY), /^[0-9a-f-]{36}$/);
});

test('nothing but the reports reads the number: not the save, the profile sync or the account', () => {
  for (const file of ['src/state.js', 'src/net/cloud.js', 'src/auth.js', 'src/net/online.js']) {
    const code = src(file);
    assert.doesNotMatch(code, /from '[^']*perf\.js'|deviceId|DEVICE_KEY|uec-device/, `${file} reaches the device's number`);
  }
  // and the reports carry no user: no account, name, handle or email
  const perf = src('src/net/perf.js');
  assert.doesNotMatch(perf, /currentUser|auth\.js|Save\.profile|email|handle/);
});

// ---- what kind of device

test('the browser and system are told by family and version, never the whole user agent', () => {
  const cases = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', 'iOS 18.6', 'Safari 26.0'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 'Android 10', 'Chrome 141'],
    ['Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36', 'Android 14', 'Samsung Internet 28'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0', 'Windows', 'Firefox 144'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', 'Windows', 'Edge 141'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15', 'macOS', 'Safari 18.4'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31.1', 'iOS 18.5', 'LinkedIn app'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1', 'iOS 17.4', 'Chrome 130'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36', 'ChromeOS', 'Chrome 139'],
  ];
  for (const [ua, os, browser] of cases) assert.deepEqual(uaFamily(ua), { os, browser }, ua);
  assert.deepEqual(uaFamily(''), { os: null, browser: null });
});

test("a device is described from what the browser gives, inside the server's limits", () => {
  const android = describeDevice({
    ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    hints: { model: 'Ahlo 1', platformVersion: '13.0.0' },
    screen: { width: 360, height: 800 }, dpr: 2.0000000298, cores: 8, memory: 4,
    gpu: 'ANGLE (Qualcomm, Adreno (TM) 613, OpenGL ES 3.2)',
  });
  assert.deepEqual(android, {
    os: 'Android 13', browser: 'Chrome 141', model: 'Ahlo 1', gpu: 'ANGLE (Qualcomm, Adreno (TM) 613, OpenGL ES 3.2)',
    screen_w: 360, screen_h: 800, dpr: 2, cores: 8, memory_gb: 4,
  });
  // an iPad calls itself a Mac; its touch screen gives it away
  const ipad = describeDevice({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15', touchPoints: 5 });
  assert.equal(ipad.os, 'iPadOS');
  const win = (v) => describeDevice({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', hints: { platformVersion: v } }).os;
  assert.equal(win('15.0.0'), 'Windows 11');
  assert.equal(win('10.0.0'), 'Windows 10');
  // whatever a browser hands over, nothing past what the server takes
  const odd = describeDevice({
    ua: 'x', hints: { model: 'M'.repeat(200) }, gpu: `G\u0000P\nU ${'x'.repeat(500)}`,
    screen: { width: 0, height: 99999 }, dpr: 50, cores: 9999, memory: -1,
  });
  assert.equal(odd.model.length, 64);
  assert.equal(odd.gpu.length, 120);
  assert.match(odd.gpu, /^G P U x/);
  assert.deepEqual([odd.screen_w, odd.screen_h, odd.dpr, odd.cores, odd.memory_gb], [null, null, null, null, null]);
});

test('a report is inside what the server accepts, whatever the match measured', () => {
  const device = describeDevice({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Version/26.0 Mobile/15E148 Safari/604.1', screen: { width: 390, height: 844 }, dpr: 3, gpu: 'Apple GPU' });
  const id = deviceId(memStore());
  const base = { source: 'match', device, id, version: VERSION, mode: '3d', scale: 2 };
  const good = perfPayload({ ...base, summary: { fps: 57.3, slow: 0.02, draw_ms: 4.1, seconds: 84.2 }, setups: [{ scale: 2, fps: 57.3, seconds: 84.2 }] });
  assert.ok(serverAccepts(good), JSON.stringify(good));
  assert.equal(good.p_device, id);
  assert.equal(good.p_version, VERSION);
  for (const v of ['v3.22', 'v3.21.1']) assert.ok(serverAccepts({ ...good, p_version: v }));
  // a meter gone wrong is held inside the limits rather than refused
  const wild = perfPayload({ ...base, scale: 9, summary: { fps: 9999, slow: 3, draw_ms: 5000, seconds: 99999 } });
  assert.ok(serverAccepts(wild), JSON.stringify(wild));
  assert.deepEqual([wild.p_fps, wild.p_slow, wild.p_draw_ms, wild.p_seconds, wild.p_scale], [500, 1, 1000, 3600, 4]);
  // and nothing goes without a measurement and a device
  assert.equal(perfPayload({ ...base, summary: null }), null);
  assert.equal(perfPayload({ ...base, summary: { fps: NaN } }), null);
  assert.equal(perfPayload({ ...base, id: null, summary: { fps: 60 } }), null);
  assert.equal(perfPayload({ ...base, summary: { fps: 60 }, setups: [] }).p_setups, null);
  // the call is the whole of what is sent: no user agent, no account
  assert.deepEqual(Object.keys(good).sort(), ['p_browser', 'p_cores', 'p_device', 'p_dpr', 'p_draw_ms', 'p_fps', 'p_gpu',
    'p_memory_gb', 'p_mode', 'p_model', 'p_os', 'p_scale', 'p_screen_h', 'p_screen_w', 'p_seconds', 'p_setups', 'p_slow',
    'p_source', 'p_version']);
});

// ---- the game sends it

test('every match is timed afresh and reported once, when it ends, is quit or is cut off', () => {
  const main = src('src/main.js');
  assert.equal((main.match(/openPerf\(\);[^\n]*\n\s*resolution\.restart\(\);[^\n]*\n\s*currentGame = new Game\(\{/g) || []).length, 2,
    'a match, solo or online, is not timed afresh');
  for (const fn of ['function onMatchEnd(result) {', 'function onOnlineMatchEnd(result) {', 'function quitMatch() {', 'function abortOnline(msg) {']) {
    const at = main.indexOf(fn);
    assert.ok(at >= 0, fn);
    assert.match(main.slice(at, at + 200), /finishPerf\(\);/, `${fn} does not send the match's report`);
  }
  assert.match(main, /function finishPerf\(\) \{\s*if \(!perfOpen\) return;\s*perfOpen = false;/, 'a match could be sent twice');
  // timed as the resolution is judged: a round being fought, the page shown, not paused
  assert.match(main, /if \(judged\) matchPerf\.sample\(gap, drawMs, resolution\.scale\);/);
  assert.match(main, /settings: Save\.settings, source: 'match'/);
  // the drawing timed, both ways a fight is drawn
  assert.match(main, /function drawFight\(\) \{\s*const t0 = performance\.now\(\);\s*renderGame\(gctx, currentGame\);\s*drawMs = performance\.now\(\) - t0;/);
  assert.equal((main.match(/^\s+renderGame\(gctx, currentGame\);$/gm) || []).length, 1, 'a fight drawn without its time');
});

test('the reports never reach the fight: nothing the simulation runs imports them', () => {
  for (const file of ['src/engine/game.js', 'src/engine/fighter.js', 'src/engine/fighterState.js', 'src/engine/ai.js', 'src/engine/input.js', 'src/engine/fx.js', 'src/net/online.js']) {
    const code = src(file);
    assert.doesNotMatch(code, /from '[^']*(perfmeter|perf)\.js'|PerfMeter|matchPerf/, `${file} imports the reports`);
  }
});
