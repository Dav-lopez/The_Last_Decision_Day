import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNpcBody, resolveNpcClips } from '../src/world/npcAnimationClips.mjs';

const group = (name, targets = 1) => ({ name, targetedAnimations: Array.from({ length: targets }, () => ({})) });

test('selects Idle/Walk by the selected body source order, even if female clips are reordered', () => {
  const male = [group('Idle'), group('Walk'), group('Run')];
  const female = [group('Run'), group('Idle'), group('Walk')];
  const maleClones = male.map(g => group('npc male ' + g.name));
  const femaleClones = female.map(g => group('npc female ' + g.name));
  assert.equal(resolveNpcClips(male, maleClones).idle, maleClones[0]);
  assert.equal(resolveNpcClips(male, maleClones).walk, maleClones[1]);
  assert.equal(resolveNpcClips(female, femaleClones).idle, femaleClones[1]);
  assert.equal(resolveNpcClips(female, femaleClones).walk, femaleClones[2]);
});

test('rejects missing, empty, or unbound cloned locomotion groups', () => {
  const source = [group('Idle'), group('Walk')];
  assert.equal(resolveNpcClips(source, [group('Idle'), group('Walk', 0)]), null);
  assert.equal(resolveNpcClips(source, [group('Idle')]), null);
  assert.equal(resolveNpcClips([group('Idle')], [group('Idle')]), null);
  assert.equal(resolveNpcClips(null, []), null);
  assert.equal(resolveNpcClips([], null), null);
});

test('chooses valid requested body and retains actual model for action compatibility', () => {
  const male = { animationGroups: [group('Idle'), group('Walk')] };
  const female = { animationGroups: [group('Run'), group('Walk'), group('Idle')] };
  const containers = new Map([['human.glb', male], ['human-female.glb', female]]);
  assert.deepEqual(resolveNpcBody('human-female.glb', containers), { model: 'human-female.glb', container: female });
  assert.deepEqual(resolveNpcBody('human.glb', containers), { model: 'human.glb', container: male });
});

test('fallback uses male body and therefore male action clips if female body is unusable', () => {
  const male = { animationGroups: [group('Idle'), group('Walk')] };
  const containers = new Map([['human.glb', male], ['human-female.glb', { animationGroups: [group('Idle')] }]]);
  assert.deepEqual(resolveNpcBody('human-female.glb', containers), { model: 'human.glb', container: male });
  containers.set('human-female.glb', null);
  assert.equal(resolveNpcBody('human-female.glb', containers).model, 'human.glb');
  containers.set('human.glb', { animationGroups: [group('Idle'), group('Walk', 0)] });
  assert.equal(resolveNpcBody('human-female.glb', containers), null);
  assert.equal(resolveNpcBody('human.glb', containers), null);
  assert.equal(resolveNpcBody('human-female.glb', null), null);
});
