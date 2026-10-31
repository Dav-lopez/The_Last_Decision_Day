import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine, Scene, LoadAssetContainerAsync, PBRMaterial, TransformNode, Quaternion } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { NEIGHBORS } from '../src/world/npcLayout.mjs';
import { npcHeadAttentionTarget, stepNpcHeadAttention } from '../src/world/npcHeadAttention.mjs';
import { createNpcHeadRig } from '../src/world/npcHeadRig.mjs';
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
    const head = entries.rootNodes.flatMap(root => root.getChildTransformNodes(false))
      .find(node => /(?:^| )Head$/.test(node.name));
    assert.ok(head?.rotationQuaternion, `${model}: animated Head transform is available for attention`);
    entries.dispose();
    container.dispose();
  }
});

test('NPC head attention follows nearby players without chasing behind or moving targets', () => {
  const npc = { x: 0, z: 0 };
  const right = npcHeadAttentionTarget(npc, { x: 0.8, z: -1.2 }, 0);
  const left = npcHeadAttentionTarget(npc, { x: -0.8, z: -1.2 }, 0);
  assert.ok(right < 0 && left > 0, 'local head yaw compensates for imported +Z face');
  assert.ok(Math.abs(right + left) < 1e-12, 'bilateral attention is mirrored');
  assert.ok(Math.abs(right) <= 0.22);
  assert.equal(npcHeadAttentionTarget(npc, { x: 0, z: 2 }, 0), 0);
  assert.equal(npcHeadAttentionTarget(npc, { x: 0.8, z: -1.2 }, 0, { moving: true }), 0);
  assert.equal(npcHeadAttentionTarget(npc, { x: 0.8, z: -1.2 }, 0, { flinch: 1 }), 0);
  assert.ok(Math.abs(npcHeadAttentionTarget(npc, { x: 0.8, z: -1.2 }, 0, { talking: true })) < Math.abs(right));
  for (const player of [null, {}, { x: NaN, z: 1 }, { x: Infinity, z: 0 }, { x: 1e308, z: 1e308 }]) {
    assert.equal(npcHeadAttentionTarget(npc, player, 0), 0);
  }
});

test('NPC head tracking acquires and releases smoothly, including invalid frames', () => {
  const target = -0.22;
  let yaw = 0;
  for (let i = 0; i < 60; i++) {
    const next = stepNpcHeadAttention(yaw, target, 1 / 60);
    assert.ok(next <= yaw && Math.abs(next - yaw) <= 0.9 / 60 + 1e-12);
    yaw = next;
  }
  assert.ok(yaw < -0.2);
  const held = stepNpcHeadAttention(yaw, 0, NaN);
  assert.equal(held, yaw);
  for (let i = 0; i < 60; i++) yaw = stepNpcHeadAttention(yaw, 0, 1 / 60);
  assert.ok(Math.abs(yaw) < 0.01, 'head returns to the authored neutral animation');
  assert.equal(stepNpcHeadAttention(Infinity, NaN, 0.1), 0);
});

test('Head bone overlay restores animation pose every frame and on disposal', t => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  const holder = new TransformNode('npc test', scene);
  const head = new TransformNode('npc test Head', scene);
  head.parent = holder;
  head.rotationQuaternion = Quaternion.FromEulerAngles(0.12, 0.06, -0.04);
  const original = head.rotationQuaternion.clone();
  const rig = createNpcHeadRig(scene, holder);
  const same = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) +
    Math.abs(a.z - b.z) + Math.abs(a.w - b.w) < 1e-8;
  rig.setYaw(-0.18);
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  const first = head.rotationQuaternion.clone();
  assert.equal(same(first, original), false, 'head receives additive yaw');
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  assert.ok(same(head.rotationQuaternion, original), 'prior additive yaw is removed before the next clip');
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  assert.ok(same(head.rotationQuaternion, first), 'unchanged clip does not accumulate yaw');
  rig.setYaw(0);
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  assert.ok(same(head.rotationQuaternion, original), 'neutral attention preserves authored pose');
  rig.setYaw(-0.18);
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  rig.dispose();
  assert.ok(same(head.rotationQuaternion, original), 'dispose restores the underlying animation');
});

test('hidden or headless NPCs never receive an attention transform', t => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  const holder = new TransformNode('npc hidden', scene);
  const head = new TransformNode('npc hidden Head', scene);
  head.parent = holder;
  head.rotationQuaternion = Quaternion.Identity();
  const rig = createNpcHeadRig(scene, holder);
  holder.setEnabled(false);
  rig.setYaw(0.2);
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  assert.equal(head.rotationQuaternion.y, 0);
  rig.dispose();
  const noHead = createNpcHeadRig(scene, new TransformNode('headless', scene));
  noHead.setYaw(0.2);
  noHead.dispose();
});
