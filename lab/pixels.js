// Same frames, two commits, one browser: does the game still look exactly as
// it did?
//
//   node lab/pixels.js                  # the working tree against main
//   node lab/pixels.js v3.10.2          # ... against any commit, tag or branch
//   node lab/pixels.js main --flags gl  # with ?gl's renderers on, both sides
//
// CLAUDE.md asks that, with the flags off, the default game look exactly as it
// did, and pixel baselines only reproduce in the browser that wrote them
// (ARCHITECTURE section 10). So this renders the same seeded frames from both
// trees in the same headless browser, side by side, and compares them: six
// arenas, a few moments in a Champion AI match on each, through the real
// Game and renderGame. Anything that differs is listed, with both frames
// saved, so the difference can be looked at.
//
// It needs Playwright, which cloud sessions have preinstalled and the game
// never loads: a lab tool, not a dependency. The base commit is checked out
// into a temporary worktree and both trees are served by a small server here,
// with the frame page written by this script, so the base needs nothing new.

import { createServer } from 'node:http';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARENAS = ['boardroom', 'demoday', 'garage', 'exchange', 'unicorn', 'summit'];
const FRAMES = [60, 200, 330, 480, 650];
const PAIR = ['max', 'dex'];

// The frame page: a seeded AI match stepped to a frame and drawn once, at
// twice the stage's size. Only modules and exports every version of the game
// has had (RENDER, for one, came with v3.10), so an older commit loads it too.
// `flags`, when given, turns on render flags the way the address does.
const FRAME_PAGE = `<!doctype html><meta charset="utf-8"><title>frame</title>
<canvas id="c"></canvas><script type="module">
import { STAGE } from './src/config.js';
import { Game } from './src/engine/game.js';
import * as R from './src/engine/render.js';
import { getFighter } from './src/data/fighters.js';
import { getArena } from './src/data/arenas.js';
import { AIController } from './src/engine/ai.js';
const q = new URLSearchParams(location.search);
window.frame = async () => {
  if (q.get('flags') === 'gl') {
    const { STAGES, stageFor } = await import('./src/engine/stage.js');
    const { FX_STYLE } = await import('./src/engine/fx.js');
    R.RENDER.sharpFighters = true; STAGES.enabled = true; FX_STYLE.impact = true;
    for (let i = 0; i < 100 && !stageFor(getArena(q.get('arena'))); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const canvas = document.getElementById('c');
  canvas.width = STAGE.W * 2; canvas.height = STAGE.H * 2;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  let s = 20261029;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const [a, b] = q.get('pair').split(',').map(getFighter);
  const game = new Game({
    p1: { def: a, controller: new AIController('mogul', a) }, p2: { def: b, controller: new AIController('mogul', b) },
    arena: getArena(q.get('arena')), mode: 'solo', difficulty: 'mogul',
    hud: new Proxy({}, { get: () => () => {} }), onEnd: () => {}, seed: 20261029,
  });
  for (let i = 0; i < +q.get('f'); i++) game.update(1 / 60);
  s = 777;
  R.renderGame(ctx, game);
  return canvas.toDataURL('image/png');
};
</script>`;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

function serve(root) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/__frame.html') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      return res.end(FRAME_PAGE);
    }
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function parseArgs(argv) {
  const o = { base: 'main', flags: null, out: join(tmpdir(), 'uec-pixels-frames') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--flags') o.flags = argv[++i];
    else if (argv[i] === '--out') o.out = resolve(argv[++i]);
    else o.base = argv[i];
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('lab/pixels.js needs Playwright (preinstalled in cloud sessions). It is a lab tool, not a game dependency.');
    process.exit(2);
  }
  try {
    execFileSync('git', ['-C', ROOT, 'rev-parse', '--verify', '--quiet', `${o.base}^{commit}`]);
  } catch {
    console.error(`lab/pixels.js: no commit called ${o.base} here (a branch, a commit or a tag).`);
    process.exit(2);
  }
  const base = await mkdtemp(join(tmpdir(), 'uec-pixels-'));
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', '--quiet', base, o.base]);
  const servers = [];
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const [A, B] = await Promise.all([serve(base), serve(ROOT)]);
    servers.push(A, B);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = async (server, arena, f) => {
      const url = `http://127.0.0.1:${server.address().port}/__frame.html?arena=${arena}&f=${f}&pair=${PAIR}`
        + (o.flags ? `&flags=${o.flags}` : '');
      errors.length = 0;
      await page.goto(url);
      await page.waitForFunction(() => typeof window.frame === 'function', null, { timeout: 15000 })
        .catch(() => { throw new Error(`the frame page did not load from ${server === A ? o.base : 'the working tree'}: ${errors.join('; ') || 'no error reported'}`); });
      return page.evaluate(() => window.frame());
    };
    // Compared in the page, where both are images: how many pixels differ, and
    // by how much at most.
    const compare = (x, y) => page.evaluate(async ([x, y]) => {
      const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
      const [a, b] = await Promise.all([load(x), load(y)]);
      const read = (img) => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const p = read(a), q = read(b);
      if (p.length !== q.length) return { pixels: -1, max: 255 };
      let pixels = 0, max = 0;
      for (let i = 0; i < p.length; i += 4) {
        const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]), Math.abs(p[i + 3] - q[i + 3]));
        if (d) { pixels++; if (d > max) max = d; }
      }
      return { pixels, max };
    }, [x, y]);
    const differing = [];
    for (const arena of ARENAS) {
      for (const f of FRAMES) {
        const [x, y] = [await shot(A, arena, f), await shot(B, arena, f)];
        if (x === y) continue;
        const d = await compare(x, y);
        if (!d.pixels) continue;
        await mkdir(o.out, { recursive: true });
        const name = `${arena}-${f}`;
        await writeFile(join(o.out, `${name}-base.png`), Buffer.from(x.split(',')[1], 'base64'));
        await writeFile(join(o.out, `${name}-now.png`), Buffer.from(y.split(',')[1], 'base64'));
        differing.push(`  ${name.padEnd(16)} ${d.pixels} pixels differ, by up to ${d.max}`);
      }
    }
    const total = ARENAS.length * FRAMES.length;
    console.log(`${total} frames${o.flags ? ` with --flags ${o.flags}` : ', flags off'}, ${PAIR.join(' v ')}, against ${o.base}:`);
    if (!differing.length) console.log(`  all ${total} identical`);
    else console.log(differing.join('\n') + `\n  both frames of each are in ${o.out}`);
    process.exitCode = differing.length ? 1 : 0;
  } finally {
    await browser.close();
    for (const s of servers) s.close();
    execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', base]);
    await rm(base, { recursive: true, force: true });
  }
}

main();
