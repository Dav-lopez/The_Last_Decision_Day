import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine, Scene, LoadAssetContainerAsync, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';

// This checks the shipped binary as well as workflow-generated candidates.
test('shipped facial morphs import into Babylon with actual deformations and head skinning', async () => {
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
        'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'eyeWideRight',
        'eyeSquintLeft', 'eyeSquintRight', 'browInnerUp', 'browDownLeft', 'browDownRight',
        'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft',
        'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight',
        'jawOpen', 'mouthOpen',
      ];
      for (const name of required) assert.ok(names.has(name), 'Babylon lost morph ' + name);
      for (const name of required) {
        const target = targets.find(item => item.name === name);
        const mesh = container.meshes.find(item => {
          const manager = item.morphTargetManager;
          return manager && Array.from({ length: manager.numTargets }, (_, i) => manager.getTarget(i)).includes(target);
        });
        const base = mesh.getVerticesData(VertexBuffer.PositionKind);
        const positions = target.getPositions();
        assert.equal(positions.length, base.length, name + ' must deform the same vertex layout');
        let displacement = 0;
        for (let i=0; i<base.length; i++) {
          assert.ok(Number.isFinite(positions[i]));
          displacement = Math.max(displacement, Math.abs(positions[i] - base[i]));
        }
        assert.ok(displacement > 0.0001, name + ' needs real vertex motion');
        assert.ok(displacement < 0.04, name + ' must stay within the authored face displacement budget');
        target.influence = 0.5;
        assert.equal(target.influence, 0.5, name + ' must be writable');
        target.influence = 0;
      }
      assert.ok(container.skeletons.some(skeleton => skeleton.bones.length >= 60));
      const lips = container.meshes.find(mesh => mesh.name === 'Student lip surface');
      assert.ok(lips, 'the actual lip mesh must be shipped');
      const head = container.skeletons[0].bones.findIndex(bone => bone.name === 'Head');
      assert.ok(head >= 0);
      const joints = lips.getVerticesData(VertexBuffer.MatricesIndicesKind);
      const weights = lips.getVerticesData(VertexBuffer.MatricesWeightsKind);
      for (let i=0; i<joints.length; i+=4) {
        assert.equal(joints[i], head, 'lips follow the same Head joint as the face');
        assert.equal(weights[i], 1);
      }
      assert.deepEqual(container.animationGroups.map(group => group.name).sort(), ['Idle', 'Run', 'Walk']);
    } finally {
      container.dispose();
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
