// What a flow and screen review before launch found (2026-11-09), each pinned
// here. Most are layout and wiring, so most of these read the stylesheet or
// the source; where the behaviour can run without a page, it runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const landscape = () => {
  const css = src('styles.css');
  const land = css.slice(css.indexOf('@media (max-height: 500px) and (orientation: landscape)'));
  return land.slice(0, land.indexOf('\n}\n'));
};

test('on a phone held sideways, sign-in scrolls to TRY ONE FIGHT FIRST', () => {
  assert.match(landscape(), /#scr-auth \{ justify-content: flex-start; overflow-y: auto; \}/);
});

test("a friend's call-out card shows at its own shape, not squashed into a 110 px square", () => {
  const css = src('styles.css');
  assert.doesNotMatch(css, /#modal-incoming canvas \{[^}]*width: 110px/);
  assert.match(css, /#shareCanvas, #challengeCard \{ width: 100%; height: auto;/);
  // and a short modal scrolls rather than squashing the card in it
  assert.match(css, /\.card-holder \{[^}]*flex-shrink: 0;/);
});

test('a tap outside the lobby, or Esc, cancels the search instead of hiding it', () => {
  const screens = src('src/ui/screens.js');
  assert.match(screens, /document\.querySelector\('\.modal-backdrop'\)\.onclick = \(\) => dismissModal\(\);/);
  const fn = screens.slice(screens.indexOf('export function dismissModal'), screens.indexOf('\n}\n', screens.indexOf('export function dismissModal')));
  assert.match(fn, /isModalOpen\('modal-lobby'\)\) \{ \$\('btn-lobby-cancel'\)\.click\(\); return true; \}/);
  assert.match(fn, /isModalOpen\('modal-pause'\) \|\| isModalOpen\('modal-live'\)\) return false;/);
  assert.match(src('src/main.js'), /\$\('btn-lobby-cancel'\)\.onclick = \(\) => \{ audio\.sfx\('back'\); leaveLobby\(\); closeModals\(\); \};/);
});

test('the first-time profile keeps what was typed through BACK and HOW TO PLAY', () => {
  assert.match(src('src/main.js'), /id = 'scr-profile';\s*renderProfile\(\{ keep: true \}\);/);
  assert.match(src('src/ui/screens.js'), /export function renderProfile\(\{ keep = false \} = \{\}\) \{\s*if \(!\(keep && draft && !Save\.profile\)\) draft = newDraft\(\);/);
});

test('a sign-in service that failed to load is tried again, and the error is plain', async () => {
  const online = src('src/net/online.js');
  assert.match(online, /\.catch\(\(e\) => \{ sbPromise = null; throw e; \}\);/, 'a failed load is kept');
  // under a fresh address: Chromium answers a second import of an address
  // that failed with the same failure, without fetching it (the final review)
  const { clientUrl } = await import('../src/net/online.js');
  assert.notEqual(clientUrl(1), clientUrl(0));
  assert.notEqual(clientUrl(2), clientUrl(1));
  // pinned to one release (online.js SUPABASE_JS): a floating `@2` let any
  // new 2.x reach players without a deploy
  assert.match(clientUrl(0), /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@\d+\.\d+\.\d+\/\+esm$/);
  assert.match(online, /sbPromise = import\(clientUrl\(sbTries\+\+\)\)/);
  assert.match(src('src/main.js'), /'Sign-in could not connect\. Check your connection and try again\.'/);
});

test("the room and invite links can be seen, and an empty one is not 'copied'", () => {
  const css = src('styles.css');
  assert.match(css, /\.modal \.link-row \.btn \{ width: auto; flex: none; \}/);
  assert.match(css, /\.auth-card \.link-row input \{ width: 100%;/, 'the sign-in email box lost its rule');
  const screens = src('src/ui/screens.js');
  assert.match(screens, /if \(!\$\('liveLink'\)\.value\) \{ toast\(/);
  assert.match(screens, /if \(!\$\('inviteLink'\)\.value\) \{ toast\(/);
});

test("the select screen's names are not narrowed to a letter a line", () => {
  assert.doesNotMatch(src('styles.css'), /\.pv-name \{ width: calc\(100% - 120px\); \}/);
});

test('a lobby that cannot connect offers the AI at once and stops saying stay', () => {
  const main = src('src/main.js');
  const fail = main.slice(main.indexOf('await lobby.join();'), main.indexOf('await lobby.join();') + 700);
  assert.match(fail, /\$\('lobbyHint'\)\.textContent = 'Fight the AI now/);
  assert.match(fail, /\$\('btn-lobby-ai'\)\.classList\.remove\('hidden'\);/);
  assert.match(src('index.html'), /id="lobbyHint"/);
});

test("the VS splash's level is not stroked dark, and the story's button fits", () => {
  const css = src('styles.css');
  assert.match(css, /\.vs-level \{\s*-webkit-text-stroke: 0;/);
  assert.match(css, /\.about-cta \.btn \{ width: 100%; max-width: 400px; \}/);
});

test('toasts wrap instead of losing their ends', () => {
  const css = src('styles.css');
  const toast = css.slice(css.indexOf('#toast {'), css.indexOf('}', css.indexOf('#toast {')));
  assert.doesNotMatch(toast, /text-overflow: ellipsis|white-space: nowrap/);
  // and as wide as its words: placed at left 50%, it shrank to half the screen
  assert.match(toast, /width: max-content; max-width: min\(92vw, 520px\)/);
});

test('on a phone, the HUD gives way on the company first, TAP TO CONTINUE sits clear of the pads, and upright asks to turn', () => {
  const css = src('styles.css');
  assert.match(css, /\.hud-co \{[^}]*flex-shrink: 100;/);
  assert.match(landscape(), /\.skip-hint \{ right: auto; left: 50%;/);
  assert.match(css, /\.screen-fight::after \{\s*content: '⟲ Turn your phone sideways for a bigger fight';/);
});

test('a keyboard can pick fighters, close modals and go back, and a focused control keeps its keys', async () => {
  const screens = src('src/ui/screens.js');
  assert.match(screens, /pressable\(tile, t\.id, /, 'the fighter grid cannot be used from the keyboard');
  assert.match(screens, /pressable\(tile, f\.id, /, 'the base styles cannot be picked from the keyboard');
  assert.match(screens, /tile\.tabIndex = 0;\s*tile\.setAttribute\('role', 'button'\);/);
  assert.match(screens, /if \(e\.key !== 'Escape' \|\| e\.repeat \|\| \$\('scr-fight'\)\.classList\.contains\('active'\)\) return;/);
  // the fight's keys go to a focused slider, not the fighter
  const { input } = await import('../src/engine/input.js');
  input.enabled = true;
  input.mode = 'solo';
  input.reset();
  let prevented = false;
  input.onKey({ code: 'ArrowLeft', target: { tagName: 'INPUT' }, preventDefault: () => { prevented = true; } }, true);
  assert.equal(prevented, false, 'the volume slider lost its arrow keys');
  input.onKey({ code: 'KeyA', target: { tagName: 'BODY' }, preventDefault: () => { prevented = true; } }, true);
  assert.equal(prevented, true, 'the fight lost its keys');
  // a key held into the pause menu and let go on the slider is let go
  input.reset();
  input.onKey({ code: 'KeyD', target: { tagName: 'BODY' }, preventDefault() {} }, true);
  assert.equal(input.pads[0].right, true);
  input.onKey({ code: 'KeyD', target: { tagName: 'INPUT' }, preventDefault() {} }, false);
  assert.equal(input.pads[0].right, false, 'a key let go on the slider stayed held');
  input.enabled = false;
  assert.match(src('src/main.js'), /input\.reset\(\);\s+\/\/ and nothing held through the pause stays held/);
  // Esc: not under the tutorial, and a slider or a link to copy does not keep it
  assert.match(screens, /if \(!\$\('tutorial'\)\.classList\.contains\('hidden'\) \|\| typing\(document\.activeElement\)\) return;/);
  assert.match(screens, /el\.tagName === 'INPUT' && !el\.readOnly && \/\^\(text\|email\|search\|tel\|url\|password\|number\)\$\/\.test\(el\.type\)/);
  // and the pause menu's slider gives the focus back as the fight resumes
  assert.match(src('src/main.js'), /if \(document\.getElementById\('modal-pause'\)\?\.contains\(document\.activeElement\)\) document\.activeElement\.blur\(\);\s*input\.reset\(\);[^\n]*\n\s*closeModals\(\);\s*currentGame\.paused = false;/);
});

test('the touch pads are not over the VS splash', () => {
  assert.match(src('styles.css'), /#scr-fight:has\(#vsSplash:not\(\.hidden\)\) \.touch \{ visibility: hidden; \}/);
  assert.match(src('index.html'), /<section id="scr-fight"[\s\S]*id="vsSplash"[\s\S]*id="touchControls"[\s\S]*<\/section>/, 'the pads or the splash left the fight screen');
});

// The phone test (rule 9's budget) used to be a page hosted elsewhere with a
// copy of the game's files inside, which went stale with every release and
// needed that host to open. It lives on the site now and reads the game's own
// files, so it tests whatever version is live, in any phone's browser.
test("the phone test page is the site's own: the game's files, nothing from outside, nothing to sign in to", () => {
  const page = src('lab/phone-test.html');
  const code = page.slice(page.indexOf('<script type="module">'));
  const imports = [...code.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 8, 'the page no longer imports the game');
  for (const from of imports) assert.match(from, /^\.\.\/src\//, `${from} is not the game's own file`);
  assert.match(code, /import \{[^}]*\bVERSION\b[^}]*\} from '\.\.\/src\/config\.js';/);
  assert.match(code, /\$\('ver'\)\.textContent = VERSION;/, 'the page does not say which version it timed');
  // rule 1: no outside script, stylesheet or font, and no fetch of its own:
  // its results go to the server the game's own way (net/perf.js, v3.22)
  assert.doesNotMatch(page.replace(/<!--[\s\S]*?-->/g, ''), /https?:\/\//, 'the page loads something from outside the site');
  assert.doesNotMatch(code, /\bfetch\(|localStorage|supabase/i);
  assert.match(code, /import \{ reportPerf, savedSettings \} from '\.\.\/src\/net\/perf\.js';/);
  assert.match(code, /await reportPerf\(\{\s*settings: savedSettings\(\), source: 'test', version: VERSION,/, "the page does not send its results, or not past the game's off switch");
  assert.match(code, /\$\('status'\)\.innerHTML = await send\(\);/, 'the tester is not told whether the results were sent');
});

test("the phone test's switches are all on in the game, and each leaves out what it says", async () => {
  const { RENDER } = await import('../src/engine/render.js');
  assert.equal(RENDER.light, true, 'the default game lost its stage light');
  const render = src('src/engine/render.js');
  assert.match(render, /function drawStageLight\(ctx\) \{\s*if \(!RENDER\.light\) return;/);
  assert.match(render, /function lightStack\(L, base, shake\) \{\s*showLayer\(L, 'glow', RENDER\.light\);\s*showLayer\(L, 'vig', RENDER\.light\);\s*if \(!RENDER\.light\) return;/);
  // and the page times every switch it names (round ten's; the pieces' own
  // switches are held to what they leave out in passes.test.js)
  const page = src('lab/phone-test.html');
  for (const key of ["blank: true", "dpr: 1", "fighters: false", "keyline: false", "mask: false", "ink: false", "aa: false",
    "keylight: false", "keyMode: 'source-atop'", "form: false", "rim: false", "shaded: false", "three: false"]) assert.ok(page.includes(key), `the breakdown lost ${key}`);
  // and turns each of them, and back
  for (const set of ['SHADE_PASSES.key = s.keylight', 'SHADE_PASSES.form = s.form', 'SHADE_PASSES.rim = s.rim',
    'STYLIZE.SHADE_KEY_MODE = s.keyMode', 'TOON.ink = s.ink', 'TOON.mask = s.mask', 'antialias(s.aa)',
    'SHADE_PASSES.key = SHADE_PASSES.form = SHADE_PASSES.rim = true', 'STYLIZE.SHADE_KEY_MODE = KEY_MODE',
    'TOON.ink = TOON.mask = true', 'antialias(true)']) assert.ok(page.includes(set), `the page no longer does ${set}`);
  // and every switch it turns is on in the game
  const { RENDER: R } = await import('../src/engine/render.js');
  const { STYLE } = await import('../src/engine/drawFighter.js');
  assert.deepEqual({ light: R.light, shadows: R.shadows, fighters: R.fighters, shaded: STYLE.shaded }, { light: true, shadows: true, fighters: true, shaded: true });
  assert.match(render, /function drawShadow\(ctx, f\) \{\s*if \(!RENDER\.shadows\) return;/);
  assert.equal((render.match(/if \(RENDER\.fighters\) drawFighter\(ctx, f, t, game\.other\(f\)\);/g) || []).length, 2);
  assert.match(render, /if \(!RENDER\.fighters\) \{/);
});
