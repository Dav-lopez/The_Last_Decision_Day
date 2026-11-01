import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The action clips store rotations as normalized 16-bit integers (scripts/slim_clips.py);
// Babylon must decode them back to unit quaternions, or every action would twist the body.
test('Babylon imports the slimmed action clips as unit-quaternion keyframes', async () => {
  const { NullEngine, Scene, LoadAssetContainerAsync, Quaternion } = await import('@babylonjs/core');
  await import('@babylonjs/loaders/glTF/index.js');
  for (const file of ['human-actions.glb', 'human-female-actions.glb']) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const bytes = readFileSync(new URL(`../public/models/${file}`, import.meta.url));
      const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, { pluginExtension: '.glb' });
      try {
        const names = container.animationGroups.map(group => group.name);
        for (const clip of ['Talk', 'Sit', 'Drive', 'Dance', 'JumpAir']) assert.ok(names.includes(clip), `${file}: ${clip}`);
        let rotations = 0;
        let moving = 0;
        for (const group of container.animationGroups) {
          assert.ok(group.targetedAnimations.length >= 50, `${file} ${group.name}`);
          for (const { animation } of group.targetedAnimations) {
            const keys = animation.getKeys();
            if (!(keys[0].value instanceof Quaternion)) continue;
            for (const key of keys) {
              rotations++;
              assert.ok(Math.abs(key.value.length() - 1) < 2e-3, `${file} ${group.name} ${animation.name}: |q| = ${key.value.length()}`);
            }
            if (keys.length > 2) moving++;
          }
        }
        assert.ok(rotations > 1000, `${file}: ${rotations} rotation keys`);
        assert.ok(moving > 100, `${file}: clips still move (${moving} animated bones)`);
      } finally {
        container.dispose();
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }
});
