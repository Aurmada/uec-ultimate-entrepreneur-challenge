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

test('a sign-in service that failed to load is tried again, and the error is plain', () => {
  const online = src('src/net/online.js');
  assert.match(online, /\.catch\(\(e\) => \{ sbPromise = null; throw e; \}\);/, 'a failed load is kept');
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
  input.enabled = false;
});

test('the touch pads are not over the VS splash', () => {
  assert.match(src('styles.css'), /#scr-fight:has\(#vsSplash:not\(\.hidden\)\) \.touch \{ visibility: hidden; \}/);
  assert.match(src('index.html'), /<section id="scr-fight"[\s\S]*id="vsSplash"[\s\S]*id="touchControls"[\s\S]*<\/section>/, 'the pads or the splash left the fight screen');
});
