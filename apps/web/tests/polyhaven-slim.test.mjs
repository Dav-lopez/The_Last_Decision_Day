import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Checks the output of scripts/slim_props.py without Babylon: the files stay valid glTF
// (KHR_mesh_quantization layouts, aligned views), and the porch plant stays light.
const MODELS = new URL('../public/models/polyhaven/', import.meta.url);
const shipped = existsSync(new URL('manifest.json', MODELS));
const BYTE = 5120, SHORT = 5122, USHORT = 5123, UINT = 5125;
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readGlb(bytes) {
  assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'header length matches the file');
  const jsonLength = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binLength = bytes.readUInt32LE(20 + jsonLength);
  const bin = bytes.subarray(28 + jsonLength, 28 + jsonLength + binLength);
  return { doc, bin };
}

function webpSize(data) {
  assert.equal(data.subarray(0, 4).toString(), 'RIFF');
  const kind = data.subarray(12, 16).toString();
  if (kind === 'VP8X') return [1 + data.readUIntLE(24, 3), 1 + data.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
}

function triangles(doc) {
  return doc.meshes.flatMap(mesh => mesh.primitives).reduce((sum, prim) => sum + doc.accessors[prim.indices].count / 3, 0);
}

const manifest = shipped ? JSON.parse(readFileSync(new URL('manifest.json', MODELS), 'utf8')) : { assets: [] };

test('slimmed props are valid quantized glTF with 8-bit normals', { skip: !shipped }, () => {
  for (const asset of manifest.assets) {
    const { doc, bin } = readGlb(readFileSync(new URL(asset.file, MODELS)));
    assert.ok(doc.extensionsUsed.includes('KHR_mesh_quantization'), `${asset.file} declares quantization`);
    assert.ok(doc.asset.extras?.slimProps, `${asset.file} went through scripts/slim_props.py`);
    for (const view of doc.bufferViews) {
      assert.equal(view.byteOffset % 4, 0, `${asset.file}: views start 4-byte aligned`);
      assert.ok(view.byteOffset + view.byteLength <= bin.length, `${asset.file}: view inside the buffer`);
      if (view.byteStride) assert.equal(view.byteStride % 4, 0);
    }
    for (const prim of doc.meshes.flatMap(mesh => mesh.primitives)) {
      const position = doc.accessors[prim.attributes.POSITION];
      const normal = doc.accessors[prim.attributes.NORMAL];
      assert.equal(position.componentType, SHORT);
      assert.equal(position.min.length, 3, 'POSITION keeps its bounds');
      assert.equal(normal.componentType, BYTE, `${asset.file}: normals packed to 8 bits`);
      assert.equal(normal.normalized, true);
      for (const accessor of Object.values(prim.attributes).map(index => doc.accessors[index])) {
        const view = doc.bufferViews[accessor.bufferView];
        const stride = view.byteStride ?? SIZE[accessor.componentType] * WIDTH[accessor.type];
        assert.ok(stride * (accessor.count - 1) + SIZE[accessor.componentType] * WIDTH[accessor.type] <= view.byteLength);
        assert.equal(accessor.count, position.count, 'attributes share one vertex count');
      }
      const indices = doc.accessors[prim.indices];
      assert.ok([USHORT, UINT].includes(indices.componentType));
      const view = doc.bufferViews[indices.bufferView];
      const read = indices.componentType === USHORT ? (i) => bin.readUInt16LE(view.byteOffset + 2 * i) : (i) => bin.readUInt32LE(view.byteOffset + 4 * i);
      let highest = 0;
      for (let i = 0; i < indices.count; i++) highest = Math.max(highest, read(i));
      assert.ok(highest < position.count, `${asset.file}: indices stay inside the vertex range`);
    }
  }
});

test('the porch plant is simplified and its textures cut for a small street prop', { skip: !shipped }, () => {
  const plant = manifest.assets.find(asset => asset.slot === 'plant');
  const { doc, bin } = readGlb(readFileSync(new URL(plant.file, MODELS)));
  assert.ok(plant.bytes <= 900_000, `plant.glb is ${plant.bytes} bytes (was 1.68 MB before slimming)`);
  const count = triangles(doc);
  assert.ok(count <= 40_000 && count >= 15_000, `plant has ${count} triangles (was 69,345)`);
  for (const image of doc.images) {
    const view = doc.bufferViews[image.bufferView];
    const [width, height] = webpSize(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength));
    assert.ok(Math.max(width, height) <= 512 && Math.min(width, height) >= 256, `plant texture ${width}×${height}`);
  }
});
