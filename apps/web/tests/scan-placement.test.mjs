import test from 'node:test';
import assert from 'node:assert/strict';
import { SCAN_SPOT, fitScan, scanFormat } from '../src/world/scanPlacement.mjs';
import { isBlocked } from '../src/world/movement.mjs';

test('splat and glTF scans are recognised by extension; others are not', () => {
  assert.equal(scanFormat('living-room.SPZ'), '.spz');
  assert.equal(scanFormat('scan.ply'), '.ply');
  assert.equal(scanFormat('model.glb'), '.glb');
  assert.equal(scanFormat('photo.jpg'), null);
  assert.equal(scanFormat('noextension'), null);
});

test('a scan is scaled to fit, centred on the lawn spot and stood on the ground', () => {
  const fit = fitScan({ min: { x: -5, y: -1, z: 2 }, max: { x: 7, y: 3, z: 6 } });
  assert.ok(Math.abs(fit.scale - SCAN_SPOT.maxSize / 12) < 1e-12);
  const minX = -5 * fit.scale + fit.position.x; const maxX = 7 * fit.scale + fit.position.x;
  assert.ok(Math.abs((minX + maxX) / 2 - SCAN_SPOT.x) < 1e-9);
  assert.ok(Math.abs(-1 * fit.scale + fit.position.y) < 1e-12, 'rests on the grass');
  assert.equal(fitScan({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }), null);
  assert.equal(fitScan({ min: { x: 0, y: 0, z: 0 }, max: { x: Infinity, y: 1, z: 1 } }), null);
});

test('the lawn spot is open ground off the street', () => {
  assert.equal(isBlocked(SCAN_SPOT.x, SCAN_SPOT.z), false);
  assert.ok(SCAN_SPOT.x - SCAN_SPOT.maxSize / 2 > 3.2, 'clear of the sidewalk');
});
