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
import { CAST, DECISIONS, NEW_STORY, advanceStory, currentStep, markSceneSeen, pendingScene, storyComplete } from '../../src/world/storyChapters.mjs';
import { auditContrast, formatFinding } from './contrastAudit.mjs';

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
// HUD contrast (MVP 7b): every visible piece of text is checked in several game states.
const contrastFindings = new Map();
let contrastChecked = 0;
const checkContrast = async state => {
  try {
    const { checked, findings } = await auditContrast(page, state);
    contrastChecked += checked;
    for (const finding of findings) if (!contrastFindings.has(finding.label)) contrastFindings.set(finding.label, finding);
  } catch (error) { notes.push(`contrast audit skipped in ${state}: ${error.message.split('\n')[0]}`); }
};
// Story-scene captions (MVP 7b): once captions are on, a scene's lines name who speaks.
const storyCaptions = { on: false, scenes: 0, seen: new Set() };
const storyCaptionPattern = /speaks?\]|speak\]|Phone buzzes: text from|Story chime/;
const dismissDialogue = async () => {
  for (let i = 0; i < 30; i++) {
    const scene = page.locator('.story-scene');
    if (!(await scene.count())) return;
    if (storyCaptions.on) {
      storyCaptions.scenes++;
      for (const text of await page.locator('.world-sound-captions li').allTextContents()) if (storyCaptionPattern.test(text) && !/Someone speaks/.test(text)) storyCaptions.seen.add(text);
    }
    await scene.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
};

await step('loads the start page', async () => {
  await page.goto(`${base}/?playtest`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const title = await page.title();
  if (title !== 'The Last Decision Day') throw new Error(`page title is "${title}"`);
  // Release basics: icons, share image and manifest are served; What's new and the privacy note are on the page.
  for (const path of ['/icon.svg', '/icon-192.png', '/apple-touch-icon.png', '/share.png', '/manifest.webmanifest']) {
    const response = await page.request.get(`${base}${path}`);
    if (!response.ok()) throw new Error(`${path} returned ${response.status()}`);
  }
  await page.locator('.site-footer summary', { hasText: 'Privacy' }).click({ timeout: 10000 });
  if (!(await page.locator('.site-footer .privacy-note li').count())) throw new Error('privacy note is empty');
  await page.locator('.site-footer summary', { hasText: "What's new" }).click();
  if (!(await page.locator('.site-footer .whats-new li').count())) throw new Error("What's new is empty");
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
  await checkContrast('the street HUD');
  if (await page.locator('.story-scene').count()) {
    await checkContrast('a story scene');
    // Open-world 19a: the opening is directed — a title card and an establishing shot, then a cut on the next line.
    const card = await page.locator('.story-title-card').textContent({ timeout: 2000 }).catch(() => '');
    if (!/New in Town/.test(card ?? '')) throw new Error(`no chapter title card on the opening (saw "${card}")`);
    await waitFor('the opening is directed', timeout => page.waitForFunction(() => window.__tld.read().cutscene?.kind === 'establish', null, { timeout }), 15000);
    const wide = (await read()).camera;
    await shot('01b-cutscene-establish');
    await page.locator('.story-scene').first().click();
    await waitFor('the next line cuts to a new shot', timeout => page.waitForFunction(() => window.__tld.read().cutscene?.index === 1, null, { timeout }), 15000);
    const next = await read();
    if (Math.abs(next.camera.radius - wide.radius) < 0.5 && Math.abs(next.camera.alpha - wide.alpha) < 0.05) throw new Error('the camera did not cut between lines');
    notes.push(`opening shots: establish (radius ${wide.radius.toFixed(1)} m) → ${next.cutscene.kind} (radius ${next.camera.radius.toFixed(1)} m)`);
  } else notes.push('no opening story scene was open to check the directed camera');
  await dismissDialogue();
  await shot('02-after-story');
  const state = await read();
  if (state?.dialogue) throw new Error('dialogue still open');
  await waitFor('the camera is handed back', timeout => page.waitForFunction(() => window.__tld.read().cutscene === null, null, { timeout }), 10000);
  const back = (await read()).camera;
  if (!(back.radius >= 2.8 && back.radius <= 18 && back.beta >= 0.4 && back.beta <= 1.48)) throw new Error(`the follow camera came back out of range (radius ${back.radius}, beta ${back.beta})`);
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
  await checkContrast('the big map');
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
  await checkContrast('a conversation');
  await page.keyboard.press('Enter');
  await waitFor('conversation closes', timeout => page.waitForSelector('.npc-chat-card', { state: 'detached', timeout }), 15000);
  await dismissDialogue();
  if (!(await page.locator('.story-scene').count()) && !(await canvasFocused())) {
    await waitFor('focus back on the 3D view after talking', timeout => page.waitForFunction(() => document.activeElement?.tagName === 'CANVAS', null, { timeout }), 10000);
  }
});
await step('phone opens with P: Mom\'s texts, apps by arrow keys, closes with P', async () => {
  await page.locator('canvas').first().click({ position: { x: 320, y: 120 } });
  await page.keyboard.press('p');
  await waitFor('phone opens', timeout => page.waitForSelector('.world-phone', { timeout }), 30000);
  try {
    if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('.world-phone'))))) throw new Error('phone did not take keyboard focus');
    // The opening scene's text from Mom is in the inbox.
    await page.locator('.world-phone-row', { hasText: 'Mom' }).first().click();
    await waitFor('Mom\'s thread', timeout => page.waitForSelector('.world-phone-thread li', { timeout }), 30000);
    notes.push(`phone: ${await page.locator('.world-phone-thread li').count()} message(s) from Mom`);
    await shot('04e-phone');
    const tabs = page.locator('.world-phone [role=tab]');
    await tabs.filter({ hasText: 'Messages' }).focus();
    await page.keyboard.press('ArrowRight');
    if (!/^Contacts/.test((await page.locator('.world-phone [role=tab][aria-selected=true]').textContent()) ?? '')) throw new Error('ArrowRight did not open Contacts');
    if (!(await page.locator('.world-phone-contact', { hasText: 'Mom' }).count())) throw new Error('Mom missing from contacts');
  } finally {
    await page.keyboard.press('p');
  }
  await waitFor('phone closes', timeout => page.waitForSelector('.world-phone', { state: 'detached', timeout }), 15000);
  if (!(await page.evaluate(() => document.activeElement?.tagName === 'CANVAS'))) throw new Error('focus did not return to the world');
});
await step('phone camera: a filtered photo lands in the Camera app', async () => {
  await page.locator('canvas').first().click({ position: { x: 320, y: 120 } });
  await page.keyboard.press('p');
  await waitFor('phone opens', timeout => page.waitForSelector('.world-phone', { timeout }), 30000);
  await page.locator('.world-phone [role=tab]', { hasText: 'Camera' }).click();
  await page.locator('.world-phone-camera button', { hasText: 'Take photos' }).click();
  await waitFor('viewfinder', timeout => page.waitForSelector('.world-photo', { timeout }), 30000);
  if (await page.locator('.world-phone').count()) throw new Error('the phone should go away while the camera is up');
  if (await page.locator('.story-objective').isVisible()) throw new Error('the HUD should step aside in photo mode');
  await page.keyboard.press('f'); // Golden hour
  await page.keyboard.press('+');
  await page.keyboard.press('a'); // aims, does not walk
  const before = await read();
  await page.keyboard.press(' ');
  await waitFor('photo saved', timeout => page.waitForSelector('.world-photo-last img', { timeout }), 20000);
  const after = await read();
  if (before && after && Math.hypot(after.x - before.x, after.z - before.z) > 0.2) throw new Error('the player walked while aiming the camera');
  const src = await page.locator('.world-photo-last img').getAttribute('src');
  if (!src?.startsWith('data:image/jpeg')) throw new Error('the photo is not a JPEG');
  await shot('04f-photo-mode');
  await page.keyboard.press('Escape');
  await waitFor('camera put away', timeout => page.waitForSelector('.world-photo', { state: 'detached', timeout }), 10000);
  if (await page.locator('.game-menu-backdrop:not([hidden])').count()) throw new Error('Esc in photo mode should not open the menu');
  if (!(await page.evaluate(() => document.activeElement?.tagName === 'CANVAS'))) throw new Error('focus did not return to the world after photo mode');
  await page.keyboard.press('p');
  await waitFor('phone reopens', timeout => page.waitForSelector('.world-phone', { timeout }), 15000);
  await page.locator('.world-phone [role=tab]', { hasText: 'Camera' }).click();
  const saved = await page.locator('.world-phone-photos li').count();
  notes.push(`camera: ${saved} photo(s) in the Camera app, ${Math.round((src?.length ?? 0) / 1024)} KB`);
  if (saved < 1) throw new Error('the photo is missing from the Camera app');
  await page.keyboard.press('p');
  await waitFor('phone closes', timeout => page.waitForSelector('.world-phone', { state: 'detached', timeout }), 15000);
});
await step('menu opens with Esc, shows every tab, and closes', async () => {
  await page.locator('canvas').first().click({ position: { x: 320, y: 120 } });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.game-menu-backdrop:not([hidden])', { timeout: 10000 });
  try {
    for (const tab of ['Settings', 'Story', "What's new", 'Credits']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(200);
    }
    if (!(await page.locator('.game-menu-credits').getByText('OpenStreetMap contributors').count())) throw new Error('credits missing OpenStreetMap');
    if (!(await page.locator('.game-menu-credits .privacy-note li').count())) throw new Error('credits missing the privacy note');
    await shot('04b-menu');
    await checkContrast('the game menu');
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
  storyCaptions.on = true;
  await checkContrast('sound captions');
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
  await checkContrast('downtown');
});
await step('downtown facades and ambient light: cornices, rooftop plant, awnings, contact shadows, lamp pools and lit windows after dark', async () => {
  const look = (await read()).cityLook;
  if (!look) throw new Error('downtown reports no facade details');
  if (look.styles < 4) throw new Error(`only ${look.styles} facade styles downtown`);
  if (look.awnings < 30 || look.rooftop < 60) throw new Error(`too few details: ${look.awnings} awnings, ${look.rooftop} rooftop units`);
  // Baked ambient light (open-world 20b): contact shadows along the walls, darker alleys, lamp pools at night.
  if (look.contactShadows < 500) throw new Error(`only ${look.contactShadows} contact shadows along the walls`);
  if (look.canyonWalls < 100) throw new Error(`only ${look.canyonWalls} walls shaded by a neighbour`);
  if (look.pools < 40) throw new Error(`only ${look.pools} lamp pools`);
  if (look.poolsOn !== look.lit) throw new Error(`lamp pools ${look.poolsOn ? 'on' : 'off'} while windows are ${look.lit ? 'lit' : 'dark'}`);
  const lighting = page.getByRole('button', { name: /Switch lighting/ });
  const startedLit = look.lit;
  await lighting.click();
  await waitFor('windows switch with the lights', timeout => page.waitForFunction(lit => window.__tld.read().cityLook?.lit === !lit, startedLit, { timeout }));
  if ((await read()).cityLook?.poolsOn !== !startedLit) throw new Error('lamp pools did not follow the street lights');
  if (!startedLit) await shot('05a-downtown-night');
  await lighting.click();
  await waitFor('windows switch back', timeout => page.waitForFunction(lit => window.__tld.read().cityLook?.lit === lit, startedLit, { timeout }));
  notes.push(`downtown: ${look.styles} facade styles, ${look.awnings} awnings, ${look.rooftop} rooftop units, ${look.contactShadows} contact shadows, ${look.canyonWalls} canyon-shaded walls, ${look.pools} lamp pools`);
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
await step('weather: rain falls downtown, roads get wet, then fog (open-world 18a)', async () => {
  // Day 1 is always clear, so the playtest forces the weather through the real weather code.
  await page.evaluate(() => window.__tld.weather('showers'));
  await waitFor('rain caption', timeout => page.waitForSelector('.world-sound-captions li:has-text("Rain starts falling")', { timeout }), 15000);
  await waitFor('rain drops falling', timeout => page.waitForFunction(() => { const w = window.__tld.read().weather; return w.loaded && w.drops > 0 && w.wet > 0; }, null, { timeout, polling: 500 }), 120000);
  const hud = await page.locator('.world-weather').first().textContent();
  if (!/rain/i.test(hud ?? '')) throw new Error(`HUD weather says "${hud}"`);
  const fps = await page.evaluate(() => new Promise(resolve => {
    let frames = 0; const start = performance.now();
    const tick = () => { frames++; if (performance.now() - start < 2000) requestAnimationFrame(tick); else resolve(frames / 2); };
    requestAnimationFrame(tick);
  }));
  notes.push(`rain: ${(await read()).weather.drops} drops alive, ~${Math.round(fps)} fps in software rendering`);
  // 18c: puddles lie on the soaked ground around you, and the roads grip less.
  await waitFor('puddles on the wet ground', timeout => page.waitForFunction(() => { const w = window.__tld.read().weather; return w.puddles.count > 0 && w.puddles.level > 0.5; }, null, { timeout, polling: 500 }), 30000);
  const wetRead = (await read()).weather;
  if (!(wetRead.grip < 0.85)) throw new Error(`wet roads should grip less, grip is ${wetRead.grip}`);
  notes.push(`${wetRead.puddles.count} puddles, road grip ${wetRead.grip.toFixed(2)}`);
  await page.waitForTimeout(1500);
  await shot('05c-rain');
  await checkContrast('rain downtown');
  await page.evaluate(() => window.__tld.weather('fog'));
  await waitFor('dry caption', timeout => page.waitForSelector('.world-sound-captions li:has-text("The rain stops")', { timeout }), 15000);
  await waitFor('rain stops in fog', timeout => page.waitForFunction(() => { const w = window.__tld.read().weather; return w.fog === 1 && w.rain === 0; }, null, { timeout }), 10000);
  await page.waitForTimeout(1500);
  await shot('05d-fog');
  await page.evaluate(() => window.__tld.weather(null));
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
  await dismissDialogue(); // the minimap steps aside during story scenes
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
await step('career duty: a fire call downtown, the hose on a burning skip, paid on sign-off (MVP 8b, open-world 16a)', async () => {
  if (!(await page.evaluate(() => window.__tld.place('firefighter')))) throw new Error('fire station sign not found downtown');
  const apply = page.locator('.world-car-action', { hasText: /Apply: Firefighter/ });
  await waitFor('apply button at the fire station', timeout => apply.waitFor({ timeout }));
  await apply.click();
  await waitFor('joined the fire service', timeout => page.waitForFunction(() => window.__tld.read().career.id === 'firefighter', null, { timeout }));
  await dismissDialogue();
  const start = page.locator('.world-car-action', { hasText: /Start duty: Fire call/ });
  await waitFor('start-duty button', timeout => start.waitFor({ timeout }));
  await start.click();
  await waitFor('duty starts', timeout => page.waitForFunction(() => Boolean(window.__tld.read().duty), null, { timeout }));
  await waitFor('duty card shows', timeout => page.waitForSelector('.world-duty', { timeout }));
  const { duty, career } = await read();
  notes.push(`fire call: ${duty.stops} stops, par ${duty.par}s`);
  await page.waitForTimeout(1500);
  await shot('05e-duty');
  await checkContrast('a career duty');
  // Stand at each stop in turn (walking the route at 2 fps software rendering would take far too long).
  for (let i = 0; i < duty.stops; i++) {
    const at = (await read()).duty?.next;
    if (at === undefined) break;
    if (!(await page.evaluate(() => window.__tld.place('duty')))) throw new Error(`could not stand at duty stop ${at + 1}`);
    if (at === 0) {
      // Open-world 16a: the first stop is a burning skip. The run waits there until the hose has put it out.
      await waitFor('arrived at the fire', timeout => page.waitForFunction(() => window.__tld.read().duty?.beat === 'hose', null, { timeout }));
      const lit = (await read()).fire;
      if (!lit || lit.out || !(lit.heat > 0.9)) throw new Error(`no fire burning at the call: ${JSON.stringify(lit)}`);
      await waitFor('fire meter on the duty card', timeout => page.locator('.world-duty-fire [role=meter]').waitFor({ timeout }));
      await waitFor('flames drawn', timeout => page.waitForFunction(() => window.__tld.read().fire?.drawn, null, { timeout }));
      await page.waitForTimeout(1500);
      await shot('05e-fire-call');
      // Hold Space (the hose) with the 3D view focused; the soft aim assist keeps the jet on the flames.
      await page.locator('canvas').first().focus();
      await page.keyboard.down(' ');
      try {
        await waitFor('the hose sprays', timeout => page.waitForFunction(() => window.__tld.read().fire?.spraying, null, { timeout }));
        await page.waitForTimeout(1200);
        await shot('05e-hose');
        await waitFor('fire knocked down by the hose', timeout => page.waitForFunction(() => window.__tld.read().fire?.out, null, { timeout }), 240000);
      } finally { await page.keyboard.up(' '); }
      const out = await read();
      if (out.duty?.beat) throw new Error('the duty stayed at the fire after it went out');
      if (out.duty?.next !== 1) throw new Error(`the fire call did not move on to stop 2 (next ${out.duty?.next})`);
      if (!(out.fire.water > 0)) throw new Error('no water used');
      notes.push(`fire out with ${Math.round(out.fire.water)} L of water`);
      continue;
    }
    await waitFor(`duty stop ${at + 1} counts`, timeout => page.waitForFunction(n => window.__tld.read().duty?.next !== n, at, { timeout }));
  }
  await waitFor('shift signed off and paid', timeout => page.waitForFunction(shifts => { const s = window.__tld.read(); return !s.duty && !s.busy && s.career.shifts > shifts; }, career.shifts, { timeout }));
  const after = (await read()).career;
  if (!(after.money > career.money)) throw new Error(`no pay for the duty (savings ${career.money} → ${after.money})`);
  if (await page.locator('.world-duty').count()) throw new Error('the duty card stayed up after signing off');
  notes.push(`duty paid $${after.money - career.money}`);
  await dismissDialogue();
});
await step('station vehicles: a firefighter drives the fire engine with lights and siren (open-world 13c)', async () => {
  await waitFor('cruiser and fire engine parked downtown', timeout => page.waitForFunction(() => (window.__tld.read().stationVehicles ?? []).length >= 2, null, { timeout }));
  // A firefighter may not take the police cruiser.
  if (!(await page.evaluate(() => window.__tld.place('cruiser')))) throw new Error('could not stand beside the police cruiser');
  await waitFor('cruiser is police only', timeout => page.locator('.world-car-action', { hasText: /Police cruiser \(police only\)/ }).waitFor({ timeout }));
  if (!(await page.evaluate(() => window.__tld.place('fire-engine')))) throw new Error('could not stand beside the fire engine');
  const getIn = page.locator('.world-car-action', { hasText: /Drive the fire engine/ });
  await waitFor('drive-the-engine prompt', timeout => getIn.waitFor({ timeout }));
  await getIn.click();
  await waitFor('in the fire engine', timeout => page.waitForFunction(() => window.__tld.read().car?.kind === 'fire-engine', null, { timeout }));
  await page.locator('canvas').first().focus();
  await page.keyboard.press('l');
  await waitFor('lights and siren on', timeout => page.waitForFunction(() => window.__tld.read().car?.siren === true, null, { timeout }));
  await page.locator('.world-siren-key[aria-pressed="true"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await shot('05f-fire-engine');
  // Touch SIREN switches them off again.
  await page.locator('.world-siren-key').click();
  await waitFor('lights and siren off', timeout => page.waitForFunction(() => window.__tld.read().car?.siren === false, null, { timeout }));
  const getOut = page.locator('.world-car-action', { hasText: /Get out of the fire engine/ });
  await getOut.click();
  await waitFor('out of the engine', timeout => page.waitForFunction(() => !window.__tld.read().driving, null, { timeout }));
  notes.push('fire engine: driven, lights and siren on and off');
});
await step('police patrol with a call: a lost child walked back to his dad (open-world 16b)', async () => {
  if (!(await page.evaluate(() => window.__tld.place('police')))) throw new Error('police station sign not found downtown');
  const apply = page.locator('.world-car-action', { hasText: /Apply: Police Officer/ });
  await waitFor('apply button at the police station', timeout => apply.waitFor({ timeout }));
  await apply.click();
  await waitFor('joined the police', timeout => page.waitForFunction(() => window.__tld.read().career.id === 'police', null, { timeout }));
  await dismissDialogue();
  const start = page.locator('.world-car-action', { hasText: /Start duty: Patrol route/ });
  await waitFor('start-patrol button', timeout => start.waitFor({ timeout }));
  const before = await read();
  notes.push(`before the patrol: ${Math.floor(before.minute / 60)}:${String(Math.floor(before.minute % 60)).padStart(2, '0')}, energy ${Math.round(before.energy)}`);
  await start.click();
  await waitFor('patrol starts with a call', timeout => page.waitForFunction(() => Boolean(window.__tld.read().duty && window.__tld.read().call), null, { timeout }));
  const { duty, call, career } = await read();
  if (call.kind !== 'lost-child') throw new Error(`the first patrol's call is ${call.kind}, expected lost-child`);
  await waitFor('call people drawn', timeout => page.waitForFunction(() => window.__tld.read().call?.drawn, null, { timeout }));
  notes.push(`patrol: ${duty.stops} stops, call "${call.kind}" at stop ${call.stop + 1}, par ${duty.par}s`);
  for (let i = 0; i < duty.stops + 3; i++) {
    const state = await read();
    if (!state.duty) break;
    if (state.call?.phase === 'talk') {
      // Answer with the keyboard: 1 is the kind answer.
      await waitFor('call answers shown', timeout => page.locator('.world-duty-answers button').first().waitFor({ timeout }));
      await page.waitForTimeout(800);
      await shot('05g-police-call');
      await checkContrast('a police call');
      await page.locator('canvas').first().focus();
      await page.keyboard.press('1');
      await waitFor('call answered, escort starts', timeout => page.waitForFunction(() => window.__tld.read().call?.phase === 'escort', null, { timeout }));
      continue;
    }
    const at = `${state.duty.next}/${state.call?.phase}`;
    if (!(await page.evaluate(() => window.__tld.place('duty')))) throw new Error(`could not stand at patrol stop ${state.duty.next + 1}`);
    await waitFor(`patrol moves on from ${at}`, timeout => page.waitForFunction(was => {
      const s = window.__tld.read();
      return !s.duty || `${s.duty.next}/${s.call?.phase}` !== was;
    }, at, { timeout }));
    if (state.call?.phase === 'escort') {
      const after = await read();
      if (after.call?.phase !== 'done') throw new Error(`the boy wasn't handed over (call ${after.call?.phase}, ${after.call?.child?.toFixed(1)} m from you)`);
      await page.waitForTimeout(800);
      await shot('05h-police-reunited');
    }
  }
  await waitFor('patrol signed off and paid', timeout => page.waitForFunction(shifts => { const s = window.__tld.read(); return !s.duty && !s.busy && s.career.shifts > shifts; }, career.shifts, { timeout }));
  const after = (await read()).career;
  // Rank-1 police pay is $60; on time plus a commended call pays more than a plain shift.
  if (!(after.money - career.money > 60)) throw new Error(`the patrol with a call paid only $${after.money - career.money}`);
  notes.push(`patrol with a call paid $${after.money - career.money}`);
  await dismissDialogue();
});
await step('route march: scored checkpoints, a split and a map-and-compass call at each (open-world 16c)', async () => {
  if (!(await page.evaluate(() => window.__tld.place('soldier')))) throw new Error('recruiting office sign not found downtown');
  const apply = page.locator('.world-car-action', { hasText: /Apply: Soldier/ });
  await waitFor('apply button at the recruiting office', timeout => apply.waitFor({ timeout }));
  await apply.click();
  await waitFor('joined the army', timeout => page.waitForFunction(() => window.__tld.read().career.id === 'soldier', null, { timeout }));
  await dismissDialogue();
  // Another shift on the same playtest day: rested and inside opening hours.
  await page.evaluate(() => window.__tld.rest());
  const start = page.locator('.world-car-action', { hasText: /Start duty: Route march/ });
  await waitFor('start-march button', timeout => start.waitFor({ timeout }));
  await start.click();
  await waitFor('march starts with a scorecard', timeout => page.waitForFunction(() => Boolean(window.__tld.read().duty && window.__tld.read().march), null, { timeout }));
  const { duty, career } = await read();
  notes.push(`route march: ${duty.stops - 1} checkpoints, par ${duty.par}s`);
  for (let i = 0; i < duty.stops - 1; i++) {
    const at = (await read()).duty?.next;
    if (at !== i) throw new Error(`march at stop ${at}, expected ${i}`);
    if (!(await page.evaluate(() => window.__tld.place('duty')))) throw new Error(`could not stand at checkpoint ${i + 1}`);
    await waitFor(`checkpoint ${i + 1} holds for a bearing`, timeout => page.waitForFunction(() => window.__tld.read().march?.drill, null, { timeout }));
    const answers = page.locator('.world-duty-bearings button');
    await waitFor('bearing answers shown', timeout => answers.first().waitFor({ timeout }));
    const texts = await answers.allInnerTexts();
    if (texts.length !== 3) throw new Error(`expected three bearings, got ${JSON.stringify(texts)}`);
    const { march } = await read();
    if (!march.legs[i].pace) throw new Error(`no split recorded at checkpoint ${i + 1}`);
    // Call the right bearing with the keyboard on every checkpoint but the second; tap a wrong one there.
    const right = texts.findIndex(t => t.replace(/^\s*\d\s*/, '').startsWith(`${march.legs[i].answer} `));
    if (right < 0) throw new Error(`right bearing ${march.legs[i].answer} not offered: ${JSON.stringify(texts)}`);
    if (i === 0) { await page.waitForTimeout(800); await shot('05i-route-march-bearing'); await checkContrast('a route march bearing call'); }
    if (i === 1) await answers.nth((right + 1) % 3).click();
    else { await page.locator('canvas').first().focus(); await page.keyboard.press(String(right + 1)); }
    await waitFor(`checkpoint ${i + 1} done`, timeout => page.waitForFunction(n => window.__tld.read().duty?.next === n + 1, i, { timeout }));
    const called = (await read()).march.legs[i];
    if (called.correct !== (i !== 1)) throw new Error(`bearing at checkpoint ${i + 1} scored ${called.correct}`);
  }
  if (!(await page.evaluate(() => window.__tld.place('duty')))) throw new Error('could not stand at the recruiting office door');
  await waitFor('march signed off and paid', timeout => page.waitForFunction(shifts => { const s = window.__tld.read(); return !s.duty && !s.busy && s.career.shifts > shifts; }, career.shifts, { timeout }));
  const { lastMarch } = await read();
  if (!lastMarch || lastMarch.bearings !== lastMarch.legs - 1) throw new Error(`march scorecard ${JSON.stringify(lastMarch)}`);
  const after = (await read()).career;
  if (!(after.money > career.money)) throw new Error(`no pay for the march (savings ${career.money} → ${after.money})`);
  notes.push(`route march ${lastMarch.title} ${lastMarch.score}/${lastMarch.max}, ${lastMarch.bearings}/${lastMarch.legs} bearings, paid $${after.money - career.money}`);
  await dismissDialogue();
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

await step('the open road: drive into downtown and out again with no fade (item 17)', async () => {
  // In the family car on Maple Street, then near the downtown end of the road (all of it is ~40 s of game time,
  // several minutes in CI's software renderer).
  if (!(await page.evaluate(() => window.__tld.place('car')))) throw new Error('no parked car to get into');
  const getIn = page.locator('.world-car-action', { hasText: /^Get in car/ });
  await waitFor('get-in prompt', timeout => getIn.waitFor({ timeout }), 60000);
  await getIn.click();
  await waitFor('in the car', timeout => page.waitForFunction(() => window.__tld.read().driving, null, { timeout }), 15000);
  await waitFor('car on the open road', timeout => page.waitForFunction(() => window.__tld.openRoad(0.9), null, { timeout, polling: 1000 }), 60000);
  // 17b: the HUD shows the open road's speed limit, and there is traffic on the road.
  await waitFor('open-road speed sign on the HUD', timeout => page.locator('.world-drive-zone', { hasText: /Open road/ }).waitFor({ timeout }), 60000);
  notes.push(`open road limit: ${await page.locator('.world-drive-zone').innerText()}`);
  await waitFor('cars on the open road', timeout => page.waitForFunction(() => window.__tld.read().roadTraffic.length > 0, null, { timeout, polling: 1000 }), 120000);
  notes.push(`${(await read()).roadTraffic.length} cars on the open road`);
  // Any fade (the old "Driving to…" screen) on the way counts as a failure.
  await page.evaluate(() => {
    window.__roadFaded = false;
    window.__roadWatch = setInterval(() => { if (window.__tld.read().taxi || document.querySelector('.world-bus')) window.__roadFaded = true; }, 100);
  });
  const drive = async (key, label, until) => {
    await page.keyboard.down(key);
    try { await waitFor(label, timeout => page.waitForFunction(until, null, { timeout, polling: 250 }), 240000); }
    finally { await page.keyboard.up(key); }
  };
  await drive('w', 'drive into downtown on the road', () => { const s = window.__tld.read(); return s.location === 'city' && s.driving; });
  await shot('07b-open-road-arrive');
  const arrived = await read();
  notes.push(`open road: arrived downtown at road progress ${arrived.road}, ${arrived.car.speed.toFixed(1)} m/s`);
  await drive('s', 'reverse back out onto the road', () => { const s = window.__tld.read(); return s.location === 'street' && s.driving; });
  await drive('w', 'drive into downtown again', () => { const s = window.__tld.read(); return s.location === 'city' && s.driving; });
  await drive('s', 'stop the car', () => (window.__tld.read().car?.speed ?? 9) < 0.3);
  const faded = await page.evaluate(() => { clearInterval(window.__roadWatch); return window.__roadFaded; });
  if (faded) throw new Error('a fade screen showed while driving the open road');
  // 17c: downtown is drawn and Maple Street isn't, once you're in town.
  await waitFor('Maple Street streamed out downtown', timeout => page.waitForFunction(() => { const s = window.__tld.read().streaming; return s.city && !s.town && s.hidden > 0; }, null, { timeout, polling: 500 }), 30000);
  notes.push(`streaming downtown: ${(await read()).streaming.hidden} Maple Street meshes not drawn`);
  for (let tries = 0; tries < 10 && (await read()).driving; tries++) { await page.keyboard.press('e'); await page.waitForTimeout(1500); }
  if ((await read()).driving) throw new Error('could not get out of the car downtown');
  await page.evaluate(() => window.__tld.travel('maple'));
  await page.waitForFunction(() => window.__tld.read().location === 'street', null, { timeout: 180000 });
  await dismissDialogue();
  // …and back home, downtown isn't drawn.
  await waitFor('downtown streamed out on Maple Street', timeout => page.waitForFunction(() => { const s = window.__tld.read().streaming; return s.town && !s.city && s.hidden > 0; }, null, { timeout, polling: 500 }), 30000);
  notes.push(`streaming at home: ${(await read()).streaming.hidden} downtown meshes not drawn`);
});

// MVP 9b: the whole story, chapter 1 to the epilogue, once for each of the three endings. Every step's gameplay
// event goes through the game's own story code (the systems that raise them — school, sleep, downtown, careers,
// the match — are played for real above), every scene is clicked through and checked line by line, the last
// decision is made in a real conversation with the neighbour you choose, and Maple Street must show its change.
/** Clicks through the open story scene in the page and returns the lines it showed. */
const playScene = () => page.evaluate(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const seen = [];
  for (let i = 0; i < 60; i++) {
    const scene = document.querySelector('.story-scene');
    if (!scene) break;
    const text = scene.querySelector('.story-box p')?.textContent ?? '';
    if (seen.at(-1) !== text) seen.push(text);
    // Open-world 19a: wait for the director to frame this line, and note which shot it used.
    const index = Number(/^(\d+)\//.exec(scene.querySelector('.story-continue')?.textContent ?? '')?.[1] ?? 0) - 1;
    // Match the line's text too: a scene that opens as another closes would otherwise still show the old line 0.
    const framed = () => { const shot = window.__tld.read().cutscene; return shot?.index === index && shot.text === text; };
    for (let wait = 0; wait < 60 && !framed(); wait++) await sleep(50);
    const kind = window.__tld.read().cutscene?.kind;
    window.__shotKinds = window.__shotKinds ?? {};
    window.__shotKinds[kind ?? 'none'] = (window.__shotKinds[kind ?? 'none'] ?? 0) + 1;
    // Open-world 19b: what your character acted on this line (gesture and face).
    const acted = window.__tld.read().cutscene;
    window.__acting = window.__acting ?? {};
    for (const key of [acted?.gesture && `gesture:${acted.gesture}`, acted?.emotion && `face:${acted.emotion}`]) if (key) window.__acting[key] = (window.__acting[key] ?? 0) + 1;
    scene.click();
    for (let wait = 0; wait < 60; wait++) {
      await sleep(50);
      const now = document.querySelector('.story-scene');
      if (!now || (now.querySelector('.story-box p')?.textContent ?? '') !== text) break;
    }
  }
  return seen;
});
/** Makes the last decision by talking to that neighbour; false if they aren't out on Maple Street right now. */
const decideInPerson = async who => {
  const name = CAST[who].name;
  for (let tries = 0; tries < 8; tries++) {
    if (!(await page.evaluate(id => window.__tld.place(`talk:${id}`), who))) return false;
    const prompt = page.locator('.world-car-action', { hasText: `Talk to ${name}` }).first();
    if (!(await prompt.waitFor({ timeout: 8000 }).then(() => true, () => false))) continue;
    await prompt.click({ timeout: 5000 }).catch(() => {});
    const card = page.locator('.npc-chat-card');
    if (!(await card.waitFor({ timeout: 15000 }).then(() => true, () => false))) continue;
    if (!(await card.locator('.npc-chat-heading strong', { hasText: name }).count())) {
      // Somebody else walked up first: leave without answering, so nothing is decided.
      await card.getByRole('button', { name: 'Leave conversation' }).click();
      await card.waitFor({ state: 'detached', timeout: 15000 });
      continue;
    }
    await card.locator('.npc-chat-choices button').first().click();
    await waitFor('reply shows', timeout => page.locator('.npc-chat-result').waitFor({ timeout }), 15000);
    await page.getByRole('button', { name: 'Continue story' }).click();
    await waitFor('conversation closes', timeout => card.waitFor({ state: 'detached', timeout }), 15000);
    return true;
  }
  throw new Error(`could not get into a conversation with ${name}`);
};
const endingScenes = [];
for (const [event, ending] of Object.entries(DECISIONS)) {
  const who = event.slice('talked-'.length);
  await step(`full story playthrough: ending "${ending.title}" (MVP 9b)`, async () => {
    await playScene();
    if (!(await page.evaluate(() => window.__tld.story.restart()))) throw new Error('could not restart the story');
    let state = { ...NEW_STORY };
    let scenes = 0, lines = 0, inPerson = false;
    for (let guard = 0; guard < 80; guard++) {
      const { chapter, step: current } = currentStep(state);
      const expected = pendingScene(state);
      if (expected) {
        await waitFor(`scene "${chapter.title} · ${current.id}"`, timeout => page.waitForSelector('.story-scene', { timeout }), 30000);
        const seen = await playScene();
        const missing = expected.map(line => line.text).filter(text => !seen.includes(text));
        if (missing.length) throw new Error(`${chapter.title} · ${current.id}: scene skipped "${missing[0]}" (showed ${seen.length} line(s))`);
        scenes++; lines += seen.length;
        state = markSceneSeen(state);
      }
      const live = (await read()).story;
      if (live.chapter !== state.chapter || live.step !== state.step) throw new Error(`game is at chapter ${live.chapter + 1} step ${live.step + 1}, expected ${chapter.title} · ${current.id}`);
      if (storyComplete(state)) break;
      if (current.decide) {
        inPerson = await decideInPerson(who);
        if (!inPerson) await page.evaluate(e => window.__tld.story.report(e), event);
      } else {
        await page.evaluate(e => window.__tld.story.report(e), current.completeOn[0]);
      }
      state = advanceStory(state, current.decide ? event : current.completeOn[0]).state;
    }
    if (!storyComplete(state)) throw new Error('the story never reached its epilogue');
    const final = (await read()).story;
    if (final.decision !== ending.id) throw new Error(`decision saved as ${final.decision}, expected ${ending.id}`);
    await waitFor(`Maple Street shows "${ending.title}"`, timeout => page.waitForFunction(id => window.__tld.read().decor === id, ending.id, { timeout }), 30000);
    await page.waitForTimeout(1500);
    await shot(`09-ending-${ending.id}`);
    endingScenes.push(`${ending.id}: ${scenes} scenes, ${lines} lines, decided ${inPerson ? `in person with ${CAST[who].name}` : `by event (${CAST[who].name} was not out)`}`);
  });
}
if (endingScenes.length) notes.push(`endings played: ${endingScenes.join(' · ')}`);
await step('story scenes are directed with a range of shots (open-world 19a)', async () => {
  const kinds = await page.evaluate(() => window.__shotKinds ?? {});
  notes.push(`story shots: ${Object.entries(kinds).map(([kind, count]) => `${kind} ${count}`).join(', ')}`);
  const missing = ['establish', 'narration', 'phone', 'crane'].filter(kind => !kinds[kind]);
  if (missing.length) throw new Error(`no ${missing.join(', ')} shots across the story`);
  if ((kinds.none ?? 0) > 3) throw new Error(`${kinds.none} story lines had no directed shot`);
});
await step('story scenes are acted: the note, the photo, the reveal and the celebrations (open-world 19b)', async () => {
  const kinds = await page.evaluate(() => window.__shotKinds ?? {});
  const acting = await page.evaluate(() => window.__acting ?? {});
  notes.push(`story acting: ${Object.entries(acting).map(([key, count]) => `${key} ${count}`).join(', ') || 'none'}`);
  const missingShots = ['detail', 'push'].filter(kind => !kinds[kind]);
  if (missingShots.length) throw new Error(`no ${missingShots.join(', ')} shots across the story`);
  const missing = ['gesture:Talk', 'gesture:PickUp', 'gesture:Interact', 'gesture:Dance', 'face:happy', 'face:fear'].filter(key => !acting[key]);
  if (missing.length) throw new Error(`story scenes never showed ${missing.join(', ')}`);
  // Three endings, three celebrations.
  if ((acting['gesture:Dance'] ?? 0) < 3) throw new Error(`only ${acting['gesture:Dance'] ?? 0} of 3 endings celebrated`);
});

await step('a crash shows the error screen with a working reload button', async () => {
  // A separate tab, so the deliberate crash is not mistaken for a real one in the main run.
  // The main run is over: park its tab so its software-rendered 3D world stops competing for the CPU.
  await page.goto('about:blank').catch(() => {});
  const crashPage = await browser.newPage({ viewport: { width: 640, height: 360 } });
  try {
    crashPage.on('pageerror', error => { if (!/Playtest crash/.test(error.message)) problems.push(`page error (crash check): ${error.message}`); });
    await crashPage.goto(`${base}/?playtest&crash`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await crashPage.getByRole('button', { name: /try the 3d demo/i }).click({ timeout: 45000 });
    const screen = crashPage.locator('.error-screen');
    await screen.waitFor({ timeout: 20000 });
    if (!(await screen.getByText('Something went wrong').count())) throw new Error('error screen has no title');
    await crashPage.screenshot({ path: `${out}/08-error-screen.png` });
    await screen.getByRole('button', { name: 'Back to the start page' }).click();
    await crashPage.getByRole('button', { name: /try the 3d demo/i }).click({ timeout: 45000 });
    await screen.waitFor({ timeout: 20000 });
    await Promise.all([crashPage.waitForEvent('load', { timeout: 60000 }), screen.getByRole('button', { name: 'Reload the game' }).click()]);
    await crashPage.getByRole('button', { name: /try the 3d demo/i }).waitFor({ timeout: 30000 });
  } finally { await crashPage.close(); }
});

await step('story scenes caption who is speaking', async () => {
  if (!storyCaptions.scenes) { notes.push('no story scene played with captions on'); return; }
  if (!storyCaptions.seen.size) throw new Error(`${storyCaptions.scenes} story line(s) shown with captions on, but no speaker caption`);
  notes.push(`story captions: ${[...storyCaptions.seen].slice(0, 4).join(', ')}`);
});
await step('HUD text contrast (WCAG AA over dark and bright scenes)', async () => {
  notes.push(`contrast: ${contrastChecked} text samples checked, ${contrastFindings.size} below AA`);
  if (!contrastFindings.size) return;
  // Annotations are capped per step, so the findings are packed several to a line.
  let chunk = '';
  for (const finding of contrastFindings.values()) {
    const line = formatFinding(finding);
    if (chunk && chunk.length + line.length > 850) { annotate('warning', 'Contrast', chunk); chunk = ''; }
    chunk += (chunk ? ' · ' : '') + line;
  }
  if (chunk) annotate('warning', 'Contrast', chunk);
  throw new Error(`${contrastFindings.size} HUD text element(s) below WCAG AA contrast (see the Contrast warnings)`);
});

await browser.close();
for (const note of notes) annotate('notice', 'Playtest', note);
for (const problem of [...new Set(problems)]) annotate('error', 'Playtest', problem);
console.log(problems.length ? `${problems.length} playtest problem(s)` : 'Playtest passed');
process.exit(problems.length ? 1 : 0);
