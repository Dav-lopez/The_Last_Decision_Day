import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gltf = JSON.parse(readFileSync(new URL('../public/models/human.gltf', import.meta.url), 'utf8'));
const buffer = Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64');

test('all embedded buffer views remain within the glTF buffer', () => {
  assert.equal(buffer.byteLength, gltf.buffers[0].byteLength);
  for (const view of gltf.bufferViews) assert.ok(view.byteOffset + view.byteLength <= buffer.byteLength);
});

test('skinned POSITION accessor bounds match actual vertices for correct frustum culling', () => {
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const view = gltf.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  assert.equal(accessor.type, 'VEC3');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < accessor.count; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = buffer.readFloatLE((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 12 + axis * 4);
      assert.ok(Number.isFinite(value));
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(min[axis] - accessor.min[axis]) < 1e-6);
    assert.ok(Math.abs(max[axis] - accessor.max[axis]) < 1e-6);
  }
});

test('mesh index accessors reference only existing vertices', () => {
  const mesh = gltf.meshes[0];
  const count = gltf.accessors[mesh.primitives[0].attributes.POSITION].count;
  for (const primitive of mesh.primitives) {
    const accessor = gltf.accessors[primitive.indices];
    const view = gltf.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5123);
    for (let i = 0; i < accessor.count; i++) {
      const index = buffer.readUInt16LE((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 2);
      assert.ok(index < count, `index ${index} exceeds ${count}`);
    }
  }
});
