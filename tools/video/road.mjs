// Films a scripted tour of the real game as a guest, one frame at a time.
// Animation frames are stepped exactly 1/30 s at a time, so the video
// is smooth regardless of how slowly the software renderer draws.
//
//   node tools/video/record.mjs <url> <outDir> [preview|full]
//
// preview: writes a few stills (preview-*.jpg) at the busiest moments.
// full:    writes frames/00001.jpg… for ffmpeg, plus captions.json.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [url = 'http://127.0.0.1:4173/', outDir = 'video-out', mode = 'preview'] = process.argv.slice(2);
const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
mkdirSync(join(outDir, 'frames'), { recursive: true });

/**
 * The tour. Each shot lasts `seconds`; `keys` are held for the whole shot,
 * `press` keys are tapped at its start, `drag` orbits the camera (pixels/second),
 * `click` presses a button by its visible text.
 */
const UNUSED_SHOTS = [
  // Establishing overhead orbit, then back to the third-person camera (Reset view puts it behind you).
  { seconds: 5, caption: 'The Last Decision — a life in one neighborhood', press: ['c'], drag: 60 },
  { seconds: 3, caption: 'Morning on your street', press: ['c'], click: 'Reset view' },
  // With the camera behind you, W walks toward the school.
  { seconds: 2, caption: 'Walk anywhere — neighbors keep to their side', keys: ['w'] },
  { seconds: 0.7, caption: 'Hold Shift to run', keys: ['w', 'Shift'] },
  // Beside the sedan parked near the school.
  { seconds: 1.5, caption: 'Press E by a car to get in', press: ['e'] },
  { seconds: 1.6, caption: 'Drive: W gas · S brake · A/D steer', keys: ['w'] },
  // Brake to a crawl, then let it roll to a stop (holding S longer would start reversing).
  { seconds: 0.75, caption: 'Drive: W gas · S brake · A/D steer', keys: ['s'] },
  { seconds: 0.5, caption: 'Stop, then E to get out' },
  { seconds: 1.5, caption: 'Stop, then E to get out', press: ['e'] },
  { seconds: 4.5, caption: 'Street lamps come on at dusk', click: 'Switch lighting', drag: 55 },
  { seconds: 4, caption: 'Your day is saved — see you tomorrow', press: ['c'], drag: 35 },
];
const STILLS = [2.5, 9, 11.5, 13.5, 16, 19.5];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
page.on('pageerror', error => console.error('page error:', error.message));
// No backend in this recording: answer the account checks as a signed-out guest.
await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
// Load in real time; frame stepping starts only once the world is ready.
const consoleLines = [];
page.on('console', message => consoleLines.push(`${message.type()}: ${message.text()}`));
page.on('requestfailed', request => consoleLines.push(`request failed: ${request.url()} ${request.failure()?.errorText}`));
// Frame stepping: once started, the page's requestAnimationFrame callbacks are held and run only
// when we step, with performance.now advanced by exactly one frame. Timers and Playwright's own
// screenshot machinery keep running in real time.
await page.addInitScript(() => {
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  let manual = false;
  let now = 0;
  let queue = [];
  performance.now = () => (manual ? now : realNow());
  window.requestAnimationFrame = callback => {
    if (!manual) return realRaf(callback);
    queue.push(callback);
    return queue.length;
  };
  window.__videoClock = {
    start() { now = realNow(); manual = true; },
    step(ms) {
      now += ms;
      const due = queue;
      queue = [];
      for (const callback of due) callback(now);
      return due.length;
    },
  };
});
await page.goto(url);
try {
  await page.getByRole('button', { name: /Try the 3D demo/ }).click({ timeout: 60000 });
} catch (error) {
  // Leave evidence for the workflow to commit: what the page actually showed.
  await page.screenshot({ path: join(outDir, '..', 'media', 'debug-start.jpg'), type: 'jpeg', quality: 80 }).catch(() => {});
  writeFileSync(join(outDir, '..', 'media', 'debug-start.txt'),
    `URL: ${page.url()}\n\nTEXT:\n${await page.locator('body').innerText().catch(() => '?')}\n\nCONSOLE:\n${consoleLines.join('\n')}\n`);
  throw error;
}

// Film only the 3D view: fill the window with it, keep its HUD, hide the page around it.
await page.addStyleTag({ content: `
  body { overflow: hidden !important; }
  .world-viewport { position: fixed !important; inset: 0 !important; height: 100vh !important; width: 100vw !important; z-index: 9999; }
  .world-root { border: 0 !important; }
` });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));

// Wait for the rigged character, then a little longer for models and neighbours.
const ready = page.getByText(/Character ready/);
await ready.waitFor({ timeout: 120000 }).catch(() => console.warn('character status not seen; filming anyway'));
await page.waitForTimeout(8000);
// From here every frame is exactly 1/30 s of game time, however slowly it renders.
await page.evaluate(() => window.__videoClock.start());
// The last real frame queues the first held one.
await page.waitForTimeout(200);
const step = () => page.evaluate(ms => window.__videoClock.step(ms), 1000 / FPS);
// Grab the composited surface directly (no font/animation waits that a slow software GPU can trip).
const cdp = await page.context().newCDPSession(page);
page.setDefaultTimeout(180000);
async function capture(path) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true });
  writeFileSync(path, Buffer.from(data, 'base64'));
}

// Chapter 1 opens with a story scene: read through it first.
for (let i = 0; i < 40; i++) {
  const open = await page.evaluate(() => { const scene = document.querySelector('.story-scene'); if (scene) scene.click(); return Boolean(scene); });
  if (!open) break;
  for (let f = 0; f < 3; f++) await page.evaluate(ms => window.__videoClock.step(ms), 1000 / 30);
  await page.waitForTimeout(60);
}
const canvas = page.locator('canvas').first();
await canvas.click({ position: { x: WIDTH / 2, y: HEIGHT / 2 } });
const box = await canvas.boundingBox();
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };


const held = new Set();
async function hold(keys = []) {
  for (const key of [...held]) if (!keys.includes(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
let shotIndex = 0;
async function frames(seconds, still) {
  for (let i = 0; i < Math.round(seconds * FPS); i++) await step();
  if (still) { await capture(join(outDir, `preview-${String(++shotIndex).padStart(2, '0')}-${still}.jpg`)); console.log('still', still); }
}
const prompt = () => page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent).find(t => /bus/.test(t ?? '')) ?? '');
const status = async label => console.log(label, '|', (await page.locator('.world-wayfinding').innerText().catch(() => '')), '|', await prompt());
const clickText = text => page.evaluate(t => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes(t)); b?.click(); return Boolean(b); }, text);



async function settle(seconds) { for (let i = 0; i < seconds * 10; i++) { await step(); await page.waitForTimeout(100); } }
const dismiss = () => page.evaluate(() => { const d = document.querySelector('.story-scene'); d?.click(); return Boolean(d); });
const carPrompt = () => page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Get in car/.test(b.textContent ?? '')));
await clickText('Reset view'); await canvas.focus(); await settle(3);
for (let t = 0; t < 60 && !(await carPrompt()); t++) { if (await dismiss()) { await hold([]); await settle(0.2); continue; } await hold(['s']); await frames(0.1); }
await hold([]);
console.log('car in reach:', await carPrompt());
await page.keyboard.press('e'); await settle(1);
// The parked sedan faces south (toward the school): back straight up the street to the open road.
for (let t = 0; t < 90; t++) {
  const label = await page.evaluate(() => document.querySelector('.world-bus span')?.textContent ?? '');
  if (/Driving to/.test(label)) { console.log('leaving town at step', t); break; }
  await hold(['s']); await frames(0.1);
  if (t === 30) await frames(0.01, 'gate-open');
}
await hold([]);
await frames(0.3, 'driving-out');
await settle(3);
await status('after drive');
await frames(0.1, 'downtown-by-car');
await hold(['w']); await frames(1.5, 'downtown-driving'); await hold([]); await settle(0.5);
await page.keyboard.press('n'); await settle(1);
await frames(0.1, 'map-downtown');
await clickText('Maple Street'); await settle(0.5); await frames(0.1, 'map-street');
console.log('map buttons:', await page.evaluate(() => [...document.querySelectorAll('.world-map button')].map(b => b.textContent).join(' | ')));
writeFileSync(join(outDir, 'page.txt'), await page.locator('body').innerText().catch(() => '?'));
await browser.close();
