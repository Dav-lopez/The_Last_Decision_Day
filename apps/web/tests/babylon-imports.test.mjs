import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// Importing from the '@babylonjs/core' barrel bundles the whole engine. Game code takes each class from its
// own module instead: TypeScript through src/babylon.ts, .mjs modules (which Node's tests also load) by deep path.
const root = new URL('../src/', import.meta.url);
const files = (await readdir(root, { recursive: true })).filter(name => /\.(ts|tsx|mjs)$/.test(name) && !name.endsWith('.d.mts'));

test('no game module imports the whole Babylon.js engine', async () => {
  assert.ok(files.length > 100, 'the source tree was read');
  for (const name of files) {
    const source = await readFile(new URL(name, root), 'utf8');
    assert.doesNotMatch(source, /from '@babylonjs\/core'|import\('@babylonjs\/core'\)/, `${name} imports the '@babylonjs/core' barrel`);
    if (name !== 'babylon.ts' && !name.endsWith('.mjs')) {
      assert.doesNotMatch(source, /from '@babylonjs\/core\//, `${name} should import Babylon.js classes from src/babylon.ts`);
    }
  }
});

test('the .mjs modules resolve their deep Babylon.js imports in Node', async () => {
  const { Quaternion } = await import('@babylonjs/core/Maths/math.vector.js');
  assert.equal(typeof Quaternion.Identity, 'function');
  for (const module of ['npcHeadRig', 'emotionalHeadRig', 'streetCars', 'streetLighting', 'npcFacialMaterials']) {
    assert.ok(Object.keys(await import(`../src/world/${module}.mjs`)).length > 0, module);
  }
});
