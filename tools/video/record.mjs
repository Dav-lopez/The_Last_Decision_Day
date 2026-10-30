// Films a scripted tour of the real game as a guest, one frame at a time.
// The page clock is frozen and advanced exactly 1/30 s per frame, so the video
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
  { seconds: 4, caption: 'The Last Decision — a life in one neighborhood', press: ['c'], drag: 70 },
  { seconds: 3, caption: 'Morning on your street', press: ['c'], drag: -40 },
  { seconds: 4, caption: 'Walk anywhere — neighbors keep to their side', keys: ['w'] },
  { seconds: 3, caption: '', keys: ['a', 'w'] },
  { seconds: 3, caption: 'Hold Shift to run', keys: ['d', 'w', 'Shift'] },
  { seconds: 2.5, caption: 'Back to the parked car', keys: ['s', 'd'] },
  { seconds: 1.5, caption: 'Press E to get in', keys: ['s'], press: ['e'] },
  { seconds: 0.5, caption: 'Press E to get in', press: ['e'] },
  { seconds: 4, caption: 'Drive: W gas · S brake · A/D steer', keys: ['w'] },
  { seconds: 2, caption: '', keys: ['w', 'a'] },
  { seconds: 2, caption: 'Stop, then E to get out', keys: ['s'] },
  { seconds: 1.5, caption: 'Stop, then E to get out', press: ['e'] },
  { seconds: 4.5, caption: 'Street lamps come on at dusk', click: 'Switch lighting', press: ['c'], drag: 55 },
  { seconds: 3, caption: 'Your day is saved — see you tomorrow', drag: 35 },
];
const STILLS = [1.5, 8, 13, 19, 24, 33];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
page.on('pageerror', error => console.error('page error:', error.message));
// No backend in this recording: answer the account checks as a signed-out guest.
await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
// Load in real time (React and Suspense need timers); the clock is frozen only once the world is ready.
await page.goto(url);
await page.getByRole('button', { name: /Try the 3D demo/ }).click({ timeout: 60000 });

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
await page.clock.install();
await page.clock.pauseAt(Date.now() + 1000);

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
    const button = page.getByRole('button', { name: new RegExp(shot.click) });
    if (await button.count()) await button.first().click();
    await canvas.focus();
  }
  if (shot.caption) captions.push({ start: elapsed, end: elapsed + shot.seconds, text: shot.caption });
  const frames = Math.round(shot.seconds * FPS);
  let dragX = centre.x;
  if (shot.drag) { await page.mouse.move(dragX, centre.y); await page.mouse.down(); }
  for (let i = 0; i < frames; i++) {
    if (shot.drag) { dragX += shot.drag / FPS; await page.mouse.move(dragX, centre.y); }
    await page.clock.runFor(1000 / FPS);
    if (mode === 'full') {
      frame++;
      await page.screenshot({ path: join(outDir, 'frames', `${String(frame).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    } else if (wantStill(elapsed)) {
      await page.screenshot({ path: join(outDir, `preview-${elapsed.toFixed(1)}s.jpg`), type: 'jpeg', quality: 92 });
    }
    elapsed += 1 / FPS;
  }
  if (shot.drag) await page.mouse.up();
  console.log(`shot done at ${elapsed.toFixed(1)}s: ${shot.caption}`);
}
await hold([]);
writeFileSync(join(outDir, 'captions.json'), JSON.stringify({ fps: FPS, width: WIDTH, height: HEIGHT, frames: frame, captions }, null, 2));
await browser.close();
