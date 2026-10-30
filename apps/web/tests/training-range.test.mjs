import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGE_DRILLS, GRADES, PAID_GAP_MINUTES, TRAINING_ENERGY, aimSway, canTrain, finishTraining, fire, gradeFor, maxScore,
  rangeSchedule, reload, resolveShot, ringFor, startSession, stepBreath, stepSession, targetAngles, targetFacing,
} from '../src/world/trainingRange.mjs';
import { CAREERS, normalizeCareer, joinCareer, NO_CAREER } from '../src/world/careers.mjs';

const drills = Object.values(RANGE_DRILLS);

test('every career has a drill whose targets are bullseyes, plates or flame boards', () => {
  for (const id of Object.keys(CAREERS)) assert.ok(RANGE_DRILLS[id], id);
  for (const drill of drills) {
    assert.ok(['paper', 'steel', 'flame'].includes(drill.theme));
    assert.ok(drill.rounds >= drill.targets * drill.hitsPerTarget, `${drill.id} has enough rounds for a perfect score`);
    assert.equal(drill.rounds % drill.magazine, 0);
  }
  assert.deepEqual(GRADES.map(g => g.at), [...GRADES.map(g => g.at)].sort((a, b) => b - a));
});

test('schedules are deterministic, spaced per lane, and get further away', () => {
  for (const drill of drills) {
    const a = rangeSchedule(drill, 7), b = rangeSchedule(drill, 7);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, rangeSchedule(drill, 8));
    assert.equal(a.length, drill.targets);
    for (const t of a) {
      assert.ok(drill.distances.includes(t.distance));
      assert.ok(t.at >= 0.8 && t.at + t.duration <= drill.seconds + 1, `${drill.id} target ${t.id} fits the clock`);
      assert.ok(t.laneX >= -1 && t.laneX <= 1);
    }
    for (let lane = 0; lane < 5; lane++) {
      const inLane = a.filter(t => t.lane === lane);
      for (let i = 1; i < inLane.length; i++) assert.ok(inLane[i].at >= inLane[i - 1].at + inLane[i - 1].duration - 1e-9, 'never two at once in a lane');
    }
    const mean = list => list.reduce((s, t) => s + t.distance, 0) / list.length;
    const half = Math.floor(a.length / 2);
    assert.ok(mean(a.slice(half)) > mean(a.slice(0, half)), 'later targets are further');
  }
});

test('targets turn to face, hold, then turn away', () => {
  const t = { id: 0, at: 2, duration: 3, lane: 0, laneX: 0, distance: 10 };
  assert.equal(targetFacing(t, 1.9), 0);
  assert.ok(targetFacing(t, 2.1) > 0 && targetFacing(t, 2.1) < 1);
  assert.equal(targetFacing(t, 3.5), 1);
  assert.equal(targetFacing(t, 5.1), 0);
});

test('rings score 10 in the middle down to 6 at the edge', () => {
  const drill = RANGE_DRILLS.police;
  assert.equal(ringFor(drill, 0, 0), 10);
  assert.equal(ringFor(drill, drill.radius * 0.5, 0), 8);
  assert.equal(ringFor(drill, 0, drill.radius * 0.99), 6);
  assert.equal(ringFor(drill, drill.radius * 1.01, 0), 0);
  assert.equal(ringFor(drill, Number.NaN, 0), 0);
});

/** A steady shooter: aims at the centre of whichever target is up and needs hits. */
function runBot(drill, { error = 0, seed = 3 } = {}) {
  const schedule = rangeSchedule(drill, seed);
  let session = startSession(drill, seed);
  let wobble = 0;
  while (!session.done) {
    session = stepSession(drill, session, 1 / 30);
    const up = schedule.find(t => targetFacing(t, session.time) >= 0.6 && (session.hits[t.id]?.length ?? 0) < drill.hitsPerTarget);
    if (!up) continue;
    const centre = targetAngles(drill, up);
    wobble += 1.7;
    const aim = { x: centre.x + Math.sin(wobble) * error / up.distance, y: centre.y + Math.cos(wobble * 1.3) * error / up.distance };
    session = fire(drill, session, schedule, aim).session;
  }
  return session;
}

test('a steady, accurate shooter qualifies Expert; a wild one does not', () => {
  for (const drill of drills) {
    const sharp = runBot(drill);
    assert.ok(sharp.score / maxScore(drill) >= 0.85, `${drill.id}: ${sharp.score}/${maxScore(drill)}`);
    assert.equal(gradeFor(sharp.score, maxScore(drill)).id, 'expert');
    const wild = runBot(drill, { error: drill.radius * 3 });
    assert.notEqual(gradeFor(wild.score, maxScore(drill)).id, 'expert');
    assert.ok(sharp.shots <= drill.rounds && sharp.scored <= drill.targets * drill.hitsPerTarget);
  }
});

test('a target only takes as many hits as its drill allows, and down targets cannot be hit', () => {
  const drill = RANGE_DRILLS.soldier;
  const schedule = [{ id: 0, at: 0, duration: 10, lane: 2, laneX: 0, distance: 50 }];
  const aim = targetAngles(drill, schedule[0]);
  const hit = resolveShot(drill, schedule, {}, aim, 1);
  assert.equal(hit.ring, 10);
  assert.equal(resolveShot(drill, schedule, { 0: [{ x: 0, y: 0, ring: 10 }] }, aim, 1).ring, 0, 'plate already down');
  assert.equal(resolveShot(drill, schedule, {}, aim, 11).ring, 0, 'turned away');
});

test('magazines empty, reload automatically, and the drill ends when out of rounds or time', () => {
  const drill = RANGE_DRILLS.police;
  const schedule = rangeSchedule(drill, 1);
  let session = startSession(drill, 1);
  assert.equal(session.loaded + session.reserve, drill.rounds);
  // Fire at nothing as fast as allowed.
  for (let i = 0; i < drill.magazine; i++) {
    session = fire(drill, session, schedule, { x: 5, y: 5 }).session;
    for (let t = 0; t < drill.cooldown + 0.01; t += 0.05) session = stepSession(drill, session, 0.05);
  }
  assert.equal(session.shots, drill.magazine);
  assert.ok(session.reloading > 0 || session.loaded === drill.magazine, 'auto reload on empty');
  assert.equal(fire(drill, { ...session, reloading: 1 }, schedule, { x: 0, y: 0 }).shot, null, 'cannot fire mid-reload');
  for (let i = 0; i < 80 && session.reloading > 0; i++) session = stepSession(drill, session, 0.05);
  assert.equal(session.loaded, drill.magazine);
  assert.equal(session.reserve, drill.rounds - 2 * drill.magazine);
  assert.equal(reload(drill, session), session, 'full magazine: nothing to reload');
  let timed = startSession(drill, 1);
  for (let i = 0; i < drill.seconds * 10 + 5; i++) timed = stepSession(drill, timed, 0.1);
  assert.equal(timed.done, true);
});

test('holding your breath steadies the aim for a few seconds; being tired makes it worse', () => {
  const drill = RANGE_DRILLS.soldier;
  const size = s => Math.max(...Array.from({ length: 60 }, (_, i) => Math.hypot(aimSway(drill, i * 0.1, s).x, aimSway(drill, i * 0.1, s).y)));
  assert.ok(size({ steady: true }) < size({}) * 0.4);
  assert.ok(size({ energy: 10 }) > size({ energy: 100 }));
  assert.ok(size({ gasping: true }) > size({}));
  let breath = stepBreath(null, true, 0.05);
  assert.equal(breath.steady, true);
  for (let i = 0; i < 100; i++) breath = stepBreath(breath, true, 0.05);
  assert.equal(breath.gasping, true, 'ran out of air');
  assert.equal(breath.steady, false);
  for (let i = 0; i < 80; i++) breath = stepBreath(breath, false, 0.05);
  assert.equal(breath.gasping, false, 'recovered');
});

test('training needs your own career, open hours and energy; rewards are spaced out', () => {
  assert.equal(canTrain(NO_CAREER, { minute: 600, energy: 80 }).ok, false);
  const cop = joinCareer(normalizeCareer(null), 'police');
  assert.equal(canTrain(cop, { minute: 600, energy: 80, hours: CAREERS.police.hours }).ok, true);
  assert.equal(canTrain(cop, { minute: 23 * 60, energy: 80, hours: CAREERS.police.hours }).ok, false);
  assert.equal(canTrain(cop, { minute: 600, energy: TRAINING_ENERGY - 1, hours: CAREERS.police.hours }).ok, false);
  const max = maxScore(RANGE_DRILLS.police);
  const first = finishTraining(cop, { score: max, totalMinutes: 1000 });
  assert.equal(first.grade.id, 'expert');
  assert.equal(first.pay, 50);
  assert.equal(first.state.money, cop.money + 50);
  assert.equal(first.state.training.best.police, 1);
  assert.equal(first.personalBest, true);
  // Straight back in: practice, unpaid; the best result is kept.
  const again = finishTraining(first.state, { score: max * 0.6, totalMinutes: 1060 });
  assert.equal(again.pay, 0);
  assert.equal(again.practice, true);
  assert.equal(again.state.training.best.police, 1);
  const later = finishTraining(again.state, { score: max * 0.72, totalMinutes: 1000 + PAID_GAP_MINUTES });
  assert.equal(later.grade.id, 'sharpshooter');
  assert.equal(later.pay, 35);
  // Saved and reloaded through the career normaliser, junk dropped.
  const saved = normalizeCareer(JSON.parse(JSON.stringify({ ...later.state, training: { ...later.state.training, best: { ...later.state.training.best, hacker: 1, soldier: -2 } } })));
  assert.deepEqual(saved.training.best, { police: 1 });
  assert.equal(finishTraining(NO_CAREER, { score: 10, totalMinutes: 0 }), null);
});
