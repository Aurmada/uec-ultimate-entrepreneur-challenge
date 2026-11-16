// Renders the marketing pictures (lab/marketing.js) in a headless browser and
// writes them into the tree: og-image.jpg, the card a shared link shows, and
// the two fight shots in shots/.
//
//   python3 dev-server.py 4173 &
//   node lab/marketing-run.js [port]
//
// It needs Playwright, which cloud sessions have preinstalled and the game
// never loads: a lab tool, not a dependency.

import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const port = process.argv[2] || '4173';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.route('**/cdn.jsdelivr.net/**', (r) => r.abort());   // no backend needed for a picture
await page.goto(`http://localhost:${port}/?debug=1&res=2`, { waitUntil: 'load' });
const wrote = await page.evaluate(async () => {
  UEC.signInAs();
  UEC.Save.saveProfile({ name: 'Jordan Blaze', company: 'Blaze Robotics', base: 'b-neo', special: 'pitchdeck' });
  const { renderAll } = await import('/lab/marketing.js');
  return renderAll();
});
console.log(wrote.join('\n'));
await browser.close();
