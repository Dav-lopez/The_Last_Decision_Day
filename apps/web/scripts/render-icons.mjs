// Renders the PNG icons and the link-share image from public/icon.svg with the headless browser.
//   node scripts/render-icons.mjs   (needs playwright; the results are committed to public/)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');

const icon = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const iconUrl = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, rounded] of [['icon-192.png', 192, true], ['icon-512.png', 512, true], ['apple-touch-icon.png', 180, false]]) {
  await page.setViewportSize({ width: size, height: size });
  // iOS rounds the corners itself, so its icon is a full square.
  const svg = rounded ? icon : icon.replace('<g clip-path="url(#tile)">', '<g>');
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: true });
}
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Inter,"DejaVu Sans",system-ui,sans-serif}
  body{background:linear-gradient(180deg,#14284a 0%,#33406a 38%,#c26a4a 70%,#f2b46c 100%);display:flex;align-items:center;gap:64px;padding:0 90px;box-sizing:border-box;color:#fff}
  img{width:300px;height:300px;filter:drop-shadow(0 18px 40px #0007)}
  h1{font-size:76px;line-height:1.02;margin:0 0 22px;letter-spacing:.01em;text-shadow:0 4px 18px #0006}
  p{font-size:31px;margin:0;color:#fff2dc;text-shadow:0 2px 10px #0006}
  small{display:block;margin-top:34px;font-size:22px;color:#ffe9c8;opacity:.9}
</style><img src="${iconUrl}"><div><h1>The Last<br>Decision Day</h1><p>Your life. Your choices.<br>Your consequences.</p><small>Free in your browser · school, careers, football</small></div>`);
await page.screenshot({ path: new URL('../public/share.png', import.meta.url).pathname });
await browser.close();
console.log('icons and share image rendered');
