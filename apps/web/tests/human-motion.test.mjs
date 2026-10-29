import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyHumanMotion, blendHumanWeights, smoothHumanHeading, HUMAN_CROSSFADE_SECONDS } from '../src/world/humanMotion.mjs';

test('idle/walk/run use actual movement speed', () => {
  assert.equal(classifyHumanMotion(0), 'idle');
  assert.equal(classifyHumanMotion(Number.NaN), 'idle');
  assert.equal(classifyHumanMotion(4), 'walk');
  assert.equal(classifyHumanMotion(6), 'run');
});

test('crossfade conserves weights, reaches target after 200ms, supports interruption', () => {
  const from = { idle: 1, walk: 0, run: 0 };
  const halfway = blendHumanWeights(from, 'walk', HUMAN_CROSSFADE_SECONDS / 2);
  assert.deepEqual(halfway, { idle: 0.5, walk: 0.5, run: 0 });
  assert.deepEqual(blendHumanWeights(from, 'walk', HUMAN_CROSSFADE_SECONDS), { idle: 0, walk: 1, run: 0 });
  const interrupted = blendHumanWeights(halfway, 'run', HUMAN_CROSSFADE_SECONDS / 2);
  assert.deepEqual(interrupted, { idle: 0.25, walk: 0.25, run: 0.5 });
  assert.equal(Object.values(interrupted).reduce((a,b) => a+b,0), 1);
});

test('turn takes shortest angle across wrap seam', () => {
  const a = smoothHumanHeading(Math.PI - 0.03, -Math.PI + 0.03, 0.016);
  assert.ok(a > Math.PI - 0.03 && a < Math.PI + 0.03);
});

test('bundled glTF is skinned, self-contained, animated and named for customization', () => {
  const model = JSON.parse(readFileSync(new URL('../public/models/human.gltf', import.meta.url), 'utf8'));
  assert.equal(model.asset.version, '2.0');
  assert.equal(model.skins.length, 1);
  assert.ok(model.skins[0].joints.length >= 12);
  assert.deepEqual(model.animations.map(x => x.name).sort(), ['Idle','Run','Walk']);
  assert.ok(model.meshes[0].primitives.every(x => 'JOINTS_0' in x.attributes && 'WEIGHTS_0' in x.attributes));
  assert.ok(model.materials.some(x => x.name === 'HumanSkin'));
  assert.ok(model.materials.some(x => x.name === 'HumanHair'));
  assert.ok(model.materials.some(x => x.name === 'HumanOutfit'));
  const [prefix, payload] = model.buffers[0].uri.split(',');
  assert.equal(prefix, 'data:application/octet-stream;base64');
  assert.equal(Buffer.from(payload, 'base64').length, model.buffers[0].byteLength);
  for (const accessor of model.accessors) assert.ok(accessor.bufferView < model.bufferViews.length);
});
