import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { blendLocomotion, locomotionState, turnTowards } from '../src/world/locomotion.mjs';

const bytes = readFileSync(new URL('../public/models/human.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binary = bytes.subarray(28 + jsonLength);
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(index) {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  const component = { 5121: [1, 'readUInt8'], 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'] }[a.componentType];
  assert.ok(component, 'supported component type');
  const [size, read] = component;
  const width = widths[a.type], stride = v.byteStride ?? size * width;
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, c) =>
    binary[read]((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride + c * size)));
}

test('bundled character is complete, licensed, below budget and needs no external asset URLs', () => {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 2_000_000, 'keep the initial character under 2 MB');
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
  assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
  assert.equal(gltf.extras.license, 'CC0-1.0');
  const manifest = JSON.parse(readFileSync(new URL('../public/models/human.source.json', import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.output.sha256);
  for (const name of ['character-license.txt', 'animation-license.txt']) {
    assert.match(readFileSync(new URL(`../public/models/licenses/${name}`, import.meta.url), 'utf8'), /CC0 1\.0 Universal/);
  }
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    const positions = accessor(primitive.attributes.POSITION);
    const indices = accessor(primitive.indices).flat();
    triangles += indices.length / 3;
    assert.ok(indices.every(index => index < positions.length));
    assert.ok(positions.every(point => point.every(Number.isFinite)));
    const joints = accessor(primitive.attributes.JOINTS_0);
    const weights = accessor(primitive.attributes.WEIGHTS_0);
    assert.ok(joints.every(row => row.every(joint => joint < gltf.skins[0].joints.length)));
    assert.ok(weights.every(row => Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 0.001));
  }
  assert.ok(triangles > 10_000 && triangles < 30_000);
  const materials = gltf.materials.map(material => material.name);
  for (const name of ['Student skin', 'Student jacket', 'Student trousers', 'Student shoes', 'Student hair']) assert.ok(materials.includes(name));
});

test('all locomotion clips target the character rig and contain continuous normalized rotations', () => {
  assert.deepEqual(gltf.animations.map(clip => clip.name), ['Idle', 'Walk', 'Run']);
  const bones = new Set(gltf.skins[0].joints);
  for (const clip of gltf.animations) {
    assert.ok(clip.channels.length >= 65);
    for (const channel of clip.channels) {
      assert.ok(bones.has(channel.target.node));
      const sampler = clip.samplers[channel.sampler];
      const times = accessor(sampler.input).flat(), values = accessor(sampler.output);
      assert.equal(times.length, values.length);
      assert.ok(times.at(-1) > times[0]);
      assert.ok(times.every((time, i) => Number.isFinite(time) && (i === 0 || time > times[i - 1])));
      if (channel.target.path === 'rotation') {
        assert.ok(values.every(q => Math.abs(Math.hypot(...q) - 1) < 0.001));
        assert.ok(values.every((q, i) => i === 0 || q.reduce((dot, x, c) => dot + x * values[i - 1][c], 0) >= 0));
      }
      if (gltf.nodes[channel.target.node].name === 'root' && channel.target.path === 'translation') {
        assert.ok(values.every(v => Math.abs(v[0]) < 0.0001 && Math.abs(v[2]) < 0.0001), 'world movement must not also come from root animation');
      }
    }
  }
});

test('animation transitions are normalized and consistent at 30, 60 and 120 FPS', () => {
  const at = fps => {
    let weights = { idle: 1, walk: 0, run: 0 };
    for (let frame = 0; frame < fps / 4; frame++) weights = blendLocomotion(weights, 2.6, 1 / fps);
    return weights;
  };
  // Use a duration that is an integral number of frames at all three rates.
  const after = fps => {
    let weights = { idle: 1, walk: 0, run: 0 };
    for (let frame = 0; frame < fps / 2; frame++) weights = blendLocomotion(weights, 2.6, 1 / fps);
    return weights;
  };
  for (const fps of [30, 60, 120]) {
    const weights = after(fps);
    assert.ok(Math.abs(weights.walk - after(60).walk) < 1e-10);
    assert.ok(Math.abs(Object.values(weights).reduce((a, b) => a + b) - 1) < 1e-10);
  }
  let weights = at(60);
  for (const speed of [5.5, 0, 2.6, 5.5, 0]) {
    weights = blendLocomotion(weights, speed, 1 / 60);
    assert.ok(Object.values(weights).every(weight => weight >= 0 && weight <= 1));
    assert.ok(Math.abs(Object.values(weights).reduce((a, b) => a + b) - 1) < 1e-10);
  }
  assert.equal(locomotionState(0), 'idle');
  assert.equal(locomotionState(2.6), 'walk');
  assert.equal(locomotionState(5.5), 'run');
  assert.equal(locomotionState(NaN), 'idle');
  assert.deepEqual(blendLocomotion(weights, 0, NaN), weights);
});

test('turning crosses the angle wrap by the short route and has no overshoot', () => {
  const start = Math.PI - 0.02, target = -Math.PI + 0.02;
  const turned = turnTowards(start, target, 1 / 60);
  assert.ok(turned > start && turned < start + 0.04);
  assert.equal(turnTowards(0, Math.PI / 2, 0), 0);
  assert.ok(turnTowards(0, Math.PI / 2, 1) <= Math.PI / 2);
});

test('Babylon imports the actual asset and each locomotion clip changes the skeleton pose', async () => {
  const { NullEngine, Scene, LoadAssetContainerAsync } = await import('@babylonjs/core');
  await import('@babylonjs/loaders/glTF/index.js');
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, {
      pluginExtension: '.glb', pluginOptions: { gltf: { skipMaterials: true } },
    });
    assert.equal(container.skeletons[0].bones.length, 65);
    container.addAllToScene();
    for (const group of container.animationGroups) group.stop();
    for (const group of container.animationGroups) {
      group.start(true);
      group.setWeightForAllAnimatables(1);
      const target = group.targetedAnimations.find(item => item.target.name === 'thigh_l').target;
      group.goToFrame(0);
      const initial = target.rotationQuaternion.asArray();
      group.goToFrame(group.to * 0.35);
      const next = target.rotationQuaternion.asArray();
      assert.ok(next.some((value, i) => Math.abs(value - initial[i]) > 0.0001), `${group.name} must animate the leg`);
      group.stop();
    }
    container.dispose();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
