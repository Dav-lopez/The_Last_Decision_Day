import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine, Scene, LoadAssetContainerAsync } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';

// Only run this test after the build-character workflow has generated the
// candidate human.glb. The checked-in binary may intentionally lag the script.
test('generated facial morphs import into Babylon and can be animated', async () => {
  const bytes = readFileSync(new URL('../public/models/human.glb', import.meta.url));
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, {
      pluginExtension: '.glb',
      pluginOptions: { gltf: { skipMaterials: true } },
    });
    try {
      const targets = container.meshes.flatMap(mesh => {
        const manager = mesh.morphTargetManager;
        return manager ? Array.from({ length: manager.numTargets }, (_, i) => manager.getTarget(i)) : [];
      });
      const names = new Set(targets.map(target => target.name));
      const required = [
        'eyeBlinkLeft', 'eyeBlinkRight', 'browInnerUp',
        'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft',
        'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight',
        'jawOpen', 'mouthOpen',
      ];
      for (const name of required) assert.ok(names.has(name), 'Babylon lost morph ' + name);
      for (const name of required) {
        const target = targets.find(item => item.name === name);
        target.influence = 0.5;
        assert.equal(target.influence, 0.5, name + ' must be writable');
        target.influence = 0;
      }
      assert.ok(container.skeletons.some(skeleton => skeleton.bones.length >= 60));
      assert.deepEqual(container.animationGroups.map(group => group.name).sort(), ['Idle', 'Run', 'Walk']);
    } finally {
      container.dispose();
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
