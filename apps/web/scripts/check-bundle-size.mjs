/**
 * Fails CI when the web build grows past bundle-budget.json.
 *   node scripts/check-bundle-size.mjs [dist] [bundle-budget.json]
 */
import { readFile, readdir, stat, appendFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { checkBudget, formatKB } from './bundleBudget.mjs';

const dist = process.argv[2] ?? 'dist';
const budget = JSON.parse(await readFile(process.argv[3] ?? 'bundle-budget.json', 'utf8'));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path);
  }
  return out;
}

const files = await walk(dist);
const js = []; const css = []; const assets = [];
for (const path of files) {
  const file = relative(dist, path);
  if (/\.(?:js|css)$/.test(file)) {
    const gzip = gzipSync(await readFile(path), { level: 9 }).length;
    (file.endsWith('.js') ? js : css).push({ file, gzip });
  } else if (/\.(?:glb|gltf|bin|png|jpe?g|webp|ktx2|json|mp3|ogg|wav)$/i.test(file)) {
    assets.push({ file, bytes: (await stat(path)).size });
  }
}
const html = await readFile(join(dist, 'index.html'), 'utf8').catch(() => undefined);
const result = checkBudget({ js, css, assets, html }, budget);

const lines = ['| Chunk | Gzipped | Budget |', '| --- | ---: | ---: |',
  ...result.rows.map(row => `| ${row.ok ? '' : '❌ '}${row.name} | ${formatKB(row.gzip)} | ${row.limitKB} KB |`),
  `| **All JavaScript** | **${formatKB(result.totalJs)}** | ${budget.totalJsKB} KB |`,
  `| CSS | ${formatKB(result.totalCss)} | ${budget.cssKB ?? '–'} KB |`,
  `| Largest asset${result.largest ? ` (${result.largest.file})` : ''} | ${result.largest ? formatKB(result.largest.bytes) : '–'} (raw) | ${budget.largestAssetKB} KB |`];
console.log(lines.join('\n'));
console.log(`Start page loads: ${result.firstPage.join(', ') || '(nothing)'}`);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Bundle size\n\n${lines.join('\n')}\n`);
// Annotations make the sizes readable on the PR's checks page.
console.log(`::notice title=Bundle size::${result.rows.map(row => `${row.name} ${formatKB(row.gzip)}`).join(' · ')} · total JS ${formatKB(result.totalJs)} · CSS ${formatKB(result.totalCss)} · start page loads: ${result.firstPage.join(', ') || 'nothing'}`);
for (const failure of result.failures) console.log(`::error title=Bundle size::${failure}`);
process.exit(result.ok ? 0 : 1);
