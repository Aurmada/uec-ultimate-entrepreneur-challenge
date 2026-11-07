// The way through the game around the fights: what a new player meets, the
// select screen, the results, a phone held sideways. Much of it is in the
// page (main.js, screens.js, styles.css), so some of these read the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { levelOffer, LEVEL_ORDER, GUEST_SCREENS, guestFightOffered, pickGuestFight } from '../src/ui/flow.js';
import { Save } from '../src/state.js';
import { Game } from '../src/engine/game.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fn = (text, name) => {
  const i = text.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `no function ${name}`);
  return text.slice(i, text.indexOf('\n}\n', i));
};

// A new player's first fight was Rookie and every one after it Contender,
// with nothing on screen to say so. A new save stays at Rookie; the level is
// said on the VS splash and the results, which offer the next one up after a
// win and down after a loss.
test('a new player stays at Rookie, and the level is said and offered, never changed unannounced', () => {
  assert.equal(Save.data.lastDifficulty, 'intern');
  assert.deepEqual(LEVEL_ORDER, ['intern', 'founder', 'mogul']);
  assert.deepEqual(levelOffer('intern', true), { to: 'founder', up: true });
  assert.deepEqual(levelOffer('founder', true), { to: 'mogul', up: true });
  assert.deepEqual(levelOffer('founder', false), { to: 'intern', up: false });
  assert.equal(levelOffer('mogul', true), null);
  assert.equal(levelOffer('intern', false), null);
  const main = src('src/main.js');
  assert.doesNotMatch(main, /lastDifficulty \|\| 'founder'/, 'a missing level still means Contender');
  assert.match(fn(main, 'reallyStartMatch'), /\$\('vsLevel'\)\.textContent = level/, 'the VS splash does not say the level');
  assert.match(fn(main, 'renderResults'), /levelOffer\(r\.difficulty, won\)/, 'the results do not offer a level');
});

// Quick Fight, Next Fight and the live lobby played as whoever was last
// tapped on the select screen, even backed out of; CHOOSE RIVAL's first tap
// picked who you played as; and a rival drawn at random could be yourself
// (the roster's own fighters have no baseId, so Elo met Elo).
test('you fight as who you last fought as, CHOOSE RIVAL picks the rival, and chance never matches you with yourself', () => {
  const main = src('src/main.js'), screens = src('src/ui/screens.js');
  for (const f of ['quickFight', 'nextFight', 'startPairedMatch']) {
    assert.doesNotMatch(fn(main, f), /playerDef\(\)/, `${f} plays as the select screen's pick`);
    assert.match(fn(main, f), /savedSelfDef\(\)/, `${f} does not play as you`);
  }
  for (const f of ['quickFight', 'nextFight']) assert.doesNotMatch(fn(main, f), /\.baseId\)/, `${f} leaves you in the pool`);
  assert.match(fn(main, 'quickFight'), /rosterIdOf\(p1Def\)/);
  assert.match(screens, /btn-arcade'\)\.onclick = .*openSelect\('solo', 'p2'\)/, 'CHOOSE RIVAL opens on your side');
  assert.match(main, /btn-changefighter'\)\.onclick = .*'p2'/, 'CHANGE RIVAL opens on your side');
  assert.match(fn(screens, 'onFight'), /resolveDef\(sel\.p2 \|\| 'random', rosterIdOf\(p1Def\)\)/, 'a random rival can be you');
});

// The results: your own best combo (it was the better of the two, so often
// the rival's), and the next fight and the menu before the share links.
test('the results show your own best combo and lead with the next fight', () => {
  const r = fn(src('src/main.js'), 'renderResults');
  assert.match(r, /r\.maxCombo\[li\]\}`, 'YOUR BEST COMBO'/);
  assert.match(fn(src('src/main.js'), 'shareCard'), /r\.maxCombo\[r\.localIdx \?\? 0\]/, "the result card brags the rival's combo");
  const html = src('index.html');
  const res = html.slice(html.indexOf('id="scr-results"'), html.indexOf('<!-- ============ PROFILE'));
  const order = ['btn-next', 'btn-rematch', 'btn-changefighter', 'btn-res-menu', 'btn-sharecard'].map((id) => res.indexOf(`id="${id}"`));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), `results buttons in the order ${order}`);
  // the guest's one way in replaces all of them (flow.js), so it is not counted
  const shown = res.replace(/<div id="result-guest"[\s\S]*?<\/div>/, '');
  assert.equal(shown.match(/<button/g).length <= 9, true, 'the results screen is back to eleven buttons');
  assert.doesNotMatch(res, /id="sh-li"/, 'the share links are back on the results screen');
});

// A phone held sideways: the stage was let out 200 px wider than 16:9 and the
// game stretched 22% to fill it; the title could not scroll to its lower
// buttons; and the story's and the profile's way on sat below the fold.
test('a phone held sideways keeps the stage 16:9 and every screen reachable', () => {
  const css = src('styles.css');
  assert.match(css, /#scr-results \{[^}]*justify-content: flex-start/, 'a tall results screen loses its top above the scroll');
  const land = css.slice(css.indexOf('@media (max-height: 500px) and (orientation: landscape)'));
  const block = land.slice(0, land.indexOf('\n}\n'));
  assert.match(block, /\.stage-wrap \{ max-width: calc\(100dvh \* 16 \/ 9\); \}/, 'the stage is not 16:9');
  assert.doesNotMatch(css, /16 \/ 9 \+ 200px/);
  assert.match(block, /#scr-title \{[^}]*overflow-y: auto/, 'the title cannot scroll');
  assert.match(block, /\.tbtn \{[^}]*backdrop-filter: none/, 'the pads blur the fighter behind them');
  assert.match(css, /\.about-cta \{[^}]*position: sticky/, "the story's button is below the fold");
  assert.match(css, /\.profile-save \{[^}]*position: sticky/, "the profile's SAVE is below the fold");
});

// Small ones: Esc on the VS splash let the match run behind it; the help said
// 💣 for the 25-meter move (⚖️ everywhere else); the lobby with nobody in it
// had no way on but CANCEL; the live lobby skipped the controls.
test('the splash holds against Esc, the help names the right icon, and the lobby has a way on', () => {
  const main = src('src/main.js');
  assert.match(fn(main, 'togglePause'), /vsSplash'\)\.classList\.contains\('hidden'\)\) return/);
  assert.doesNotMatch(src('index.html'), /💣&nbsp;25/);
  assert.match(fn(main, 'enterLobby'), /if \(shouldShowTutorial\(\)\) \{ showTutorial\(\(\) => enterLobby\(\)\); return; \}/);
  assert.match(main, /btn-lobby-ai'\)\.onclick = .*quickFight\(\)/);
  const tut = src('src/ui/tutorial.js');
  assert.match(tut, /Launch/, 'the tutorial never mentions Launch');
  assert.match(tut, /Left hand on W A S D/, 'the tutorial does not say where the hands go');
});

// The tips (SPECIAL READY, press L) came every match for good; they are
// for the first few (main.js passes `hints`).
test('the in-fight tips can be turned off for a match', () => {
  const said = [];
  globalThis.window ??= { matchMedia: () => ({ matches: false }) };    // isTouchDevice
  const g = { mode: 'solo', hints: false, hintFlags: {}, maxCombo: [5, 0], hud: { hint: (m) => said.push(m) },
    fighters: [{ controller: { isHuman: true }, energy: 100, special: { name: 'X' } }] };
  Game.prototype.updateHints.call(g);
  assert.deepEqual(said, []);
  g.hints = true;
  Game.prototype.updateHints.call(g);
  assert.ok(said.length >= 2, 'with hints on, nothing is said');
  assert.match(src('src/main.js'), /hints: \(Save\.data\.stats\?\.matches \?\? 0\) < HINT_MATCHES/);
});

// Sign-in came before any fight at all. A visitor now gets one Rookie fight
// first, once on this device, unranked, and its results ask them to sign in;
// nothing on the way (restart, rematch, next fight) hands out a second.
test('a visitor may try one unranked Rookie fight before signing in, once', () => {
  assert.equal(Save.data.guestFightUsed, false);
  assert.equal(guestFightOffered({ data: { guestFightUsed: false } }, null), true);
  assert.equal(guestFightOffered({ data: { guestFightUsed: true } }, null), false, 'offered twice');
  assert.equal(guestFightOffered({ data: { guestFightUsed: false } }, { id: 'u' }), false, 'offered to the signed in');
  const ids = ['a', 'b', 'c'];
  for (const r of [0, 0.5, 0.99]) {
    const g = pickGuestFight(ids, () => r);
    assert.ok(ids.includes(g.p1) && ids.includes(g.p2) && g.p1 !== g.p2, `${g.p1} against ${g.p2}`);
    assert.equal(g.difficulty, 'intern');
  }
  assert.deepEqual([...GUEST_SCREENS].sort(), ['scr-fight', 'scr-results']);

  const main = src('src/main.js');
  const show = fn(main, 'showScreen');
  assert.match(show, /!\(guestFight && GUEST_SCREENS\.has\(id\)\)\) id = 'scr-auth'/, 'the gate is not open to the guest fight, or open to more');
  // any screen but the fight and its results ends it, and so does signing in
  // (a magic link opened in another tab mid-fight left it on, and the next
  // signed-in match had no restart, next fight or menu)
  assert.match(show, /if \(!GUEST_SCREENS\.has\(id\)\) endGuestFight\(\);/, 'off the fight, the guest fight goes on');
  assert.match(main, /onAuthChange\(\(session\) => \{\s*(\/\/.*\s*)*if \(session\) endGuestFight\(\);/, 'signing in leaves the guest fight on');
  // offered only once sign-in has said there is no session, or every
  // returning player sees it for a moment at load
  assert.match(fn(main, 'refreshGuestOffer'), /authSettled && guestFightOffered\(Save, currentUser\(\)\)/);
  assert.match(main, /initAuth\(\)\.finally\(\(\) => \{ authSettled = true; refreshGuestOffer\(\); \}\)/);
  // and the victory pose is skipped only with the fight on screen, never by
  // the pause button
  const skip = main.slice(main.indexOf('const skipVictory'), main.indexOf("window.addEventListener('keydown', skipVictory)"));
  assert.match(skip, /\$\('scr-fight'\)\.classList\.contains\('active'\)/, 'a game behind another screen is skipped by typing there');
  assert.match(skip, /btn && !btn\.closest\('#touchControls'\)\) return;/, 'the pause button skips instead of pausing');
  const click = main.slice(main.indexOf("$('btn-auth-guest').onclick"), main.indexOf("$('btn-res-signin')"));
  assert.ok(click.indexOf('guestFightUsed = true') >= 0 && click.indexOf('guestFightUsed = true') < click.indexOf('startMatch('), 'taken only after the fight, so quitting hands out another');
  assert.match(click, /guest: true/);
  assert.match(fn(main, 'onMatchEnd'), /const ranked = result\.mode === 'solo' && !currentSetup\?\.guest;/, 'the guest fight is ranked');
  const css = src('styles.css');
  for (const sel of ['.guest-fight #btn-restart', '.guest-fight #scr-results .result-btns', '.guest-fight #result-cta']) {
    assert.ok(css.includes(sel), `${sel} still shows: a way to a second free fight, or a profile without an account`);
  }
});
