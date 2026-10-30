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
const SHOTS = [
  // Establishing overhead orbit, then back to the third-person camera (Reset view puts it behind you).
  { seconds: 5, caption: 'The Last Decision — a life in one neighborhood', press: ['c'], drag: 60 },
  { seconds: 3, caption: 'Morning on your street', press: ['c'], click: 'Reset view' },
  // With the camera behind you, W walks toward the school.
  { seconds: 2, caption: 'Walk anywhere — neighbors keep to their side', keys: ['w'] },
  { seconds: 0.7, caption: 'Hold Shift to run', keys: ['w', 'Shift'] },
  // Beside the sedan parked near the school.
  { seconds: 1.5, caption: 'Press E by a car to get in', press: ['e'] },
  { seconds: 1.6, caption: 'Drive: W gas · S brake · A/D steer', keys: ['w'] },
  { seconds: 1.2, caption: 'Drive: W gas · S brake · A/D steer', keys: ['s'] },
  { seconds: 1.5, caption: 'Stop, then E to get out', press: ['e'] },
  { seconds: 4.5, caption: 'Street lamps come on at dusk', click: 'Switch lighting', press: ['c'], drag: 55 },
  { seconds: 4, caption: 'Your day is saved — see you tomorrow', drag: 35 },
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

const canvas = page.locator('canvas').first();
await canvas.click({ position: { x: WIDTH / 2, y: HEIGHT / 2 } });
const box = await canvas.boundingBox();
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

const captions = [];
let frame = 0;
let elapsed = 0;
const held = new Set();
async function hold(keys = []) {
  for (const key of [...held]) if (!keys.includes(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}

const wantStill = time => STILLS.some(still => time <= still && still < time + 1 / FPS);
for (const shot of SHOTS) {
  await hold(shot.keys);
  for (const key of shot.press ?? []) await page.keyboard.press(key);
  if (shot.click) {
    // Click through the DOM: the full-screen 3D view covers the page's buttons.
    const clicked = await page.evaluate(text => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent?.includes(text));
      button?.click();
      return Boolean(button);
    }, shot.click);
    if (!clicked) console.warn(`button not found: ${shot.click}`);
    await canvas.focus();
  }
  if (shot.caption) captions.push({ start: elapsed, end: elapsed + shot.seconds, text: shot.caption });
  const frames = Math.round(shot.seconds * FPS);
  let dragX = centre.x;
  if (shot.drag) { await page.mouse.move(dragX, centre.y); await page.mouse.down(); }
  for (let i = 0; i < frames; i++) {
    if (shot.drag) { dragX += shot.drag / FPS; await page.mouse.move(dragX, centre.y); }
    const ran = await step();
    if (ran === 0 && frame === 0) console.warn('no animation frame was waiting; is the render loop running?');
    if (mode === 'full') {
      frame++;
      await capture(join(outDir, 'frames', `${String(frame).padStart(5, '0')}.jpg`));
    } else if (wantStill(elapsed)) {
      await capture(join(outDir, `preview-${elapsed.toFixed(1)}s.jpg`));
    }
    elapsed += 1 / FPS;
  }
  if (shot.drag) await page.mouse.up();
  console.log(`shot done at ${elapsed.toFixed(1)}s: ${shot.caption}`);
}
await hold([]);
writeFileSync(join(outDir, 'captions.json'), JSON.stringify({ fps: FPS, width: WIDTH, height: HEIGHT, frames: frame, captions }, null, 2));
await browser.close();
