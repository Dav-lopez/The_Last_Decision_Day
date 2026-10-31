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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', error => problems.push(`page error: ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error' && !expected(message.text())) problems.push(`console error: ${message.text()}`);
});
const shot = name => page.screenshot({ path: `${out}/${name}.png` });
const read = () => page.evaluate(() => window.__tld?.read() ?? null);
const step = async (name, fn) => {
  const started = Date.now();
  try { await fn(); notes.push(`${name}: ok (${((Date.now() - started) / 1000).toFixed(1)}s)`); }
  catch (error) { problems.push(`${name}: ${error.message.split('\n')[0]}`); await shot(`failed-${name.replace(/\W+/g, '-')}`).catch(() => {}); }
};
const dismissDialogue = async () => {
  for (let i = 0; i < 30; i++) {
    const scene = page.locator('.story-scene');
    if (!(await scene.count())) return;
    await scene.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
};
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

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
await step('player walks', async () => {
  await page.locator('canvas').first().click({ position: { x: 640, y: 360 } });
  const before = await read();
  await hold('w', 1800);
  await hold('a', 600);
  const after = await read();
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  notes.push(`walked ${moved.toFixed(2)} m`);
  if (!(moved > 0.5)) throw new Error(`player did not move (moved ${moved.toFixed(2)} m)`);
  await shot('03-walked');
});
await step('map opens and closes (N)', async () => {
  await page.keyboard.press('n');
  await page.waitForSelector('.world-map', { timeout: 5000 });
  await shot('04-map');
  await page.keyboard.press('n');
  await page.waitForSelector('.world-map', { state: 'detached', timeout: 5000 });
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
  await page.waitForFunction(() => window.__tld.read().location === 'city', null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await dismissDialogue();
  await shot('05-downtown');
});
await step('quick travel to the pitch and back home', async () => {
  await page.evaluate(() => window.__tld.travel('pitch'));
  await page.waitForTimeout(3500);
  await shot('06-pitch');
  await page.evaluate(() => window.__tld.travel('maple'));
  await page.waitForFunction(() => window.__tld.read().location === 'street', null, { timeout: 30000 });
  await dismissDialogue();
  await shot('07-home');
});

await browser.close();
for (const note of notes) annotate('notice', 'Playtest', note);
for (const problem of [...new Set(problems)]) annotate('error', 'Playtest', problem);
console.log(problems.length ? `${problems.length} playtest problem(s)` : 'Playtest passed');
process.exit(problems.length ? 1 : 0);
