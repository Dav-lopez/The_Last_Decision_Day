import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFollowAlpha } from '../src/world/cameraFollow.mjs';

test('camera follow does not move for invalid or paused frame time', () => {
  for (const delta of [0, -1, Number.NaN, Infinity, -Infinity]) {
    assert.equal(cameraFollowAlpha(delta), 0);
  }
  assert.equal(cameraFollowAlpha(0.016, 0), 0);
  assert.equal(cameraFollowAlpha(0.016, Number.NaN), 0);
});

test('camera follow is refresh-rate independent', () => {
  const oneSecond = cameraFollowAlpha(1);
  const sixtyFrames = 1 - (1 - cameraFollowAlpha(1 / 60)) ** 60;
  const thirtyFrames = 1 - (1 - cameraFollowAlpha(1 / 30)) ** 30;
  assert.ok(Math.abs(oneSecond - sixtyFrames) < 1e-12);
  assert.ok(Math.abs(oneSecond - thirtyFrames) < 1e-12);
});

test('camera follow is smooth and approaches target without overshooting', () => {
  const alpha = cameraFollowAlpha(1 / 60);
  assert.ok(alpha > 0 && alpha < 1);
  assert.ok(Math.abs(cameraFollowAlpha(0.09) - 0.5) < 1e-12);
  assert.ok(cameraFollowAlpha(1 / 30) > alpha);
  assert.ok(cameraFollowAlpha(10) <= 1);
});
