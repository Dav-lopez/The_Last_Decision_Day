import test from 'node:test';
import assert from 'node:assert/strict';
import { closestInteraction, transitionInteraction } from '../src/world/worldInteractions.mjs';

test('nearest reachable car or door is selected', () => {
  const targets = [{ id: 'car', type: 'vehicle', x: 1, z: 0 }, { id: 'house', type: 'door', x: 1.7, z: 0 }];
  assert.equal(closestInteraction({ x: 0, z: 0 }, targets)?.id, 'car');
  assert.equal(closestInteraction({ x: 10, z: 10 }, targets), null);
});
test('invalid targets and coordinates are ignored', () => {
  assert.equal(closestInteraction({ x: 0, z: 0 }, [{ id: 'bad', type: 'vehicle', x: NaN, z: 0 }]), null);
  assert.equal(closestInteraction({ x: NaN, z: 0 }, []), null);
});
test('vehicle, house, bed and chair transitions require walking', () => {
  const walking = { mode: 'walking', targetId: null };
  for (const [type, mode] of [['vehicle', 'driving'], ['door', 'indoors'], ['bed', 'sleeping'], ['seat', 'sitting']]) {
    const next = transitionInteraction(walking, { id: type, type });
    assert.deepEqual(next, { mode, targetId: type });
    assert.equal(transitionInteraction(next, { id: 'other', type: 'vehicle' }), next);
    assert.deepEqual(transitionInteraction(next, 'exit'), walking);
  }
});
