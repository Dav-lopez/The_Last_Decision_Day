import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_SITES, STREET_HALF_WIDTH, houseStreetFeatures, gableRoofGeometry, ROOF_HALF_SPAN, ROOF_RISE } from '../src/world/suburbLayout.mjs';

test('two American homes have symmetric road-facing garages and connected driveways', () => {
  assert.equal(HOUSE_SITES.length, 2);
  const left = houseStreetFeatures(HOUSE_SITES[0]);
  const right = houseStreetFeatures(HOUSE_SITES[1]);
  assert.ok(Math.abs(left.streetWallX + 6.3) < 1e-10);
  assert.ok(Math.abs(right.streetWallX - 6.3) < 1e-10);
  assert.ok(Math.abs(left.drivewayLength - 4.2) < 1e-10);
  assert.ok(Math.abs(right.drivewayLength - 4.2) < 1e-10);
  assert.ok(Math.abs(left.drivewayX + right.drivewayX) < 1e-10);
  assert.ok(left.garageFacadeX > left.streetWallX);
  assert.ok(right.garageFacadeX < right.streetWallX);
  assert.ok(left.sidewalkX < -STREET_HALF_WIDTH);
  assert.ok(right.sidewalkX > STREET_HALF_WIDTH);
});

test('gable roof pitch and panel length meet the ridge without a gap', () => {
  const roof = gableRoofGeometry();
  assert.ok(roof.pitchRadians > 0 && roof.pitchRadians < Math.PI / 4);
  assert.ok(Math.abs(roof.panelWidth * Math.cos(roof.pitchRadians) - ROOF_HALF_SPAN) < 1e-10);
  assert.ok(Math.abs(roof.panelWidth * Math.sin(roof.pitchRadians) - ROOF_RISE) < 1e-10);
  assert.ok(Math.abs(roof.panelCenterY + ROOF_RISE / 2 - roof.ridgeY) < 1e-10);
});
