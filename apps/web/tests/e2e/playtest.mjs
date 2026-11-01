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
/** A named wait: on timeout, says what it was waiting for and what the page looked like. */
const waitFor = async (label, fn, timeout = 60000) => {
  try { await fn(timeout); }
  catch (error) {
    const state = await page.evaluate(() => ({
      tld: window.__tld?.read ? (({ x, z, location, dialogue, npcChat, taxi }) => ({ x, z, location, dialogue, npcChat, taxi }))(window.__tld.read()) : null,
      minimap: Boolean(document.querySelector('.world-minimap')), map: Boolean(document.querySelector('.world-map')),
      menu: Boolean(document.querySelector('.game-menu-backdrop:not([hidden])')), focus: document.activeElement?.tagName,
      dialogs: [...document.querySelectorAll('[role=dialog]')].map(d => d.getAttribute('aria-label')).slice(0, 4),
    })).catch(() => null);
    throw new Error(`${label}: ${error.message.split('\n')[0]} · page ${JSON.stringify(state)}`);
  }
};
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
await step('loading screen shows progress and gets out of the way', async () => {
  const started = Date.now();
  await page.waitForSelector('.world-loading [role=progressbar]', { timeout: 90000 });
  await shot('00-loading');
  await page.waitForFunction(() => Boolean(window.__tld) && !window.__tld.read().loading, null, { timeout: 120000 });
  await page.waitForSelector('.world-loading', { state: 'detached', timeout: 10000 });
  notes.push(`world ready ${((Date.now() - started) / 1000).toFixed(1)}s after the game code loaded`);
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
const focusIn = selector => page.evaluate(sel => Boolean(document.activeElement?.closest(sel)), selector);
const canvasFocused = () => page.evaluate(() => document.activeElement?.tagName === 'CANVAS');
await step('map opens and closes (N)', async () => {
  await page.keyboard.press('n');
  await page.waitForSelector('.world-map', { timeout: 5000 });
  await shot('04-map');
  // Keyboard flow (MVP 7b): focus starts in the map, on the selected tab, and Tab stays in the map.
  await waitFor('map takes focus', timeout => page.waitForFunction(() => document.activeElement?.closest('.world-map')
    && document.activeElement.getAttribute('aria-selected') === 'true', null, { timeout }), 15000);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab');
  if (!(await focusIn('.world-map'))) throw new Error('Shift+Tab left the map');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  if (!(await focusIn('.world-map'))) throw new Error('Tab left the map');
  await page.keyboard.press('n');
  await page.waitForSelector('.world-map', { state: 'detached', timeout: 5000 });
  await waitFor('focus back on the 3D view after the map', timeout => page.waitForFunction(() => document.activeElement?.tagName === 'CANVAS', null, { timeout }), 10000);
});
await step('talk to a neighbour with the keyboard only', async () => {
  if (!(await page.evaluate(() => window.__tld.place('neighbour')))) throw new Error('nobody out to talk to on Maple Street');
  await waitFor('talk prompt', timeout => page.locator('.world-car-action', { hasText: /^Talk to / }).first().waitFor({ timeout }));
  await page.locator('canvas').first().click({ position: { x: 320, y: 120 } });
  for (let tries = 0; tries < 10 && !(await page.locator('.npc-chat-card').count()); tries++) {
    await page.keyboard.press('e');
    await page.waitForTimeout(1000);
  }
  await waitFor('conversation opens', timeout => page.waitForSelector('.npc-chat-card', { timeout }), 15000);
  await waitFor('first answer focused', timeout => page.waitForFunction(() =>
    document.activeElement === document.querySelector('.npc-chat-choices button'), null, { timeout }), 15000);
  await page.keyboard.press('ArrowDown');
  if (!(await page.evaluate(() => document.activeElement === document.querySelectorAll('.npc-chat-choices button')[1]))) throw new Error('ArrowDown did not move to the second answer');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  if (!(await focusIn('.npc-chat-card'))) throw new Error('Tab left the conversation');
  await page.locator('.npc-chat-choices button').first().focus();
  await page.keyboard.press('Enter');
  await waitFor('reply shows', timeout => page.locator('.npc-chat-result').waitFor({ timeout }), 15000);
  await waitFor('Continue focused', timeout => page.waitForFunction(() => document.activeElement?.textContent === 'Continue story', null, { timeout }), 15000);
  await shot('04a-talk-keyboard');
  await page.keyboard.press('Enter');
  await waitFor('conversation closes', timeout => page.waitForSelector('.npc-chat-card', { state: 'detached', timeout }), 15000);
  await dismissDialogue();
  if (!(await page.locator('.story-scene').count()) && !(await canvasFocused())) {
    await waitFor('focus back on the 3D view after talking', timeout => page.waitForFunction(() => document.activeElement?.tagName === 'CANVAS', null, { timeout }), 10000);
  }
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
await step('accessibility: keyboard menu, motion, large text and sound captions', async () => {
  await page.locator('canvas').first().click({ position: { x: 320, y: 120 } });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.game-menu-backdrop:not([hidden])', { timeout: 10000 });
  try {
    if (!(await page.evaluate(() => document.activeElement?.classList.contains('game-menu-resume')))) throw new Error('menu did not focus Resume');
    // Tab never leaves the open menu.
    await page.keyboard.press('Shift+Tab');
    if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('.game-menu'))))) throw new Error('Shift+Tab left the menu');
    // Arrow keys move between tabs.
    const menu = page.locator('.game-menu');
    await menu.getByRole('tab', { name: 'Controls' }).click();
    await page.keyboard.press('ArrowRight');
    if ((await menu.getByRole('tab', { selected: true }).textContent()) !== 'Settings') throw new Error('ArrowRight did not select Settings');
    if (!(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab'))) throw new Error('tab focus not moved');
    await menu.getByLabel(/^Motion: Reduced/).check();
    await menu.getByLabel(/^Sound captions/).check();
    await menu.getByLabel(/^Large text/).check();
    const root = await page.evaluate(() => ({ ...document.documentElement.dataset }));
    if (root.reduceMotion !== 'true' || root.textSize !== 'large') throw new Error(`page not updated: ${JSON.stringify(root)}`);
    await shot('04c-accessibility');
    // Back to normal text so the rest of the run sees the usual layout; captions stay on.
    await menu.getByLabel(/^Large text/).uncheck();
    await menu.getByLabel(/^Motion: Follow my device/).check();
  } finally {
    await page.keyboard.press('Escape');
  }
  await page.waitForSelector('.game-menu-backdrop[hidden]', { state: 'attached', timeout: 10000 });
  await page.keyboard.press('n');
  await page.waitForSelector('.world-sound-captions li:has-text("Map unfolds")', { timeout: 5000 });
  await shot('04d-caption');
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
  // Downtown's 3D city is built on the first trip, not at start-up (MVP 6b).
  if ((await read()).downtownBuilt) throw new Error('the downtown 3D city was built before the first trip there');
  await page.evaluate(() => window.__tld.travel('downtown'));
  await page.waitForFunction(() => { const s = window.__tld.read(); return s.location === 'city' && !s.taxi; }, null, { timeout: 180000 });
  const arrived = await read();
  if (!arrived.downtownBuilt) throw new Error('arrived downtown but the city was never built');
  notes.push(`downtown built on the first trip in ${arrived.downtownBuildMs} ms (software rendering)`);
  await page.waitForTimeout(3000);
  await dismissDialogue();
  await shot('05-downtown');
});
await step('downtown traffic drives', async () => {
  await page.waitForFunction(() => window.__tld.read().traffic.length > 0, null, { timeout: 120000 });
  const before = (await read()).traffic;
  // Give the (slow, software-rendered) world some frames to move the cars.
  await page.waitForFunction(first => window.__tld.read().traffic.some((car, i) => first[i] && Math.hypot(car.x - first[i].x, car.z - first[i].z) > 1), before, { timeout: 120000 });
  notes.push(`${before.length} traffic cars downtown`);
  await waitFor('people walking downtown', timeout => page.waitForFunction(() => window.__tld.read().walkers > 0, null, { timeout }), 120000);
  notes.push(`${(await read()).walkers} people walking downtown`);
  await shot('05b-traffic');
});
await step('talk to a downtown regular (guide, coach or fire captain)', async () => {
  // The regulars load just after the city; stand beside whoever is out now.
  await waitFor('a downtown regular to talk to', timeout => page.waitForFunction(() => window.__tld.place('neighbour'), null, { timeout, polling: 1000 }), 120000);
  const talk = page.locator('.world-car-action', { hasText: /^Talk to / }).first();
  await waitFor('talk prompt downtown', timeout => talk.waitFor({ timeout }));
  const label = (await talk.textContent())?.trim();
  await page.locator('canvas').first().click({ position: { x: 320, y: 120 } });
  await page.keyboard.press('e');
  await waitFor('conversation opens', timeout => page.waitForSelector('.npc-chat-card', { timeout }), 30000);
  await shot('05bb-downtown-talk');
  await page.locator('.npc-chat-choices button').first().click();
  await waitFor('reply shows', timeout => page.locator('.npc-chat-result').waitFor({ timeout }), 15000);
  await page.getByRole('button', { name: 'Continue story' }).click();
  await waitFor('conversation closes', timeout => page.waitForSelector('.npc-chat-card', { state: 'detached', timeout }), 15000);
  notes.push(`downtown: ${label}`);
});
await step('minimap shows, and a map waypoint gives a GPS route', async () => {
  await waitFor('minimap visible', timeout => page.waitForSelector('.world-minimap canvas', { timeout }));
  await page.locator('canvas').first().click({ position: { x: 320, y: 120 } });
  await page.keyboard.press('n');
  // The main thread is busy rendering in software, so UI updates can take a while.
  await waitFor('big map opens on the downtown tab', timeout => page.waitForSelector('.world-map-gps', { timeout }));
  const map = page.locator('.world-map-gps');
  const box = await map.boundingBox();
  notes.push(`big map ${Math.round(box.width)}×${Math.round(box.height)} px`);
  // Locator clicks scroll the map into view first.
  await map.click({ position: { x: box.width * 0.75, y: box.height * 0.35 } });
  await waitFor('waypoint set', timeout => page.waitForFunction(() => Boolean(window.__tld.waypoint()), null, { timeout }));
  await shot('05c-gps-map');
  // Keyboard GPS (MVP 7b): a place button sets the waypoint without the mouse.
  const clicked = JSON.stringify(await page.evaluate(() => window.__tld.waypoint()));
  const place = page.locator('.world-map-gps-place').first();
  await waitFor('keyboard GPS places listed', timeout => place.waitFor({ timeout }));
  await place.focus();
  await page.keyboard.press('Enter');
  await waitFor('keyboard waypoint set', timeout => page.waitForFunction(before => JSON.stringify(window.__tld.waypoint()) !== before, clicked, { timeout }));
  await page.keyboard.press('n');
  await waitFor('big map closes', timeout => page.waitForSelector('.world-map', { state: 'detached', timeout }));
  await waitFor('GPS route appears', timeout => page.waitForFunction(() => window.__tld.route() > 0, null, { timeout }), 120000);
  notes.push(`GPS route ${Math.round(await page.evaluate(() => window.__tld.route()))} m`);
  await shot('05d-minimap-route');
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
