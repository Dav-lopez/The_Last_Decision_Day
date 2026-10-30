import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const MODELS = new URL('../public/models/polyhaven/', import.meta.url);
const shipped = existsSync(new URL('manifest.json', MODELS));

// Runs in the model-proposal workflow and in CI once the models are committed.
test('every Poly Haven model imports into Babylon with renderable geometry', { skip: !shipped }, async () => {
  const { NullEngine, Scene, LoadAssetContainerAsync } = await import('@babylonjs/core');
  await import('@babylonjs/loaders/glTF/index.js');
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', MODELS), 'utf8'));
  for (const asset of manifest.assets) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const bytes = readFileSync(new URL(asset.file, MODELS));
      const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, {
        pluginExtension: '.glb',
        pluginOptions: { gltf: { skipMaterials: true } },
      });
      try {
        assert.ok(container.meshes.some(mesh => mesh.getTotalVertices() > 0), `${asset.id} has no vertices`);
      } finally {
        container.dispose();
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }
});
