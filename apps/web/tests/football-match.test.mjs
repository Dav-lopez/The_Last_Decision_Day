import test from 'node:test';
import assert from 'node:assert/strict';
import { PITCH, newBall } from '../src/world/football.mjs';
import { MATCH, bestPassTarget, createMatch, formatClock, formationSpot, passBall, stepMatch } from '../src/world/footballMatch.mjs';
import { stepBall as roll } from '../src/world/football.mjs';

const simulate = (state, seconds, you = null) => {
  const events = [];
  for (let t = 0; t < seconds && state.phase !== 'fulltime'; t += 1 / 30) {
    state = stepMatch(state, 1 / 30, you);
    events.push(...state.events);
  }
  return { state, events };
};

test('two teams of five line up in their own halves; you are a home forward', () => {
  const match = createMatch();
  assert.equal(match.players.length, 10);
  for (const team of ['home', 'away']) {
    const side = match.players.filter(p => p.team === team);
    assert.equal(side.length, 5);
    assert.equal(side.filter(p => p.role === 'keeper').length, 1);
    for (const p of side) {
      assert.ok(Math.abs(p.x - PITCH.x) <= PITCH.halfLength && Math.abs(p.z - PITCH.z) <= PITCH.halfWidth);
      if (team === 'away') assert.ok(p.x >= PITCH.x + 1.4, `${p.id} in own half at kick-off`);
    }
  }
  assert.equal(match.players.filter(p => p.human).length, 1);
  assert.equal(match.players.find(p => p.human).team, 'home');
  assert.deepEqual(match.score, { home: 0, away: 0 });
  assert.equal(match.phase, 'kickoff');
});

test('keepers guard their goal mouth and follow the ball across it', () => {
  const keeper = createMatch().players.find(p => p.team === 'away' && p.role === 'keeper');
  const spot = formationSpot(keeper, { ...newBall(), z: PITCH.z + 10 });
  assert.ok(spot.x > PITCH.x + PITCH.halfLength - 1.5);
  assert.ok(Math.abs(spot.z - PITCH.z) < PITCH.goalHalfWidth);
  assert.ok(spot.z > PITCH.z, 'shifts toward the ball');
});

test('a pass is weighted to roll about as far as the receiver', () => {
  for (const d of [5, 10, 16]) {
    let ball = passBall(newBall(), { x: PITCH.x, z: PITCH.z }, { x: PITCH.x - d, z: PITCH.z });
    for (let t = 0; t < 8; t += 1 / 60) ball = roll(ball, 1 / 60).ball;
    const travelled = Math.abs(ball.x - PITCH.x);
    assert.ok(travelled > d * 0.8 && travelled < d * 1.6, `${d} m pass went ${travelled.toFixed(1)} m`);
  }
});

test('passes go to an open teammate, never to the passer or an opponent', () => {
  const match = createMatch();
  const passer = match.players.find(p => p.id === 'home-1');
  const target = bestPassTarget(match, passer);
  if (target) { assert.equal(target.team, 'home'); assert.notEqual(target.id, passer.id); assert.notEqual(target.role, 'keeper'); }
});

test('the AI plays a real match: possession changes, shots happen, goals count, the clock runs out', () => {
  let state = createMatch();
  const { state: end, events } = simulate(state, MATCH.minutes * 60 * 2);
  assert.equal(end.phase, 'fulltime');
  assert.equal(end.clock, 0);
  assert.ok(events.some(e => e.type === 'pass'), 'passing');
  assert.ok(events.some(e => e.type === 'shot'), 'shooting');
  const goals = events.filter(e => e.type === 'goal');
  assert.equal(end.score.home + end.score.away, goals.length);
  assert.ok(events.at(-1).type === 'fulltime');
  for (const p of end.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
  assert.ok(Math.abs(end.ball.x - PITCH.x) <= PITCH.halfLength + PITCH.goalDepth + 0.01);
});

test('after a goal there is a pause, then the conceding side kicks off from the centre', () => {
  let state = createMatch();
  // Everyone else well away from the ball, so nobody intercepts.
  state = { ...state, phase: 'play', pause: 0, players: state.players.map(p => ({ ...p, x: PITCH.x - 15, z: PITCH.z + 8 })), ball: { ...newBall(), x: PITCH.x + PITCH.halfLength - 0.5, vx: 12 } };
  for (let i = 0; i < 30 && state.phase === 'play'; i++) state = stepMatch(state, 1 / 30);
  assert.equal(state.phase, 'goal');
  assert.equal(state.score.home, 1);
  assert.equal(state.kickoffTeam, 'away');
  for (let t = 0; t < MATCH.goalPause + 0.2; t += 1 / 30) state = stepMatch(state, 1 / 30);
  assert.equal(state.phase, 'kickoff');
  assert.ok(Math.hypot(state.ball.x - PITCH.x, state.ball.z - PITCH.z) < 0.01);
});

test('you can pass and shoot', () => {
  let state = { ...createMatch(), phase: 'play', pause: 0 };
  const you = { x: PITCH.x - 0.3, z: PITCH.z, vx: 0, vz: 0, heading: Math.PI / 2 };
  const shot = stepMatch(state, 1 / 30, you, { shoot: true });
  assert.ok(shot.ball.vx > 10, 'struck toward the away goal');
  const passed = stepMatch(state, 1 / 30, you, { pass: true });
  assert.ok(passed.events.some(e => e.type === 'pass' && e.by === 'home-4'));
  assert.equal(formatClock(61.2), '1:02');
});
