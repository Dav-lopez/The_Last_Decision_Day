/**
 * Automated playtest: builds are served by `vite preview`, then a headless
 * Chromium plays the guest demo like a new player would and fails on any
 * page error or console error. Findings are printed as GitHub annotations,
 * screenshots land in playtest-output/.
 *
 *   node tests/e2e/playtest.mjs http://localhost:4173
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = 'playtest-output';
await mkdir(out, { recursive: true });
const problems = [];
const notes = [];
const annotate = (level, title, message) => console.log(`::${level} title=${title}::${String(message).replace(/\r?\n/g, ' ').slice(0, 900)}`);
// Requests to the API have no backend in a static preview; that is expected.
const expected = text => /\/api\/|Failed to load resource|ERR_CONNECTION_REFUSED|negotiat|WebSocket|signalr/i.test(text);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// CI has no GPU: a small viewport keeps software rendering fast enough to play.
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', error => problems.push(`page error: ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error' && !expected(message.text())) problems.push(`console error: ${message.text()}`);
});
const shot = name => page.screenshot({ path: `${out}/${name}.png` });
const read = () => page.evaluate(() => window.__tld?.read() ?? null);
const step = async (name, fn) => {
  const started = Date.now();
  try { await fn(); notes.push(`${name}: ok (${((Date.now() - started) / 1000).toFixed(1)}s)`); }
  catch (error) {
    // Keep Playwright's useful detail lines (e.g. which element intercepted a click).
    const lines = error.message.split('\n').map(l => l.trim()).filter(Boolean);
    const detail = lines.filter(l => /intercepts|waiting for|resolved to/i.test(l)).slice(0, 2).join(' | ');
    problems.push(`${name}: ${lines[0]}${detail ? ` (${detail})` : ''}`); await shot(`failed-${name.replace(/\W+/g, '-')}`).catch(() => {}); }
};
const dismissDialogue = async () => {
  for (let i = 0; i < 30; i++) {
    const scene = page.locator('.story-scene');
    if (!(await scene.count())) return;
    await scene.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
};

await step('loads the start page', async () => {
  await page.goto(`${base}/?playtest`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /try the 3d demo/i }).click({ timeout: 20000 });
});
await step('world loads', async () => {
  await page.waitForSelector('.world-life', { timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__tld), null, { timeout: 30000 });
  await page.waitForTimeout(4000);
  await shot('01-world');
});
await step('opening story scene plays and closes', async () => {
  await dismissDialogue();
  await shot('02-after-story');
  const state = await read();
  if (state?.dialogue) throw new Error('dialogue still open');
});
// The game clamps each frame to 0.05 s of game time, so in a slow software renderer
// everything takes more wall-clock time: hold keys until something happens instead.
await step('first-run hint can be dismissed', async () => {
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) await gotIt.click();
  await page.waitForSelector('.world-first-hint', { state: 'detached', timeout: 5000 });
});
await step('player walks', async () => {
  await page.locator('canvas').first().click({ position: { x: 320, y: 180 } });
  const before = await read();
  await page.keyboard.down('w');
  let moved = 0;
  for (let waited = 0; waited < 90000 && moved < 1; waited += 500) {
    await page.waitForTimeout(500);
    const now = await read();
    moved = Math.hypot(now.x - before.x, now.z - before.z);
  }
  await page.keyboard.up('w');
  notes.push(`walked ${moved.toFixed(2)} m`);
  if (!(moved >= 1)) throw new Error(`player did not move (moved ${moved.toFixed(2)} m)`);
  await shot('03-walked');
});
await step('map opens and closes (N)', async () => {
  await page.keyboard.press('n');
  await page.waitForSelector('.world-map', { timeout: 5000 });
  await shot('04-map');
  await page.keyboard.press('n');
  await page.waitForSelector('.world-map', { state: 'detached', timeout: 5000 });
});
await step('menu opens with Esc, shows every tab, and closes', async () => {
  await page.locator('canvas').first().click({ position: { x: 320, y: 120 } });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.game-menu-backdrop:not([hidden])', { timeout: 10000 });
  try {
    for (const tab of ['Settings', 'Story', 'Credits']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(200);
    }
    if (!(await page.locator('.game-menu-credits').getByText('OpenStreetMap contributors').count())) throw new Error('credits missing OpenStreetMap');
    await shot('04b-menu');
  } finally {
    // Never leave the world paused for the steps after this one.
    await page.keyboard.press('Escape');
  }
  await page.waitForSelector('.game-menu-backdrop[hidden]', { state: 'attached', timeout: 10000 });
});
await step('frame rate', async () => {
  const fps = await page.evaluate(() => new Promise(resolve => {
    let frames = 0; const start = performance.now();
    const tick = () => { frames++; if (performance.now() - start < 3000) requestAnimationFrame(tick); else resolve(frames / 3); };
    requestAnimationFrame(tick);
  }));
  notes.push(`~${Math.round(fps)} fps in software rendering`);
});
await step('quick travel downtown', async () => {
  await page.evaluate(() => window.__tld.travel('downtown'));
  await page.waitForFunction(() => window.__tld.read().location === 'city', null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  await dismissDialogue();
  await shot('05-downtown');
});
await step('quick travel to the pitch and back home', async () => {
  await page.evaluate(() => window.__tld.travel('pitch'));
  // Already downtown, so wait for the taxi ride itself to finish: a new trip is refused while one is under way.
  await page.waitForFunction(() => { const s = window.__tld.read(); return s.location === 'city' && !s.dialogue && !s.travelling; }, null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  await shot('06-pitch');
  await page.evaluate(() => window.__tld.travel('maple'));
  await page.waitForFunction(() => window.__tld.read().location === 'street', null, { timeout: 180000 });
  await dismissDialogue();
  await shot('07-home');
});

await browser.close();
for (const note of notes) annotate('notice', 'Playtest', note);
for (const problem of [...new Set(problems)]) annotate('error', 'Playtest', problem);
console.log(problems.length ? `${problems.length} playtest problem(s)` : 'Playtest passed');
process.exit(problems.length ? 1 : 0);
