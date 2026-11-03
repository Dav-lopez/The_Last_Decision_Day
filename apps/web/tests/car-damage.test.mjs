import test from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGE, applyImpact, bodyCondition, conditionLabel, createCarDamage, impactSeverity, impactSpot, marksForQuality } from '../src/world/carDamage.mjs';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from '../src/world/streetLayout.mjs';

test('a nudge leaves nothing; harder knocks are more severe, capped at 1', () => {
  assert.equal(impactSeverity(0), 0);
  assert.equal(impactSeverity(DAMAGE.minSpeed), 0);
  assert.ok(impactSeverity(3) > 0);
  assert.ok(impactSeverity(6) > impactSeverity(3));
  assert.equal(impactSeverity(-20), 1, 'reversing counts by speed too');
  for (const value of [NaN, Infinity, undefined, 'x']) assert.equal(impactSeverity(value), 0);
  const { state, mark } = applyImpact(createCarDamage(), { speed: 1, steer: 0 });
  assert.equal(mark, null);
  assert.equal(bodyCondition(state), 100);
});

test('the nose takes a forward knock, the tail a reversing one, steering moves it to that corner', () => {
  const straight = impactSpot({ speed: 6, steer: 0 }, 0.6, 1);
  assert.equal(straight.panel, 'front');
  assert.equal(straight.z, CAR_HALF_LENGTH);
  assert.ok(Math.abs(straight.x) <= CAR_HALF_WIDTH * 0.8);
  const right = impactSpot({ speed: 6, steer: 1 }, 0.6, 1);
  assert.ok(right.x > straight.x - 0.3 && right.x > 0, 'hard right puts it on the right of the nose');
  const back = impactSpot({ speed: -3, steer: 0 }, 0.6, 1);
  assert.equal(back.panel, 'rear');
  assert.equal(back.z, -CAR_HALF_LENGTH);
});

test('a light knock while steering scrapes down the side', () => {
  const scrape = impactSpot({ speed: 3, steer: 1 }, 0.2, 4);
  assert.equal(scrape.panel, 'right');
  assert.equal(scrape.x, CAR_HALF_WIDTH);
  assert.ok(scrape.z > 0, 'near the front when driving forwards');
  assert.equal(impactSpot({ speed: 3, steer: -1 }, 0.2, 4).panel, 'left');
  // Reversing with the wheel turned right swings the left flank.
  const reversing = impactSpot({ speed: -2.5, steer: 1 }, 0.2, 4);
  assert.equal(reversing.panel, 'left');
  assert.ok(reversing.z < 0);
});

test('light knocks scratch, hard ones dent, and repeat knocks deepen the same mark', () => {
  let damage = createCarDamage();
  let result = applyImpact(damage, { speed: 2.6, steer: 0 });
  assert.equal(result.mark.kind, 'scratch');
  damage = result.state;
  result = applyImpact(damage, { speed: 8, steer: 0 });
  assert.equal(result.mark.kind, 'dent');
  // A straight hit lands near the same spot on the nose: it deepens the scratch into a dent.
  assert.equal(result.state.marks.length, 1);
  assert.equal(result.replaces, damage.marks[0].id);
  assert.notEqual(result.mark.id, damage.marks[0].id, 'a new id so the decal is redrawn');
  assert.ok(result.mark.size > damage.marks[0].size);
  assert.ok(bodyCondition(result.state) < bodyCondition(damage));
});

test('marks are capped; the faintest makes way', () => {
  let damage = createCarDamage();
  const speeds = [2, 9, -9, 9, -9, 3, 9, -3, 9, 2.5, 9, -9, 9, 4];
  const steers = [1, 0, 0, -1, 1, -1, 1, 1, 0.5, -1, -0.5, -1, 1, 0];
  for (let i = 0; i < 40; i++) damage = applyImpact(damage, { speed: speeds[i % speeds.length], steer: steers[(i * 3) % steers.length] }).state;
  assert.ok(damage.marks.length <= DAMAGE.maxMarks);
  assert.ok(new Set(damage.marks.map(m => m.id)).size === damage.marks.length);
  for (const panel of ['front', 'rear', 'left', 'right']) assert.ok(damage.panels[panel] <= 1);
  assert.ok(bodyCondition(damage) >= 0);
  assert.equal(conditionLabel(bodyCondition(damage)), 'Battered');
});

test('condition words and quality budget', () => {
  assert.equal(conditionLabel(100), 'Clean');
  assert.equal(conditionLabel(90), 'Scratched');
  assert.equal(conditionLabel(70), 'Dented');
  assert.equal(conditionLabel(10), 'Battered');
  assert.equal(bodyCondition(null), 100);
  assert.equal(marksForQuality({ scale: 1, base: 1 }), DAMAGE.maxMarks);
  assert.ok(marksForQuality({ scale: 1.5, base: 1 }) < DAMAGE.maxMarks);
  assert.ok(marksForQuality({ scale: 2, base: 1 }) < marksForQuality({ scale: 1.5, base: 1 }));
  assert.equal(marksForQuality(null), DAMAGE.maxMarks);
});
