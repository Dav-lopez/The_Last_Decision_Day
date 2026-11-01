import test from 'node:test';
import assert from 'node:assert/strict';
import { PITCH, newBall } from '../src/world/football.mjs';
import { KEEPER, MATCH, bestPassTarget, createMatch, formatClock, formationSpot, keeperDivePose, keeperSpot, kickoff, markSpot, passBall, saveMessage, shotAim, stepMatch, supportRunSpot, teamInPossession } from '../src/world/footballMatch.mjs';
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

// Five-a-side state with everyone parked far away except the players a test places.
const parked = (placed = {}) => {
  const base = createMatch();
  return { ...base, phase: 'play', pause: 0, players: base.players.map(p => ({ ...p, human: false, x: PITCH.x - 15, z: PITCH.z + (p.team === 'home' ? 10 : -10), ...(placed[p.id] ?? {}) })) };
};
const awayLine = PITCH.x + PITCH.halfLength;

test('keepers narrow the angle: off the line as the ball comes closer, on the line between ball and goal', () => {
  const far = keeperSpot('away', { x: PITCH.x, z: PITCH.z + 3 });
  const near = keeperSpot('away', { x: awayLine - 7, z: PITCH.z + 3 });
  assert.ok(awayLine - near.x > awayLine - far.x + 0.8, 'comes off his line for a close ball');
  assert.ok(awayLine - near.x < 3, 'but not too far');
  // On the ball–goal line: the cross product of (ball - goal) and (keeper - goal) is ~0.
  const ball = { x: awayLine - 7, z: PITCH.z + 3 };
  const cross = (ball.x - awayLine) * (near.z - PITCH.z) - (ball.z - PITCH.z) * (near.x - awayLine);
  assert.ok(Math.abs(cross) < 0.05, `on the angle (cross ${cross.toFixed(3)})`);
  // A ball out wide never pulls him outside his posts.
  const wide = keeperSpot('home', { x: PITCH.x - PITCH.halfLength + 2, z: PITCH.z + 11 });
  assert.ok(Math.abs(wide.z - PITCH.z) < PITCH.goalHalfWidth);
  assert.ok(wide.x > PITCH.x - PITCH.halfLength);
});

test('a keeper dives for a shot heading for the corner and covers the distance', () => {
  const spot = keeperSpot('away', { x: awayLine - 9, z: PITCH.z });
  let state = parked({ 'away-0': { x: spot.x, z: spot.z } });
  // Struck toward the far corner (inside the left post) at 14 m/s.
  const aim = { x: awayLine, z: PITCH.z + PITCH.goalHalfWidth - 0.5 };
  const d = Math.hypot(aim.x - (awayLine - 9), aim.z - PITCH.z);
  state = { ...state, lastTouch: 'home', ball: { ...newBall(), x: awayLine - 9, vx: (aim.x - (awayLine - 9)) / d * 14, vz: (aim.z - PITCH.z) / d * 14, vy: 0.6 } };
  let dived = false; let maxZ = 0; let outcome = null;
  for (let i = 0; i < 45 && !outcome; i++) {
    state = stepMatch(state, 1 / 30);
    const k = state.players.find(p => p.id === 'away-0');
    if (k.dive) dived = true;
    maxZ = Math.max(maxZ, k.z - PITCH.z);
    for (const e of state.events) if (e.type === 'save' || e.type === 'goal') outcome = e;
  }
  assert.ok(dived, 'went full stretch');
  assert.ok(maxZ > 1.2, `got across (${maxZ.toFixed(2)} m)`);
  assert.ok(outcome, 'the shot was either saved or scored');
  if (outcome.type === 'save') assert.equal(outcome.dive, true);
});

test('keepers stop some shots but not all, and parries go wide rather than back into the middle', () => {
  let saves = 0; let goals = 0; let parriesWide = 0; let parries = 0;
  for (let s = 1; s <= 80; s++) {
    const z = PITCH.z + ((s * 37) % 9) - 4;
    const ball = { ...newBall(), x: awayLine - 8, z };
    const spot = keeperSpot('away', ball);
    let state = { ...parked({ 'away-0': { x: spot.x, z: spot.z }, 'home-3': { x: ball.x - 0.3, z } }), ball, seed: s * 977 };
    let done = false;
    for (let i = 0; i < 90 && !done; i++) {
      state = stepMatch(state, 1 / 30);
      for (const e of state.events) {
        if (e.type === 'goal') { goals++; done = true; }
        if (e.type === 'save' && e.team === 'away') {
          saves++; done = true;
          if (e.kind === 'parry') { parries++; if (Math.abs(state.ball.vz) > 3) parriesWide++; }
        }
      }
    }
  }
  assert.ok(saves > 15 && goals > 15, `saves ${saves}, goals ${goals}`);
  if (parries) assert.equal(parriesWide, parries, 'every parry is pushed wide');
});

test('a diving keeper tips over, lands and gets back up', () => {
  assert.deepEqual(keeperDivePose(null), { lean: 0, lift: 0 });
  const mid = keeperDivePose({ dir: 1, t: KEEPER.diveTime / 2 });
  assert.ok(mid.lift > 0.2 && mid.lean > 0.5);
  const down = keeperDivePose({ dir: 1, t: KEEPER.diveTime + 0.1 });
  assert.equal(down.lean, 1); assert.equal(down.lift, 0);
  const up = keeperDivePose({ dir: -1, t: KEEPER.diveTime + KEEPER.downTime - 0.05 });
  assert.ok(up.lean < 0.5);
  assert.deepEqual(keeperDivePose({ dir: 1, t: 5 }), { lean: 0, lift: 0 });
});

test('the keeper comes out to claim a loose ball he will reach first', () => {
  const spot = keeperSpot('away', { x: awayLine - 5, z: PITCH.z });
  let state = parked({ 'away-0': { x: spot.x, z: spot.z }, 'home-3': { x: awayLine - 12, z: PITCH.z } });
  state = { ...state, ball: { ...newBall(), x: awayLine - 5, z: PITCH.z + 1 } };
  const start = state.players.find(p => p.id === 'away-0');
  for (let i = 0; i < 15; i++) state = stepMatch(state, 1 / 30);
  const k = state.players.find(p => p.id === 'away-0');
  assert.ok(Math.hypot(k.x - state.ball.x, k.z - state.ball.z) < Math.hypot(start.x - state.ball.x, start.z - state.ball.z) - 0.8, 'rushed out');
});

test('without the ball, defenders mark goal-side of the attackers and one covers behind the presser', () => {
  const attacker = { x: awayLine - 8, z: PITCH.z + 3 };
  const ball = { x: PITCH.x + 2, z: PITCH.z - 2 };
  const mark = markSpot('away', attacker, ball);
  assert.ok(mark.x > attacker.x, 'between him and the away goal');
  assert.ok(Math.hypot(mark.x - attacker.x, mark.z - attacker.z) < 2);
  // In a match: home has the ball in midfield, two home forwards up; away defenders pick them up.
  let state = parked({
    'home-1': { x: PITCH.x + 1, z: PITCH.z }, // on the ball
    'home-3': { x: awayLine - 7, z: PITCH.z - 4 }, 'home-4': { x: awayLine - 6, z: PITCH.z + 4 },
    'away-1': { x: PITCH.x + 10, z: PITCH.z }, 'away-2': { x: PITCH.x + 10, z: PITCH.z + 1 },
    'away-3': { x: PITCH.x + 4, z: PITCH.z - 6 }, 'away-4': { x: PITCH.x + 4, z: PITCH.z + 6 },
    'away-0': { x: awayLine - 1, z: PITCH.z },
  });
  state = { ...state, ball: { ...newBall(), x: PITCH.x + 1.3, z: PITCH.z }, lastTouch: 'home' };
  // Keep the man on the ball from playing it, so we watch the defending shape settle for a second.
  const hold = s => ({ ...s, players: s.players.map(p => (p.team === 'home' ? { ...p, cooldown: 9 } : p)) });
  for (let i = 0; i < 30; i++) state = stepMatch(hold(state), 1 / 30);
  const home = id => state.players.find(p => p.id === id);
  const away = state.players.filter(p => p.team === 'away' && p.role === 'defender');
  const marked = ['home-3', 'home-4'].filter(id => away.some(d => Math.hypot(d.x - home(id).x, d.z - home(id).z) < 2.5 && d.x > home(id).x));
  const covering = away.some(d => d.x > state.ball.x + 1 && d.x < state.ball.x + 5 && Math.abs(d.z - state.ball.z) < 2.5);
  assert.ok(marked.length >= 1, 'a forward is marked goal-side');
  assert.ok(covering || marked.length === 2, 'and the other defender covers or marks');
});

test('with the ball, forwards run into space ahead of it, away from defenders', () => {
  let state = parked();
  const forward = state.players.find(p => p.id === 'away-3');
  const ball = { x: PITCH.x, z: PITCH.z };
  const spot = supportRunSpot(forward, ball, state.players);
  assert.ok(spot.x < ball.x - 3, 'ahead of the ball (away attacks west)');
  const crowded = supportRunSpot(forward, ball, [...state.players, { ...forward, id: 'x', team: 'home', x: spot.x, z: spot.z }]);
  assert.ok(Math.abs(crowded.z - spot.z) > 1, 'drifts off a defender standing in the space');
  assert.equal(teamInPossession([{ ...forward, x: ball.x + 0.5, z: ball.z }], ball), 'away');
  assert.equal(teamInPossession([{ ...forward, x: ball.x + 9, z: ball.z }], ball, 'home'), 'home', 'loose ball: last touch');
});

test('passers avoid a lane with a defender standing in it', () => {
  let state = parked({
    'home-1': { x: PITCH.x, z: PITCH.z },
    'home-3': { x: PITCH.x + 10, z: PITCH.z }, // straight ahead, but…
    'away-1': { x: PITCH.x + 5, z: PITCH.z + 0.3 }, // …someone in the lane
    'home-4': { x: PITCH.x + 7, z: PITCH.z + 7 }, // open, a bit wider
  });
  const passer = state.players.find(p => p.id === 'home-1');
  assert.equal(bestPassTarget(state, passer)?.id, 'home-4');
});

test('shooters aim for the post the keeper is further from', () => {
  const state = parked({ 'away-0': { x: awayLine - 1, z: PITCH.z + 1 } });
  assert.ok(shotAim(state.players, 'home', { x: awayLine - 9, z: PITCH.z }) < PITCH.z);
  const other = parked({ 'away-0': { x: awayLine - 1, z: PITCH.z - 1 } });
  assert.ok(shotAim(other.players, 'home', { x: awayLine - 9, z: PITCH.z }) > PITCH.z);
});

test('the AI match is fair to both ends and the score stays football-like', () => {
  let home = 0; let away = 0; const n = 12;
  for (let s = 1; s <= n; s++) {
    let state = kickoff({ ...createMatch(), seed: s * 7919 + 13 }, s % 2 ? 'away' : 'home');
    state = { ...state, players: state.players.map(p => ({ ...p, human: false })) };
    while (state.phase !== 'fulltime') state = stepMatch(state, 1 / 30);
    home += state.score.home; away += state.score.away;
  }
  const perMatch = (home + away) / n;
  assert.ok(perMatch > 2 && perMatch < 9, `${perMatch.toFixed(1)} goals a match`);
  assert.ok(Math.min(home, away) / Math.max(home, away) > 0.6, `home ${home}, away ${away}`);
});

test('commentary names the save', () => {
  assert.match(saveMessage({ type: 'save', team: 'away', kind: 'parry', dive: true }, 'Rovers'), /Diving save! The Rovers keeper tips it wide/);
  assert.match(saveMessage({ type: 'save', team: 'home', kind: 'smother' }), /Blue's keeper comes out/);
  assert.match(saveMessage({ type: 'save', team: 'away', kind: 'catch' }, 'Rovers'), /Saved by the Rovers keeper/);
});
