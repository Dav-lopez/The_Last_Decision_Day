import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Merges that resolve package.json conflicts can silently drop a test file from every script; then CI never
// runs it again. Every tests/*.test.mjs must be named by an npm script or by the CI workflow.
test('every test file runs in CI', async () => {
  const scripts = Object.values(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).scripts).join(' ');
  const workflow = await readFile(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const files = (await readdir(new URL('.', import.meta.url))).filter(name => name.endsWith('.test.mjs'));
  const orphaned = files.filter(name => !scripts.includes(`tests/${name}`) && !workflow.includes(`tests/${name}`));
  assert.deepEqual(orphaned, [], 'add these to an npm test script (package.json) or to .github/workflows/ci.yml');
});
