import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALL_RADIUS, PITCH, facingOf, kickBall, newBall, onPitch, stepBall, touchBall } from '../src/world/football.mjs';
import { createCityCollider, readCity, toLocal } from '../src/world/cityLayout.mjs';

const simulate = (ball, seconds) => {
  let goal = null;
  for (let t = 0; t < seconds; t += 1 / 60) { const r = stepBall(ball, 1 / 60); ball = r.ball; goal ??= r.goal; }
  return { ball, goal };
};

test('the pitch sits in Central Park, clear of buildings and inside downtown', () => {
  const city = readCity(JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url))));
  const collider = createCityCollider(city);
  for (const fx of [-1, -0.5, 0, 0.5, 1]) for (const fz of [-1, 0, 1]) {
    const [x, z] = toLocal({ x: PITCH.x + fx * (PITCH.halfLength + PITCH.goalDepth + 1), z: PITCH.z + fz * (PITCH.halfWidth + 1) });
    assert.equal(collider.blockedLocal(x, z), false, `free at ${fx},${fz}`);
  }
});

test('a rolling ball slows to a stop; a dropped ball bounces lower each time', () => {
  const rolled = simulate({ ...newBall(), vx: 5 }, 12).ball;
  assert.equal(rolled.vx, 0);
  assert.ok(rolled.x > PITCH.x + 3);
  let ball = { ...newBall(), y: 3 };
  let peaks = [];
  let rising = false; let last = ball.y;
  for (let t = 0; t < 4; t += 1 / 120) {
    ball = stepBall(ball, 1 / 120).ball;
    if (ball.y < last && rising) peaks.push(last);
    rising = ball.y > last; last = ball.y;
  }
  assert.ok(peaks.length >= 2 && peaks[1] < peaks[0]);
  assert.ok(ball.y >= BALL_RADIUS - 1e-9);
});

test('boards keep the ball in; the goal mouth lets it into the net and scores once', () => {
  const wide = simulate({ ...newBall(), z: PITCH.z + 6, vx: 25 }, 2);
  assert.equal(wide.goal, null);
  assert.ok(Math.abs(wide.ball.x - PITCH.x) <= PITCH.halfLength);
  const side = simulate({ ...newBall(), vz: 20 }, 2).ball;
  assert.ok(Math.abs(side.z - PITCH.z) <= PITCH.halfWidth);
  const shot = simulate({ ...newBall(), x: PITCH.x + 10, vx: 14, vy: 1 }, 3);
  assert.equal(shot.goal, 'east');
  assert.ok(shot.ball.x <= PITCH.x + PITCH.halfLength + PITCH.goalDepth);
  assert.ok(shot.ball.x > PITCH.x + PITCH.halfLength, 'stays in the net');
  assert.equal(simulate({ ...newBall(), x: PITCH.x - 10, vx: -14 }, 3).goal, 'west');
  assert.equal(simulate({ ...newBall(), x: PITCH.x + 10, vx: 14, vy: 7 }, 3).goal, null, 'over the bar');
});

test('dribbling pushes the ball ahead; kicks only reach a ball at your feet', () => {
  const ball = { ...newBall(), x: PITCH.x + 0.4 };
  const dribbled = touchBall(ball, { x: PITCH.x, z: PITCH.z }, { x: 1.8, z: 0 });
  assert.ok(dribbled.vx > 1.8);
  assert.equal(touchBall(ball, { x: PITCH.x, z: PITCH.z }, { x: -1.8, z: 0 }), ball, 'moving away');
  assert.equal(touchBall(ball, { x: PITCH.x - 3, z: PITCH.z }, { x: 1.8, z: 0 }), ball, 'too far');
  const kicked = kickBall(ball, { x: PITCH.x, z: PITCH.z }, facingOf(Math.PI / 2));
  assert.ok(Math.abs(kicked.vx - 14) < 1e-9 && Math.abs(kicked.vz) < 1e-9);
  assert.ok(kickBall(ball, { x: PITCH.x, z: PITCH.z }, facingOf(0), true).vy > kicked.vy, 'chip goes higher');
  assert.equal(kickBall(ball, { x: PITCH.x - 5, z: PITCH.z }, facingOf(0)), null);
  assert.ok(onPitch({ x: PITCH.x, z: PITCH.z }) && !onPitch({ x: PITCH.x + 30, z: PITCH.z }));
});
