import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine, Scene, LoadAssetContainerAsync, PBRMaterial, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { NEIGHBORS } from '../src/world/npcLayout.mjs';
import { HUMAN_HEIGHT, normalizeRiggedVisual } from '../src/world/riggedPresentation.mjs';
import { findNpcLocomotionIndices, selectNpcAnimationModel } from '../src/world/npcAnimationSelection.mjs';

// Checks the assumptions npcPeople.ts makes about copying the shipped human model.
test('each neighbour is an independent copy of the human with its own clips and materials', async t => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  const bytes = readFileSync(new URL('../public/models/human.glb', import.meta.url));
  const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, { pluginExtension: '.glb' });
  const names = container.animationGroups.map(group => group.name);
  const idleIndex = names.indexOf('Idle');
  const walkIndex = names.indexOf('Walk');
  assert.ok(idleIndex >= 0 && walkIndex >= 0);

  const copies = NEIGHBORS.slice(0, 2).map(npc => {
    const entries = container.instantiateModelsToScene(name => `npc ${npc.id} ${name}`, true);
    const visual = new TransformNode(`npc ${npc.id} visual`, scene);
    for (const node of entries.rootNodes) node.parent = visual;
    normalizeRiggedVisual(visual);
    return { entries, visual };
  });
  for (const { entries, visual } of copies) {
    // Clips are copied in the container's order, so the indices pick Idle and Walk.
    assert.equal(entries.animationGroups.length, names.length);
    assert.ok(entries.animationGroups[idleIndex].targetedAnimations.length > 0);
    assert.ok(entries.animationGroups[walkIndex].targetedAnimations.length > 0);
    const { min, max } = visual.getHierarchyBoundingVectors(true);
    assert.ok(Math.abs(max.y - min.y - HUMAN_HEIGHT) < 1e-4, 'neighbours are the same adult height as the player');
    assert.ok(Math.abs(min.y) < 1e-4, 'feet on the ground');
  }
  // Cloned materials keep a recognisable name and are not shared between people.
  const skinOf = ({ visual }) => [...new Set(visual.getChildMeshes().map(mesh => mesh.material))]
    .find(material => material instanceof PBRMaterial && material.name.endsWith('Student skin'));
  const [first, second] = copies.map(skinOf);
  assert.ok(first && second, 'skin material found on each copy');
  assert.notEqual(first, second, 'recolouring one neighbour does not recolour the others');
  // Babylon must clone the morph targets as well as the mesh and material.
  // Otherwise one resident blinking would animate every other resident.
  const blinkOf = ({ visual }) => visual.getChildMeshes().flatMap(mesh => {
    const manager = mesh.morphTargetManager;
    return manager ? Array.from({ length: manager.numTargets }, (_, i) => manager.getTarget(i)) : [];
  }).find(target => target.name === 'eyeBlinkLeft');
  const [firstBlink, secondBlink] = copies.map(blinkOf);
  assert.ok(firstBlink && secondBlink, 'shipped GLB provides a left eyelid morph on both residents');
  assert.notEqual(firstBlink, secondBlink, 'residents must not share a facial morph target');
  const originalSecond = secondBlink.influence;
  firstBlink.influence = 0.75;
  assert.equal(secondBlink.influence, originalSecond, 'one resident blinking must not affect another');
  firstBlink.influence = 0;
  assert.notEqual(copies[0].entries.animationGroups[walkIndex], copies[1].entries.animationGroups[walkIndex]);
  for (const { entries } of copies) entries.dispose();
  container.dispose();
});

test('locomotion indices are resolved per body, not copied from the male GLB', () => {
  assert.deepEqual(findNpcLocomotionIndices([{ name: 'Idle' }, { name: 'Walk' }, { name: 'Run' }]),
    { idleIndex: 0, walkIndex: 1 });
  assert.deepEqual(findNpcLocomotionIndices([{ name: 'Run' }, { name: 'Walk' }, { name: 'Idle' }]),
    { idleIndex: 2, walkIndex: 1 }, 'reordered female groups must still select the right clips');
  assert.equal(findNpcLocomotionIndices([{ name: 'Idle' }, { name: 'Run' }]), null);
  assert.equal(findNpcLocomotionIndices([{ name: 'Walk' }]), null);
  assert.equal(findNpcLocomotionIndices(null), null);
});

test('a missing female body or clip set falls back with matching male actions', () => {
  const both = new Map([['human.glb', true], ['human-female.glb', true]]);
  assert.equal(selectNpcAnimationModel('human-female.glb', both), 'human-female.glb');
  assert.equal(selectNpcAnimationModel('human.glb', both), 'human.glb');
  const maleOnly = new Map([['human.glb', true]]);
  assert.equal(selectNpcAnimationModel('human-female.glb', maleOnly), 'human.glb');
  assert.equal(selectNpcAnimationModel('missing.glb', maleOnly), 'human.glb');
  assert.equal(selectNpcAnimationModel('human-female.glb', new Map()), null);
});

test('actual male and female GLBs clone their own named locomotion clips', async t => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  for (const model of ['human.glb', 'human-female.glb']) {
    const bytes = readFileSync(new URL(`../public/models/${model}`, import.meta.url));
    const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, { pluginExtension: '.glb' });
    const indices = findNpcLocomotionIndices(container.animationGroups);
    assert.ok(indices, `${model}: both clips must be present`);
    const entries = container.instantiateModelsToScene(name => `test ${model} ${name}`, true);
    assert.equal(entries.animationGroups.length, container.animationGroups.length);
    assert.ok(entries.animationGroups[indices.idleIndex].targetedAnimations.length > 0, `${model}: Idle bound`);
    assert.ok(entries.animationGroups[indices.walkIndex].targetedAnimations.length > 0, `${model}: Walk bound`);
    assert.notEqual(entries.animationGroups[indices.idleIndex], entries.animationGroups[indices.walkIndex]);
    entries.dispose();
    container.dispose();
  }
});
