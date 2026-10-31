import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkBudget, chunkName, firstPageChunks } from '../scripts/bundleBudget.mjs';

const budget = { chunksKB: { index: 10, babylon: 100 }, otherChunkKB: 5, totalJsKB: 120, cssKB: 4, largestAssetKB: 50, firstPageMustNotLoad: ['babylon'] };
const KB = 1024;

test('chunk names drop the Vite hash, including hashes with - and _', () => {
  assert.equal(chunkName('assets/index-AbC_12xY.js'), 'index');
  assert.equal(chunkName('assets/babylon-loaders-x-Y_zz12.js'), 'babylon-loaders');
  assert.equal(chunkName('assets/WorldScene-Dk3e9fQa.css'), 'WorldScene');
  assert.equal(chunkName('plain.js'), 'plain');
});

test('the start page chunks come from script and modulepreload tags', () => {
  const html = '<script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script><link rel="modulepreload" crossorigin href="/assets/react-BBBBBBBB.js"><link rel="stylesheet" href="/assets/index-CCCCCCCC.css">';
  assert.deepEqual(firstPageChunks(html), ['index', 'react']);
});

test('a build within budget passes and rows are sorted largest first', () => {
  const result = checkBudget({
    js: [{ file: 'assets/index-AAAAAAAA.js', gzip: 8 * KB }, { file: 'assets/babylon-BBBBBBBB.js', gzip: 90 * KB }],
    css: [{ file: 'assets/index-CCCCCCCC.css', gzip: 2 * KB }],
    assets: [{ file: 'models/human.glb', bytes: 40 * KB }],
    html: '<script src="/assets/index-AAAAAAAA.js"></script>',
  }, budget);
  assert.equal(result.ok, true, result.failures.join('; '));
  assert.deepEqual(result.rows.map(row => row.name), ['babylon', 'index']);
});

test('each kind of overrun is reported', () => {
  const result = checkBudget({
    js: [{ file: 'assets/index-AAAAAAAA.js', gzip: 11 * KB }, { file: 'assets/babylon-BBBBBBBB.js', gzip: 100 * KB }, { file: 'assets/Map-DDDDDDDD.js', gzip: 6 * KB }, { file: 'assets/Extra-EEEEEEEE.js', gzip: 4 * KB }],
    css: [{ file: 'a.css', gzip: 5 * KB }],
    assets: [{ file: 'models/huge.glb', bytes: 60 * KB }, { file: 'models/small.glb', bytes: KB }],
    html: '<script src="/assets/index-AAAAAAAA.js"></script><link rel="modulepreload" href="/assets/babylon-BBBBBBBB.js">',
  }, budget);
  assert.equal(result.ok, false);
  const text = result.failures.join('\n');
  assert.match(text, /index is 11\.0 KB/);
  assert.match(text, /Map is 6\.0 KB gzipped, over its 5 KB budget/);
  assert.doesNotMatch(text, /babylon is/, 'exactly at budget passes');
  assert.match(text, /all JavaScript/);
  assert.match(text, /CSS is/);
  assert.match(text, /models\/huge\.glb/);
  assert.match(text, /start page preloads "babylon"/);
});

test('the committed budget file is complete', async () => {
  const committed = JSON.parse(await readFile(new URL('../bundle-budget.json', import.meta.url), 'utf8'));
  for (const key of ['chunksKB', 'otherChunkKB', 'totalJsKB', 'largestAssetKB']) assert.ok(key in committed, key);
  assert.ok(Object.values(committed.chunksKB).every(value => typeof value === 'number' && value > 0));
});
