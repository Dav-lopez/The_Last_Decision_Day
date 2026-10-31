import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { planarSkinUV, skinMicroNormalMap } from '../src/world/skinMicroNormalMap.mjs';

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

test('procedural skin normal tile is deterministic, bounded and nonflat', () => {
  const a = skinMicroNormalMap(), b = skinMicroNormalMap();
  assert.deepEqual(a, b);
  assert.equal(a.length, 64 * 64 * 4);
  const directions = new Set();
  for (let i = 0; i < a.length; i += 4) {
    assert.equal(a[i + 3], 255);
    assert.ok(a[i + 2] >= 250, 'microdetail must not distort facial geometry');
    const normal = [a[i], a[i + 1], a[i + 2]].map(value => value / 127.5 - 1);
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 0.016);
    directions.add(`${a[i]},${a[i + 1]}`);
  }
  assert.ok(directions.size > 20, 'tile needs genuine pore-scale variation');
});

test('skin pore normals repeat continuously without hard tile seams', () => {
  const size = 64, bytes = skinMicroNormalMap(size);
  const normal = (x, y) => [...bytes.slice((y * size + x) * 4, (y * size + x) * 4 + 3)];
  for (let i = 0; i < size; i++) {
    for (const [first, last] of [[normal(0, i), normal(size - 1, i)], [normal(i, 0), normal(i, size - 1)]]) {
      assert.ok(Math.abs(first[0] - last[0]) <= 12);
      assert.ok(Math.abs(first[1] - last[1]) <= 12);
    }
  }
});

test('normal tile rejects excessive sizes and supports power-of-two resolutions', () => {
  for (const size of [0, 15, 17, 512, NaN, Infinity, 64.5]) assert.throws(() => skinMicroNormalMap(size), RangeError);
  for (const size of [16, 32, 128, 256]) assert.equal(skinMicroNormalMap(size).length, size * size * 4);
});

test('Babylon NullEngine accepts the generated normal tile as a PBR bump texture', async () => {
  const { NullEngine, Scene, RawTexture, Texture, PBRMaterial } = await import('@babylonjs/core');
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const texture = RawTexture.CreateRGBATexture(skinMicroNormalMap(), 64, 64, scene,
      true, false, Texture.TRILINEAR_SAMPLINGMODE);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.uScale = 5;
    texture.vScale = 5;
    texture.level = 0.24;
    const skin = new PBRMaterial('Student skin', scene);
    skin.bumpTexture = texture;
    assert.equal(skin.bumpTexture, texture);
    assert.deepEqual(texture.getSize(), { width: 64, height: 64 });
    assert.equal(texture.wrapU, Texture.WRAP_ADDRESSMODE);
    assert.equal(texture.wrapV, Texture.WRAP_ADDRESSMODE);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test('legacy body rest positions generate finite repeatable UVs without changing positions', () => {
  const positions = new Float32Array([-0.2, 1.6, 0.3, 0.2, 1.6, 0.3, 0, 1.8, -0.2]);
  const original = [...positions];
  const uv = planarSkinUV(positions);
  assert.ok(uv instanceof Float32Array);
  assert.deepEqual([...uv], [...planarSkinUV(positions)]);
  assert.equal(uv.length, 6);
  assert.ok(uv.every(Number.isFinite));
  assert.notEqual(uv[0], uv[2], 'horizontal skin positions must not collapse to one UV');
  assert.notEqual(uv[1], uv[5], 'vertical skin positions must not collapse to one UV');
  assert.deepEqual([...positions], original, 'skinning and morph source positions remain unchanged');
  for (const invalid of [null, [], [1, 2], [NaN, 1, 2], [0, Infinity, 0]]) {
    assert.equal(planarSkinUV(invalid), null);
  }
});
