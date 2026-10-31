import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LoadAssetContainerAsync, NullEngine, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { resolveNpcBody, resolveNpcClips } from '../src/world/npcAnimationClips.mjs';

for (const model of ['human.glb', 'human-female.glb']) {
  test(`${model}: cloned neighborhood locomotion clips bind to the correct body`, async t => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    t.after(() => { scene.dispose(); engine.dispose(); });
    const bytes = readFileSync(new URL(`../public/models/${model}`, import.meta.url));
    const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, {
      pluginExtension: '.glb', pluginOptions: { gltf: { skipMaterials: true } },
    });
    t.after(() => container.dispose());
    const selection = resolveNpcBody(model, new Map([[model, container]]));
    assert.ok(selection, `${model} has valid Idle and Walk sources`);
    assert.equal(selection.model, model);
    const entries = container.instantiateModelsToScene(name => `npc test ${name}`, true);
    t.after(() => entries.dispose());
    const clips = resolveNpcClips(container.animationGroups, entries.animationGroups);
    assert.ok(clips, `${model} has cloned, bound Idle and Walk animations`);
    for (const name of ['Idle', 'Walk']) {
      const sourceIndex = container.animationGroups.findIndex(group => group.name === name);
      assert.ok(sourceIndex >= 0);
      assert.equal(clips[name.toLowerCase()], entries.animationGroups[sourceIndex]);
      assert.ok(clips[name.toLowerCase()].targetedAnimations.length > 0);
    }
    assert.notEqual(clips.idle, clips.walk);
  });
}
