import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Checks the output of scripts/slim_character.py without Babylon: outfit and hair weights and normals are
// 8-bit, every vertex's weights still sum to exactly one, the face keeps its float data, and both bodies
// stay well under their old 1.6 MB.
const BYTE = 5120, UBYTE = 5121, FLOAT = 5126;
const FACE = /^Student (eyes|eyebrows|expressive|oral|upper teeth|lower teeth|tongue|sculpted|eyebrow fibres|nasolabial|eyelid|corneal|tear|sweat)/;

function readGlb(name) {
  const bytes = readFileSync(new URL(`../public/models/${name}`, import.meta.url));
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = bytes.subarray(28 + jsonLength, 28 + jsonLength + bytes.readUInt32LE(20 + jsonLength));
  return { bytes, doc, bin };
}

for (const name of ['human.glb', 'human-female.glb']) {
  test(`${name}: outfit and hair are packed to 8 bits, the face is untouched`, () => {
    const { bytes, doc, bin } = readGlb(name);
    assert.ok(bytes.length < 1_350_000, `${name} is ${bytes.length} bytes`);
    assert.ok(doc.extensionsUsed.includes('KHR_mesh_quantization'));
    assert.ok(doc.extensionsRequired.includes('KHR_mesh_quantization'));
    for (const view of doc.bufferViews) {
      assert.equal(view.byteOffset % 4, 0, 'views start 4-byte aligned');
      assert.ok(view.byteOffset + view.byteLength <= bin.length, 'view inside the buffer');
    }
    let packed = 0;
    for (const mesh of doc.meshes) {
      const face = FACE.test(mesh.name) || mesh.primitives.some(prim => prim.targets?.length);
      for (const prim of mesh.primitives) {
        const weights = doc.accessors[prim.attributes.WEIGHTS_0];
        const normals = doc.accessors[prim.attributes.NORMAL];
        if (face) {
          assert.equal(weights.componentType, FLOAT, `${mesh.name} keeps float weights`);
          assert.equal(normals.componentType, FLOAT, `${mesh.name} keeps float normals`);
          continue;
        }
        packed++;
        assert.equal(weights.componentType, UBYTE);
        assert.equal(weights.normalized, true);
        const wv = doc.bufferViews[weights.bufferView];
        for (let i = 0; i < weights.count; i++) {
          const at = wv.byteOffset + i * 4;
          assert.equal(bin[at] + bin[at + 1] + bin[at + 2] + bin[at + 3], 255, `${mesh.name} vertex ${i} weights sum to 1`);
        }
        assert.equal(normals.componentType, BYTE);
        assert.equal(normals.normalized, true);
        const nv = doc.bufferViews[normals.bufferView];
        assert.equal(nv.byteStride, 4, 'BYTE VEC3 normals padded to a 4-byte stride');
        for (let i = 0; i < normals.count; i++) {
          const at = nv.byteOffset + i * 4;
          const length = Math.hypot(bin.readInt8(at), bin.readInt8(at + 1), bin.readInt8(at + 2)) / 127;
          assert.ok(Math.abs(length - 1) < 0.02, `${mesh.name} normal ${i} is unit length (${length})`);
        }
      }
    }
    assert.ok(packed >= 20, 'outfit zones, hairstyles and detail overlays are packed');
  });
}
