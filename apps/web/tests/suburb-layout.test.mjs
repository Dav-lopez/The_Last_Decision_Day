import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_SITES, STREET_HALF_WIDTH, SIDEWALK_WIDTH, streetFurniture } from '../src/world/suburbLayout.mjs';

test('sidewalks and mailboxes stay outside the road and mirror across the street', () => {
  assert.equal(HOUSE_SITES.length, 2);
  const left = streetFurniture(HOUSE_SITES[0]);
  const right = streetFurniture(HOUSE_SITES[1]);
  assert.ok(left.sidewalkX + SIDEWALK_WIDTH / 2 < -STREET_HALF_WIDTH);
  assert.ok(right.sidewalkX - SIDEWALK_WIDTH / 2 > STREET_HALF_WIDTH);
  assert.ok(left.mailboxX < left.sidewalkX);
  assert.ok(right.mailboxX > right.sidewalkX);
  assert.ok(Math.abs(left.mailboxX + right.mailboxX) < 1e-10);
  assert.ok(Math.abs(left.mailboxZ - right.mailboxZ) < 1e-10);
});
