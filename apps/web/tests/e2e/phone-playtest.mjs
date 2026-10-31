/**
 * Phone playtest: the same guest demo on a 360×640 touch screen, played only by
 * tapping. Fails on page/console errors, on a page that scrolls sideways, on
 * overlays covering each other, and on core buttons too small to tap.
 * Screenshots land in playtest-output/phone-*.png.
 *
 *   node tests/e2e/phone-playtest.mjs http://localhost:4173
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { layoutProblems } from '../../src/world/phoneLayout.mjs';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = 'playtest-output';
await mkdir(out, { recursive: true });
const problems = [];
const notes = [];
const annotate = (level, title, message) => console.log(`::${level} title=${title}::${String(message).replace(/\r?\n/g, ' ').slice(0, 900)}`);
const expected = text => /\/api\/|Failed to load resource|ERR_CONNECTION_REFUSED|negotiat|WebSocket|signalr/i.test(text);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
page.on('pageerror', error => problems.push(`page error: ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error' && !expected(message.text())) problems.push(`console error: ${message.text()}`);
});
const shot = name => page.screenshot({ path: `${out}/phone-${name}.png` });
const read = () => page.evaluate(() => window.__tld?.read() ?? null);
const step = async (name, fn) => {
  const started = Date.now();
  try { await fn(); notes.push(`${name}: ok (${((Date.now() - started) / 1000).toFixed(1)}s)`); }
  catch (error) { problems.push(`${name}: ${error.message.split('\n')[0]}`); await shot(`failed-${name.replace(/\W+/g, '-')}`).catch(() => {}); }
};
const tapAway = async () => {
  for (let i = 0; i < 30; i++) {
    const scene = page.locator('.story-scene');
    if (!(await scene.count())) return;
    await scene.first().tap({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
};
/** A real finger held on an element (pointer events, pointer capture and all). */
const holdTouch = async (locator, untilFn, maxMs) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('nothing to touch');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  try {
    for (let waited = 0; waited < maxMs; waited += 500) {
      await page.waitForTimeout(500);
      if (await untilFn()) return true;
    }
    return false;
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
};

// Overlays drawn over the 3D view must not cover each other.
const OVERLAYS = ['caption', 'clock and energy', 'objective', 'scoreboard', 'wayfinding', 'drive HUD', 'notice',
  'action button', 'chip button', 'range button', 'match button', 'school button'];
const measure = () => page.evaluate(() => {
  const visible = element => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  };
  const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const elements = [];
  const hud = (selector, name) => document.querySelectorAll(selector).forEach(element => {
    if (visible(element)) elements.push({ name, kind: 'hud', rect: box(element) });
  });
  hud('.world-caption', 'caption');
  hud('.world-life', 'clock and energy');
  hud('.story-objective', 'objective');
  hud('.world-scoreboard', 'scoreboard');
  hud('.world-wayfinding', 'wayfinding');
  hud('.world-drive-hud', 'drive HUD');
  hud('.world-notice', 'notice');
  hud('.world-car-action:not(.world-range-start):not(.world-match-start):not(.world-chip-action)', 'action button');
  hud('.world-chip-action', 'chip button');
  hud('.world-enter', 'school button');
  hud('.world-range-start', 'range button');
  hud('.world-match-start', 'match button');
  // The buttons a player needs to play: everything over the 3D view, the pad, the camera row and the map.
  const core = '.world-viewport button, .world-control-buttons button, .world-camera-toggle button';
  const small = [];
  document.querySelectorAll('.world-root button').forEach(button => {
    if (!visible(button)) return;
    const name = `“${(button.getAttribute('aria-label') || button.textContent || '').trim().slice(0, 40)}” button`;
    const rect = box(button);
    if (button.matches(core)) elements.push({ name, kind: 'target', rect });
    else if (rect.height < 40 || rect.width < 40) small.push(name);
  });
  return { documentWidth: document.documentElement.scrollWidth, elements, small };
});
const checkLayout = async label => {
  const { documentWidth, elements, small } = await measure();
  const found = layoutProblems({ viewport: { width: 360, height: 640 }, documentWidth, elements, overlays: OVERLAYS });
  for (const problem of found) problems.push(`layout (${label}): ${problem}`);
  if (small.length) notes.push(`(${label}) smaller secondary buttons: ${[...new Set(small)].slice(0, 8).join(', ')}`);
  notes.push(`layout (${label}): ${elements.length} elements checked, ${found.length} problem(s)`);
};

await step('loads the start page on a phone', async () => {
  await page.goto(`${base}/?playtest`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /try the 3d demo/i }).tap({ timeout: 20000 });
});
await step('world loads', async () => {
  await page.waitForSelector('.world-life', { timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__tld), null, { timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.locator('.world-viewport').scrollIntoViewIfNeeded();
  await shot('01-world');
});
await step('story scene closes by tapping', async () => {
  await tapAway();
  const state = await read();
  if (state?.dialogue) throw new Error('dialogue still open');
  await shot('02-after-story');
});
await step('first-run hint can be dismissed by tapping', async () => {
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) {
    await checkLayout('first-run hint');
    await gotIt.tap();
  }
  await page.waitForSelector('.world-first-hint', { state: 'detached', timeout: 5000 });
});
await step('street layout fits the phone', () => checkLayout('Maple Street'));
await step('player walks with the touch pad', async () => {
  const before = await read();
  let moved = 0;
  await holdTouch(page.getByRole('button', { name: 'Move forward' }), async () => {
    const now = await read();
    moved = Math.hypot(now.x - before.x, now.z - before.z);
    return moved >= 1;
  }, 90000);
  notes.push(`walked ${moved.toFixed(2)} m by touch`);
  if (!(moved >= 1)) throw new Error(`player did not move (moved ${moved.toFixed(2)} m)`);
  await page.locator('.world-viewport').scrollIntoViewIfNeeded();
  await shot('03-walked');
});
await step('touch pad sits right under the view', async () => {
  // Players land with the view at the top of the screen (the game scrolls it there on phones).
  await page.evaluate(() => document.querySelector('.world-viewport')?.scrollIntoView({ block: 'start' }));
  const fit = await page.evaluate(() => {
    const view = document.querySelector('.world-viewport').getBoundingClientRect();
    const keys = [...document.querySelectorAll('.world-pad-key')].map(key => key.getBoundingClientRect()).filter(r => r.height > 0);
    return { viewTop: view.top, viewBottom: view.bottom, padBottom: Math.max(...keys.map(r => r.bottom)), padTop: Math.min(...keys.map(r => r.top)), screen: window.innerHeight };
  });
  notes.push(`view ${Math.round(fit.viewTop)}–${Math.round(fit.viewBottom)}px, pad ${Math.round(fit.padTop)}–${Math.round(fit.padBottom)}px on a ${fit.screen}px screen`);
  if (fit.padBottom > fit.screen + 1) throw new Error(`touch pad ends at ${Math.round(fit.padBottom)}px, below the ${fit.screen}px screen`);
  if (fit.padTop - fit.viewBottom > 40) throw new Error(`touch pad starts ${Math.round(fit.padTop - fit.viewBottom)}px under the view`);
  await shot('03a-pad');
});
const actionButton = text => page.locator('.world-car-action:not(.world-range-start):not(.world-match-start):not(.world-chip-action)', { hasText: text });
await step('talk to a neighbour by tapping', async () => {
  await tapAway();
  if (!(await page.evaluate(() => window.__tld.place('neighbour')))) throw new Error('nobody out to talk to on Maple Street');
  const talk = actionButton(/^Talk to /);
  await talk.waitFor({ timeout: 60000 });
  await checkLayout('talk prompt');
  await talk.tap();
  await page.waitForSelector('.npc-chat-card', { timeout: 15000 });
  const { documentWidth } = await measure();
  if (documentWidth > 361) throw new Error(`conversation makes the page ${documentWidth}px wide`);
  await shot('03b-talk');
  await page.locator('.npc-chat-choices button').first().tap();
  await page.locator('.npc-chat-result').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Continue story' }).tap();
  await page.waitForSelector('.npc-chat-card', { state: 'detached', timeout: 10000 });
  await tapAway();
  if ((await read()).npcChat) throw new Error('conversation still open');
});
await step('drive a car by tapping', async () => {
  if (!(await page.evaluate(() => window.__tld.place('car')))) throw new Error('no parked car to get into');
  const getIn = actionButton(/^Get in car/);
  await getIn.waitFor({ timeout: 60000 });
  await getIn.tap();
  await page.waitForFunction(() => window.__tld.read().driving, null, { timeout: 15000 });
  const start = (await read()).car;
  const drove = () => read().then(now => now.car && Math.hypot(now.car.x - start.x, now.car.z - start.z) >= 1);
  // Forward first; a car parked nose-in to a kerb backs out instead.
  if (!(await holdTouch(page.getByRole('button', { name: 'Move forward' }), drove, 60000))) {
    if (!(await holdTouch(page.getByRole('button', { name: 'Move backward' }), drove, 60000))) throw new Error('the car did not move by touch');
  }
  await page.locator('.world-viewport').scrollIntoViewIfNeeded();
  await checkLayout('driving');
  await shot('03c-driving');
  await page.waitForFunction(() => Math.abs(window.__tld.read().car?.speed ?? 0) < 0.3, null, { timeout: 90000 });
  const getOut = actionButton(/^Get out of car/);
  for (let tries = 0; tries < 10 && (await read()).driving; tries++) {
    await getOut.tap({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  if ((await read()).driving) throw new Error('could not get out of the car by tapping');
});
await step('map opens and closes by tapping', async () => {
  await page.getByRole('button', { name: 'Map (N)' }).tap();
  await page.waitForSelector('.world-map', { timeout: 5000 });
  await page.locator('.world-viewport').scrollIntoViewIfNeeded();
  await checkLayout('map');
  await shot('04-map');
  await page.getByRole('button', { name: 'Close map' }).tap();
  await page.waitForSelector('.world-map', { state: 'detached', timeout: 5000 });
});
await step('game menu opens and resumes by tapping', async () => {
  await page.getByRole('button', { name: /open the game menu/i }).tap();
  await page.waitForSelector('.game-menu-backdrop:not([hidden])', { timeout: 10000 });
  const { documentWidth } = await measure();
  if (documentWidth > 361) throw new Error(`menu makes the page ${documentWidth}px wide`);
  await shot('04b-menu');
  await page.getByRole('button', { name: /resume/i }).tap();
  await page.waitForSelector('.game-menu-backdrop[hidden]', { state: 'attached', timeout: 10000 });
});
await step('downtown layout fits the phone', async () => {
  await page.evaluate(() => window.__tld.travel('downtown'));
  await page.waitForFunction(() => window.__tld.read().location === 'city', null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  await tapAway();
  await page.locator('.world-viewport').scrollIntoViewIfNeeded();
  await checkLayout('downtown');
  await shot('05-downtown');
});
await step('training range by tapping (fire station)', async () => {
  if (!(await page.evaluate(() => window.__tld.place('firefighter')))) throw new Error('fire station sign not found downtown');
  const sign = actionButton(/Firefighter|Fire Station/);
  await sign.waitFor({ timeout: 60000 });
  if (/Apply/.test(await sign.textContent())) await sign.tap();
  await page.waitForTimeout(1500);
  await tapAway();
  const range = page.locator('.world-range-start');
  await range.waitFor({ timeout: 30000 });
  await checkLayout('workplace');
  await shot('05b-workplace');
  await range.tap();
  const drill = page.locator('.training-range');
  await drill.waitFor({ timeout: 15000 });
  await drill.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.waitForSelector('.training-range-touch', { timeout: 10000 });
  const { documentWidth } = await measure();
  if (documentWidth > 361) throw new Error(`range makes the page ${documentWidth}px wide`);
  const canvas = page.locator('.training-range-canvas');
  const area = await canvas.boundingBox();
  // Tap the targets (upper middle of the range), clear of the touch buttons along the bottom.
  for (let i = 0; i < 3; i++) {
    await page.touchscreen.tap(area.x + area.width * (0.4 + i * 0.1), area.y + area.height * 0.35);
    await page.waitForTimeout(500);
  }
  await shot('05c-range');
  await drill.getByRole('button', { name: /^Stop/ }).tap();
  await page.waitForSelector('.training-range', { state: 'detached', timeout: 15000 });
  await tapAway();
});
await step('pitch: start a match and pass by tapping', async () => {
  await page.evaluate(() => window.__tld.travel('pitch'));
  await page.waitForFunction(() => { const s = window.__tld.read(); return s.location === 'city' && !s.dialogue && !s.travelling; }, null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  await tapAway();
  await page.locator('.world-viewport').scrollIntoViewIfNeeded();
  await checkLayout('pitch');
  await shot('06-pitch');
  const start = page.locator('.world-match-start');
  if (!(await start.count())) { notes.push('match button not offered at the pitch arrival point'); return; }
  await start.tap();
  await page.waitForSelector('.world-scoreboard', { timeout: 120000 });
  await page.waitForTimeout(1500);
  await checkLayout('match');
  await shot('07-match');
  await page.locator('.world-scoreboard').getByRole('button', { name: /pass/i }).tap();
  await page.locator('.world-scoreboard').getByRole('button', { name: /shoot/i }).tap();
});

await browser.close();
// GitHub shows at most ten notices per step, so pack the notes into a few long ones.
const packed = [];
for (const note of notes) {
  if (packed.length && packed[packed.length - 1].length + note.length < 880) packed[packed.length - 1] += ` | ${note}`;
  else packed.push(note);
}
for (const note of packed.slice(0, 8)) annotate('notice', 'Phone playtest', note);
for (const problem of [...new Set(problems)]) annotate('error', 'Phone playtest', problem);
console.log(problems.length ? `${problems.length} phone playtest problem(s)` : 'Phone playtest passed');
process.exit(problems.length ? 1 : 0);
