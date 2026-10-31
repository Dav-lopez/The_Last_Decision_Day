import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleRemotePose, stepRemotePose } from '../src/world/multiplayer/remotePosePresentation.mjs';

const pose = { x: 3, z: -4, rotation: 1.2, speed: 4, mode: 'walking', location: 'street' };

test('remote walking and busy avatars remain visible, with idle animation when busy', () => {
  assert.equal(visibleRemotePose(pose, 'street').speed, 4);
  const busy = visibleRemotePose({ ...pose, mode: 'busy' }, 'street');
  assert.equal(busy.showBody, true);
  assert.equal(busy.speed, 0);
  assert.equal(visibleRemotePose({ ...pose, speed: 99 }, 'street').speed, 8);
  assert.equal(visibleRemotePose({ ...pose, speed: -4 }, 'street').speed, 0);
  assert.equal(visibleRemotePose({ ...pose, speed: NaN }, 'street').speed, 0);
});

test('driving preserves the remote nameplate without rendering a walking body', () => {
  const driving = visibleRemotePose({ ...pose, mode: 'driving' }, 'street');
  assert.equal(driving.showBody, false);
  assert.equal(driving.speed, 0);
});

test('different scenes, unknown modes and malformed remote coordinates are rejected', () => {
  assert.equal(visibleRemotePose(pose, 'school'), null);
  assert.equal(visibleRemotePose(null, 'street'), null);
  assert.equal(visibleRemotePose({ ...pose, mode: 'unknown' }, 'street'), null);
  for (const key of ['x', 'z', 'rotation']) for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(visibleRemotePose({ ...pose, [key]: value }, 'street'), null);
  }
});

test('remote position eases nearby updates but snaps first appearances and teleports', () => {
  const start = { x: 0, z: 0, rotation: 0 };
  const near = { x: 2, z: 0, rotation: 1 };
  const far = { x: 30, z: 0, rotation: 1 };
  assert.deepEqual(stepRemotePose(start, near, 0.016, false), near);
  assert.deepEqual(stepRemotePose(start, far, 0.016, true), far);
  const interpolated = stepRemotePose(start, near, 0.016, true);
  assert.ok(interpolated.x > 0 && interpolated.x < 2);
  assert.ok(interpolated.rotation > 0 && interpolated.rotation < 1);
  assert.equal(interpolated.z, 0);
});

test('invalid frame times pause interpolation and heading uses shortest wraparound turn', () => {
  const start = { x: 0, z: 0, rotation: 0 };
  const target = { x: 2, z: 1, rotation: 1 };
  for (const seconds of [NaN, -1, Infinity]) {
    assert.deepEqual(stepRemotePose(start, target, seconds, true), start);
  }
  const seam = { x: 0, z: 0, rotation: Math.PI - 0.05 };
  const next = stepRemotePose(seam, { x: 1, z: 0, rotation: -Math.PI + 0.05 }, 0.016, true);
  assert.ok(next.rotation > seam.rotation && next.rotation < Math.PI + 0.05);
});
