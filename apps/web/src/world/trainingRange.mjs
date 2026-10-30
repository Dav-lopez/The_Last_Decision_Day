/**
 * Career training range: a timed qualification against pop-up targets.
 * Police shoot a pistol qualification at paper bullseyes, soldiers a rifle
 * qualification at steel plates, firefighters a hose drill at flame boards.
 * Targets are only ever bullseyes, plates and flame boards on a closed range.
 *
 * Pure and deterministic: the overlay renders and feeds input; this module
 * owns the schedule, sway, breathing, scoring, grades and rewards.
 * Units: metres and seconds; aim offsets are in radians (metres / distance).
 */

export const RANGE_DRILLS = Object.freeze({
  police: Object.freeze({
    id: 'police', title: 'Pistol qualification', place: 'Police training range', tool: 'Service pistol', theme: 'paper',
    magazine: 15, rounds: 30, seconds: 60, targets: 15, hitsPerTarget: 2, distances: Object.freeze([7, 15, 25]),
    radius: 0.36, zoom: 1, sway: 0.006, recoil: 0.035, cooldown: 0.32, reload: 1.6, exposure: Object.freeze([4.2, 2.6]),
    brief: 'Two hits on each bullseye before it turns away. Seven, fifteen and twenty-five metres.',
    cue: 'shot', reloadWord: 'Reload',
  }),
  soldier: Object.freeze({
    id: 'soldier', title: 'Rifle qualification', place: 'Army training range', tool: 'Training rifle with optic', theme: 'steel',
    magazine: 20, rounds: 40, seconds: 75, targets: 34, hitsPerTarget: 1, distances: Object.freeze([25, 50, 100, 150, 200]),
    radius: 0.5, zoom: 4, sway: 0.0016, recoil: 0.009, cooldown: 0.36, reload: 2.2, exposure: Object.freeze([4.5, 2.8]),
    brief: 'Steel plates pop up from twenty-five to two hundred metres. One clean hit drops each plate.',
    cue: 'rifle', reloadWord: 'Reload',
  }),
  firefighter: Object.freeze({
    id: 'firefighter', title: 'Hose target drill', place: 'Fire station drill yard', tool: 'Attack hose line', theme: 'flame',
    magazine: 18, rounds: 54, seconds: 70, targets: 18, hitsPerTarget: 3, distances: Object.freeze([6, 10, 15]),
    radius: 0.45, zoom: 1, sway: 0.009, recoil: 0.02, cooldown: 0.3, reload: 1.8, exposure: Object.freeze([6, 4]),
    brief: 'Knock down each flame board with three good bursts of water. Refill the tank when it runs dry.',
    cue: 'spray', reloadWord: 'Refill',
  }),
});

export const GRADES = Object.freeze([
  Object.freeze({ id: 'expert', title: 'Expert', at: 0.85, bonus: 50 }),
  Object.freeze({ id: 'sharpshooter', title: 'Sharpshooter', at: 0.7, bonus: 35 }),
  Object.freeze({ id: 'marksman', title: 'Marksman', at: 0.55, bonus: 20 }),
  Object.freeze({ id: 'unqualified', title: 'Not qualified yet', at: 0, bonus: 0 }),
]);

export const TRAINING_MINUTES = 60;
export const TRAINING_ENERGY = 12;
/** Paid sessions are spaced out; practice in between is free but unpaid. */
export const PAID_GAP_MINUTES = 3 * 60;
const BREATH_SECONDS = 4;
const LANES = 5;

/** Small deterministic PRNG (mulberry32). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function maxScore(drill) {
  return drill.targets * drill.hitsPerTarget * 10;
}

/**
 * When and where each target shows. Targets get further away and stay up for
 * less time as the drill goes on; no two overlap in the same lane.
 */
export function rangeSchedule(drill, seed = 1) {
  const next = random(seed);
  const span = drill.seconds - 3;
  const laneFree = new Array(LANES).fill(0);
  const out = [];
  for (let i = 0; i < drill.targets; i++) {
    const progress = drill.targets > 1 ? i / (drill.targets - 1) : 0;
    const at = 1.5 + (span - drill.exposure[1]) * progress + (next() - 0.5) * 0.8;
    // Distance band: early targets near, later ones far, with some mixing.
    const band = Math.min(drill.distances.length - 1, Math.max(0, Math.round(progress * (drill.distances.length - 1) + (next() - 0.5) * 1.2)));
    const duration = drill.exposure[0] + (drill.exposure[1] - drill.exposure[0]) * progress;
    let lane = Math.floor(next() * LANES);
    for (let tries = 0; tries < LANES && laneFree[lane] > at; tries++) lane = (lane + 1) % LANES;
    laneFree[lane] = at + duration + 0.4;
    out.push(Object.freeze({ id: i, at: Math.max(0.8, at), duration, lane, laneX: (lane - (LANES - 1) / 2) / ((LANES - 1) / 2), distance: drill.distances[band] }));
  }
  return Object.freeze(out.sort((a, b) => a.at - b.at));
}

/** 0 → 1 → 0 as a target turns to face you, holds, then turns away (0.25 s each way). */
export function targetFacing(target, time) {
  const t = time - target.at;
  if (t < 0 || t > target.duration) return 0;
  return Math.min(1, t / 0.25, (target.duration - t) / 0.25);
}

/** Breath held steadies the aim for a few seconds; running out makes it worse until you recover. */
export function stepBreath(breath, holding, seconds) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  let { air, gasping } = breath ?? { air: BREATH_SECONDS, gasping: false };
  if (holding && !gasping && air > 0) {
    air = Math.max(0, air - dt);
    if (air === 0) gasping = true;
  } else {
    air = Math.min(BREATH_SECONDS, air + dt * 0.8);
    if (gasping && air >= BREATH_SECONDS * 0.5) gasping = false;
  }
  return { air, gasping, steady: holding && !gasping && air > 0 };
}

/** Aim wander in radians: a slow figure-eight, calmer with held breath, worse when tired. */
export function aimSway(drill, time, { steady = false, gasping = false, energy = 100 } = {}) {
  const tired = 1 + (1 - Math.max(0, Math.min(100, Number.isFinite(energy) ? energy : 100)) / 100) * 0.9;
  const amp = drill.sway * tired * (steady ? 0.22 : gasping ? 1.8 : 1);
  return {
    x: amp * (Math.sin(time * 1.3) + 0.45 * Math.sin(time * 3.1 + 1.1)),
    y: amp * (0.8 * Math.cos(time * 0.9) + 0.4 * Math.sin(time * 2.3 + 0.4)),
  };
}

/** Ring 10 in the middle down to 6 at the edge; 0 off the target. dx, dy are metres from its centre. */
export function ringFor(drill, dx, dy) {
  const d = Math.hypot(dx, dy) / drill.radius;
  if (!Number.isFinite(d) || d > 1) return 0;
  return 10 - Math.min(4, Math.floor(d * 5));
}

/**
 * Fire one shot / burst along aim (radians from the screen centre line) at
 * `time`. The nearest target that is up (facing) and within its rings
 * scores. Returns { ring, targetId, local: {x, y} } or a miss.
 */
export function resolveShot(drill, schedule, hits, aim, time) {
  let best = null;
  for (const target of schedule) {
    if (targetFacing(target, time) < 0.6 || (hits[target.id]?.length ?? 0) >= drill.hitsPerTarget) continue;
    const centre = targetAngles(drill, target);
    const dx = (aim.x - centre.x) * target.distance;
    const dy = (aim.y - centre.y) * target.distance;
    const ring = ringFor(drill, dx, dy);
    if (ring && (!best || ring > best.ring)) best = { ring, targetId: target.id, local: { x: dx, y: dy } };
  }
  return best ?? { ring: 0, targetId: null, local: null };
}

/**
 * Where a target's centre sits, in radians from the view centre. Lanes fan
 * across the same field of view at every distance; the target board stands
 * a little below eye height so nearer ones sit lower on screen.
 */
export function targetAngles(drill, target) {
  const spread = 0.42 / drill.zoom;
  return { x: target.laneX * spread, y: 0.2 / target.distance };
}

export function gradeFor(score, max) {
  const fraction = max > 0 ? Math.max(0, score) / max : 0;
  return GRADES.find(grade => fraction >= grade.at) ?? GRADES[GRADES.length - 1];
}

/** A fresh live session. */
export function startSession(drill, seed = 1) {
  return {
    drill: drill.id, seed, time: 0, score: 0, shots: 0, scored: 0, loaded: drill.magazine,
    reserve: drill.rounds - drill.magazine, reloading: 0, cooldown: 0, recoil: 0,
    breath: { air: BREATH_SECONDS, gasping: false }, hits: {}, done: false,
  };
}

/** Advance the clock: reload progress, recoil recovery, end of drill. */
export function stepSession(drill, session, seconds, holdingBreath = false) {
  if (session.done) return session;
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  const s = { ...session, time: session.time + dt, cooldown: Math.max(0, session.cooldown - dt), recoil: session.recoil * Math.exp(-dt * 9) };
  s.breath = stepBreath(session.breath, holdingBreath, dt);
  if (s.reloading > 0) {
    s.reloading = Math.max(0, s.reloading - dt);
    if (s.reloading === 0) {
      const take = Math.min(drill.magazine - s.loaded, s.reserve);
      s.loaded += take; s.reserve -= take;
    }
  }
  if (s.time >= drill.seconds || (s.loaded === 0 && s.reserve === 0 && s.reloading === 0)) s.done = true;
  return s;
}

export function reload(drill, session) {
  if (session.done || session.reloading > 0 || session.loaded === drill.magazine || session.reserve === 0) return session;
  return { ...session, reloading: drill.reload };
}

/** Fire at `aim` (radians). Empty magazines reload automatically. */
export function fire(drill, session, schedule, aim) {
  if (session.done || session.reloading > 0 || session.cooldown > 0) return { session, shot: null };
  if (session.loaded === 0) return { session: reload(drill, session), shot: null };
  const shot = resolveShot(drill, schedule, session.hits, aim, session.time);
  const hits = shot.targetId === null ? session.hits
    : { ...session.hits, [shot.targetId]: [...(session.hits[shot.targetId] ?? []), { ...shot.local, ring: shot.ring }] };
  let next = {
    ...session, hits, shots: session.shots + 1, loaded: session.loaded - 1, cooldown: drill.cooldown,
    recoil: session.recoil + drill.recoil, score: session.score + shot.ring, scored: session.scored + (shot.ring ? 1 : 0),
  };
  if (next.loaded === 0 && next.reserve > 0) next = reload(drill, next);
  return { session: next, shot };
}

/** Career state with a training record; older saves have none. */
export function normalizeTraining(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const best = {};
  for (const id of Object.keys(RANGE_DRILLS)) {
    const b = safe.best?.[id];
    if (Number.isFinite(b) && b > 0) best[id] = Math.min(1, b);
  }
  return { best, lastPaidAt: Number.isFinite(safe.lastPaidAt) ? safe.lastPaidAt : null };
}

/** Can a session start now? Needs your own career, its workplace open, and some energy. */
export function canTrain(career, { minute, energy, hours }) {
  if (!career?.career || !RANGE_DRILLS[career.career]) return { ok: false, reason: 'Join a career to use its training range.' };
  if (hours && !(minute >= hours[0] && minute < hours[1])) return { ok: false, reason: 'The range is closed right now. Come back during working hours.' };
  if (!(energy >= TRAINING_ENERGY)) return { ok: false, reason: "You're too tired to train. Eat or sleep first." };
  return { ok: true };
}

/**
 * Record a finished session: best result per career, plus the grade bonus
 * when it's been long enough since the last paid session.
 */
export function finishTraining(career, { score, totalMinutes }) {
  const drill = RANGE_DRILLS[career?.career];
  if (!drill) return null;
  const max = maxScore(drill);
  const fraction = Math.max(0, Math.min(1, (Number.isFinite(score) ? score : 0) / max));
  const grade = gradeFor(fraction * max, max);
  const training = normalizeTraining(career.training);
  const due = training.lastPaidAt === null || totalMinutes - training.lastPaidAt >= PAID_GAP_MINUTES;
  const pay = due ? grade.bonus : 0;
  const best = Math.max(training.best[drill.id] ?? 0, fraction);
  const personalBest = fraction > (training.best[drill.id] ?? 0) && fraction > 0;
  return {
    grade, pay, fraction, personalBest, practice: !due && grade.bonus > 0,
    state: {
      ...career, money: career.money + pay,
      training: { best: { ...training.best, [drill.id]: best }, lastPaidAt: pay > 0 ? totalMinutes : training.lastPaidAt },
    },
  };
}
