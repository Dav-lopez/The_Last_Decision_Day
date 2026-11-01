/**
 * Five-a-side match: you plus four AI teammates (home, blue, attacking east)
 * against five AI opponents (away, red, attacking west). Each side has a
 * keeper, two defenders and two forwards. Pure simulation: the scene reads
 * positions and headings; the player's own body comes from normal locomotion.
 */
import { BALL_RADIUS, PITCH, kickBall, newBall, stepBall, touchBall } from './football.mjs';

export const MATCH = Object.freeze({
  minutes: 4,            // real minutes per match
  runSpeed: 4.6, jogSpeed: 2.6, keeperSpeed: 3.6,
  controlRange: 0.6,     // AI player can play the ball within this distance
  shootRange: 11,        // AI shoots when this close to goal
  shotSpeed: 14,
  blockPace: 9,          // balls faster than this (m/s) are hard for outfield players to stop
  blockChance: 0.7,     // ...and they only get a foot to this share of them
  goalPause: 2.5, kickoffPause: 1.2,
  aiKickCooldown: 0.6,
  supportRun: 6,         // metres ahead of the ball a forward runs when his side has it
  markDistance: 1.3,     // a marker stands this far goal-side of his attacker
  coverDistance: 3.2,    // the covering defender sits this far behind the presser
  laneWidth: 1.1,        // an opponent this close to a passing line can cut it out
});

const ROLES = ['keeper', 'defender', 'defender', 'forward', 'forward'];
// Formation spots as fractions of half-length (toward own goal = -1) and half-width.
const FORMATION = { keeper: [[-0.96, 0]], defender: [[-0.55, -0.45], [-0.55, 0.45]], forward: [[0.1, -0.35], [0.25, 0.35]] };

const attackDir = team => (team === 'home' ? 1 : -1);
const goalX = (team, pitch = PITCH) => pitch.x + attackDir(team) * pitch.halfLength; // the goal a team attacks

/** Formation spot (world) for a player, given the ball (the block shifts with play). */
export function formationSpot(player, ball, pitch = PITCH) {
  const roleSpots = FORMATION[player.role];
  const [fx, fz] = roleSpots[player.slot % roleSpots.length];
  const dir = attackDir(player.team);
  if (player.role === 'keeper') return keeperSpot(player.team, ball, pitch);
  const shiftX = (ball.x - pitch.x) * 0.55;
  const shiftZ = (ball.z - pitch.z) * 0.3;
  return {
    x: clamp(pitch.x + dir * fx * pitch.halfLength + shiftX, pitch.x - pitch.halfLength + 1, pitch.x + pitch.halfLength - 1),
    z: clamp(pitch.z + fz * pitch.halfWidth + shiftZ, pitch.z - pitch.halfWidth + 1, pitch.z + pitch.halfWidth - 1),
  };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Where a keeper stands: on the line from the middle of his goal to the ball,
 * coming off his line as the ball gets closer to narrow the angle.
 */
export function keeperSpot(team, ball, pitch = PITCH) {
  const dir = attackDir(team);
  const lineX = pitch.x - dir * pitch.halfLength; // own goal line
  const dx = (ball.x - lineX) * dir; const dz = ball.z - pitch.z;
  const dist = Math.hypot(Math.max(dx, 0.1), dz);
  const advance = clamp(0.7 + (1 - dist / 18) * 2, 0.7, Math.min(2.8, Math.max(0.7, dist - 1.2)));
  const ux = Math.max(dx, 0.1) / dist; const uz = dz / dist;
  return {
    x: lineX + dir * Math.max(0.6, ux * advance),
    z: pitch.z + clamp(uz * advance, -pitch.goalHalfWidth + 0.3, pitch.goalHalfWidth - 0.3),
  };
}

/** The side on the ball: whoever is nearest it, or whoever touched it last when it's loose. */
export function teamInPossession(players, ball, lastTouch = null) {
  let best = null; let bestD = Infinity;
  for (const p of players) {
    const d = Math.hypot(p.x - ball.x, p.z - ball.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best && bestD < 2 ? best.team : lastTouch;
}

/** A forward's run into space ahead of the ball, away from the nearest opponent. */
export function supportRunSpot(player, ball, players, pitch = PITCH) {
  const dir = attackDir(player.team);
  const lane = (player.slot % 2 ? 1 : -1) * pitch.halfWidth * 0.42;
  let x = ball.x + dir * MATCH.supportRun;
  let z = pitch.z + lane + (ball.z - pitch.z) * 0.25;
  // Drift away from whoever is closest, so the passing lane opens.
  let near = null; let nearD = Infinity;
  for (const o of players) {
    if (o.team === player.team) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < nearD) { nearD = d; near = o; }
  }
  if (near && nearD < 3) { const push = 3 - nearD; z += Math.sign(z - near.z || lane || 1) * push; }
  const goalLine = pitch.x + dir * pitch.halfLength;
  x = dir > 0 ? Math.min(x, goalLine - 2.5) : Math.max(x, goalLine + 2.5);
  return { x: clamp(x, pitch.x - pitch.halfLength + 1, pitch.x + pitch.halfLength - 1), z: clamp(z, pitch.z - pitch.halfWidth + 1, pitch.z + pitch.halfWidth - 1) };
}

/** Goal-side of an attacker, nudged toward the ball, so a pass to him can be cut out. */
export function markSpot(defenderTeam, attacker, ball, pitch = PITCH) {
  const ownGoal = { x: pitch.x - attackDir(defenderTeam) * pitch.halfLength, z: pitch.z };
  const gx = ownGoal.x - attacker.x; const gz = ownGoal.z - attacker.z; const g = Math.hypot(gx, gz) || 1;
  const bx = ball.x - attacker.x; const bz = ball.z - attacker.z; const b = Math.hypot(bx, bz) || 1;
  const m = MATCH.markDistance;
  return { x: attacker.x + gx / g * m + bx / b * 0.4, z: attacker.z + gz / g * m + bz / b * 0.4 };
}

/** Distance from point p to the segment a→b. */
function toSegment(p, a, b, end = 1) {
  const vx = b.x - a.x; const vz = b.z - a.z; const len2 = vx * vx + vz * vz || 1;
  const t = clamp(((p.x - a.x) * vx + (p.z - a.z) * vz) / len2, 0, end);
  return Math.hypot(a.x + vx * t - p.x, a.z + vz * t - p.z);
}

export function createMatch(pitch = PITCH) {
  const players = [];
  for (const team of ['home', 'away']) {
    const slots = {};
    ROLES.forEach((role, i) => {
      slots[role] = (slots[role] ?? -1) + 1;
      const human = team === 'home' && i === 4; // you play up front
      players.push({ id: `${team}-${i}`, team, role, slot: slots[role], human, x: pitch.x, z: pitch.z, vx: 0, vz: 0, heading: team === 'home' ? Math.PI / 2 : -Math.PI / 2, cooldown: 0 });
    });
  }
  return kickoff({ players, ball: newBall(pitch), score: { home: 0, away: 0 }, clock: MATCH.minutes * 60, phase: 'kickoff', pause: MATCH.kickoffPause, kickoffTeam: 'home', events: [], seed: 20261030 }, 'home', pitch);
}

/** Line both teams up in their halves; the ball on the centre spot. */
export function kickoff(state, team, pitch = PITCH) {
  const ball = newBall(pitch);
  const players = state.players.map(p => {
    const spot = formationSpot(p, ball, pitch);
    const dir = attackDir(p.team);
    // Stay in your own half at kick-off; the kicking team's forward stands on the ball.
    let x = p.team === team && p.role === 'forward' && p.slot === 0 ? pitch.x - dir * 0.7 : Math.min(spot.x * dir, (pitch.x - 1.5 * dir) * dir) * dir;
    if (p.team !== team && Math.hypot(x - pitch.x, spot.z - pitch.z) < 3.5) x = pitch.x - dir * 3.6;
    return { ...p, x, z: p.team === team && p.role === 'forward' && p.slot === 0 ? pitch.z : spot.z, vx: 0, vz: 0, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, cooldown: 0, dive: null };
  });
  return { ...state, players, ball, lastTouch: null, phase: 'kickoff', pause: MATCH.kickoffPause, kickoffTeam: team };
}

const headingTo = (dx, dz) => Math.atan2(dx, dz);
/** Deterministic 0..1 from a seed (so matches replay identically in tests). */
const nextRandom = seed => { const next = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return { seed: next, value: next / 4294967296 }; };
export const KEEPER = Object.freeze({
  reach: 1.2, height: 1.9, saveChance: 0.8,
  diveReach: 1.9,   // full stretch while diving
  diveSpeed: 6.5,   // sideways speed through the air (m/s)
  diveTime: 0.35,   // seconds in the air before he lands
  downTime: 0.55,   // seconds on the floor getting back up
  reactTime: 0.5,   // he dives when the ball is this close to arriving and out of reach
});

/** The z to shoot at: just inside the post the opposing keeper is further from (varies by shooter when he's central). */
export function shotAim(players, team, ball, shooterIndex = 0, pitch = PITCH) {
  const keeper = players.find(p => p.team !== team && p.role === 'keeper');
  const offset = keeper ? keeper.z - pitch.z : 0;
  const side = Math.abs(offset) > 0.25 ? -Math.sign(offset) : (shooterIndex % 2 ? 1 : -1);
  return pitch.z + side * (pitch.goalHalfWidth - 0.6);
}

/**
 * How far over a diving keeper is: `lean` 0..1 (1 = flat out sideways) and
 * `lift` metres off the grass. He leaves the ground, lands and gets back up.
 */
export function keeperDivePose(dive) {
  if (!dive) return { lean: 0, lift: 0 };
  const t = Math.max(0, dive.t);
  const total = KEEPER.diveTime + KEEPER.downTime;
  if (t >= total) return { lean: 0, lift: 0 };
  if (t < KEEPER.diveTime) {
    const k = t / KEEPER.diveTime;
    return { lean: Math.min(1, k * 1.6), lift: Math.sin(k * Math.PI) * 0.35 };
  }
  const up = 0.25; // the last quarter-second he's getting up
  const left = total - t;
  return { lean: left < up ? left / up : 1, lift: 0 };
}

/**
 * One keeper frame: set position on the ball–goal line, come out to smother a
 * loose ball near goal, shuffle across for shots and dive for the ones out of reach.
 * `dive` = { dir: ±1 (world z), t: seconds since take-off } while diving or getting up.
 */
function stepKeeper(k, ball, players, dt, pitch, lastTouch = null) {
  const dir = attackDir(k.team);
  const lineX = pitch.x - dir * pitch.halfLength;
  if (k.dive) {
    const t = k.dive.t + dt;
    if (t >= KEEPER.diveTime + KEEPER.downTime) return { ...k, dive: null, vx: 0, vz: 0 };
    if (t < KEEPER.diveTime) {
      const vz = k.dive.dir * KEEPER.diveSpeed;
      const z = clamp(k.z + vz * dt, pitch.z - pitch.goalHalfWidth - 0.8, pitch.z + pitch.goalHalfWidth + 0.8);
      return { ...k, z, vx: 0, vz, dive: { ...k.dive, t } };
    }
    return { ...k, vx: 0, vz: 0, dive: { ...k.dive, t } };
  }
  const dBall = Math.hypot(k.x - ball.x, k.z - ball.z);
  const speed = Math.hypot(ball.vx, ball.vz);
  // A shot coming in: where will it pass him?
  const incoming = (lineX - ball.x) * ball.vx > 0 && Math.abs(ball.vx) > 3 && ball.y < KEEPER.height + 0.5;
  if (incoming) {
    const t = (k.x - ball.x) / ball.vx;
    if (t > 0) {
      const crossZ = ball.z + ball.vz * t;
      const gap = crossZ - k.z;
      const onTarget = Math.abs(ball.z + ball.vz * ((lineX - ball.x) / ball.vx) - pitch.z) < pitch.goalHalfWidth + 0.4;
      if (onTarget && lastTouch !== k.team && Math.abs(gap) > KEEPER.reach * 0.6 && t < KEEPER.reactTime && k.cooldown <= 0) {
        return { ...k, vx: 0, vz: Math.sign(gap) * KEEPER.diveSpeed, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, dive: { dir: Math.sign(gap), t: 0 } };
      }
      const target = { x: k.x, z: clamp(crossZ, pitch.z - pitch.goalHalfWidth, pitch.z + pitch.goalHalfWidth) };
      return { ...moveToward(k, target, MATCH.keeperSpeed * 1.4, dt), heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
    }
  }
  // Loose ball near goal and he'll get there first: come and claim it.
  const goalDist = Math.hypot(ball.x - lineX, ball.z - pitch.z);
  const nearestAttacker = Math.min(...players.filter(p => p.team !== k.team).map(p => Math.hypot(p.x - ball.x, p.z - ball.z)));
  if (goalDist < 7.5 && speed < 7 && dBall < nearestAttacker + 1) return moveToward(k, { x: ball.x, z: ball.z }, MATCH.keeperSpeed * 1.25, dt);
  const spot = keeperSpot(k.team, ball, pitch);
  const moved = moveToward(k, spot, MATCH.keeperSpeed, dt);
  // Face the ball while setting, rather than the way he's shuffling.
  return { ...moved, heading: headingTo(ball.x - moved.x, ball.z - moved.z) };
}
function moveToward(p, target, speed, dt) {
  const dx = target.x - p.x; const dz = target.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return { ...p, vx: 0, vz: 0 };
  const step = Math.min(d, speed * dt);
  const vx = dx / d * step / (dt || 1); const vz = dz / d * step / (dt || 1);
  return { ...p, x: p.x + dx / d * step, z: p.z + dz / d * step, vx, vz, heading: headingTo(dx, dz) };
}

/** Ball speed needed to roll `distance` metres and arrive with a little pace. */
export function passSpeed(distance) {
  return Math.min(18, 0.9 * distance * 1.15 + 1.5);
}
export function passBall(ball, from, to) {
  const dx = to.x - from.x; const dz = to.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  const speed = passSpeed(d);
  return { ...ball, vx: dx / d * speed, vz: dz / d * speed, vy: d > 14 ? 3 : 0.4 };
}

/** The best teammate to pass to: open, ahead of the ball where possible, not too far. */
export function bestPassTarget(state, passer) {
  const dir = attackDir(passer.team);
  let best = null; let bestScore = -Infinity;
  for (const mate of state.players) {
    if (mate.team !== passer.team || mate.id === passer.id || mate.role === 'keeper') continue;
    const d = Math.hypot(mate.x - passer.x, mate.z - passer.z);
    if (d < 3 || d > 22) continue;
    const opponents = state.players.filter(p => p.team !== passer.team);
    const marker = Math.min(...opponents.map(p => Math.hypot(p.x - mate.x, p.z - mate.z)));
    // A defender standing in the passing lane would cut it out.
    const blocked = opponents.filter(p => Math.hypot(p.x - passer.x, p.z - passer.z) > 0.8 && toSegment(p, passer, mate, 0.8) < MATCH.laneWidth).length;
    const score = (mate.x - passer.x) * dir * 0.6 + Math.min(marker, 6) * 1.2 - d * 0.15 - blocked * 5;
    if (score > bestScore) { bestScore = score; best = mate; }
  }
  return best;
}

/**
 * Advance one frame. `you` = { x, z, vx, vz, heading } from the player's own
 * locomotion; `actions` = { shoot, chip, pass } pressed this frame.
 */
export function stepMatch(state, seconds, you = null, actions = {}, pitch = PITCH) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.05)) : 0;
  const events = [];
  let { ball, players, score, clock, phase, pause } = state;
  if (phase === 'fulltime') return { ...state, events };

  // Without your input (e.g. watching), your player is played by the AI too.
  const controlled = Boolean(you);
  players = players.map(p => (p.human && you ? { ...p, x: you.x, z: you.z, vx: you.vx, vz: you.vz, heading: you.heading } : { ...p, cooldown: Math.max(0, p.cooldown - dt) }));
  const isHuman = p => p.human && controlled;

  if (phase === 'goal' || phase === 'kickoff') {
    pause -= dt;
    if (pause > 0) return { ...state, players, pause, events };
    if (phase === 'goal') return { ...kickoff({ ...state, players }, state.kickoffTeam, pitch), events };
    phase = 'play';
  }
  clock = Math.max(0, clock - dt);

  // Who goes for the ball: the nearest outfield AI player on each side (keepers guard their box).
  const chaser = {};
  for (const team of ['home', 'away']) {
    let best = null; let bestD = Infinity;
    for (const p of players) {
      if (p.team !== team || isHuman(p) || p.role === 'keeper') continue;
      const d = Math.hypot(p.x - ball.x, p.z - ball.z);
      if (d < bestD) { bestD = d; best = p.id; }
    }
    // On your team, leave the ball to you when you're closer.
    const human = controlled ? players.find(p => p.human && p.team === team) : null;
    if (human && Math.hypot(human.x - ball.x, human.z - ball.z) < bestD) best = null;
    chaser[team] = best;
  }

  // Who has it decides the shape: support runs going forward, marking and cover without it.
  const possession = teamInPossession(players, ball, state.lastTouch ?? null);
  const roles = {};
  for (const team of ['home', 'away']) {
    if (possession === team || possession === null) continue;
    const ownGoal = { x: pitch.x - attackDir(team) * pitch.halfLength, z: pitch.z };
    const free = players.filter(p => p.team === team && p.role !== 'keeper' && !isHuman(p) && p.id !== chaser[team]);
    // Cover: the nearest free player sits between the ball and goal behind the presser.
    free.sort((a, b) => Math.hypot(a.x - ball.x, a.z - ball.z) - Math.hypot(b.x - ball.x, b.z - ball.z));
    const coverer = free.find(p => p.role === 'defender') ?? null;
    if (coverer) {
      const gx = ownGoal.x - ball.x; const gz = ownGoal.z - ball.z; const g = Math.hypot(gx, gz) || 1;
      const c = Math.min(MATCH.coverDistance, g * 0.5);
      roles[coverer.id] = { x: ball.x + gx / g * c, z: ball.z + gz / g * c };
    }
    // Mark: the other defenders take the most dangerous attackers (closest to our goal), not the one on the ball.
    const attackers = players.filter(p => p.team !== team && p.role !== 'keeper' && Math.hypot(p.x - ball.x, p.z - ball.z) > 2)
      .sort((a, b) => Math.hypot(a.x - ownGoal.x, a.z - ownGoal.z) - Math.hypot(b.x - ownGoal.x, b.z - ownGoal.z));
    for (const d of free.filter(p => p.role === 'defender' && p !== coverer)) {
      const target = attackers.shift();
      if (target) roles[d.id] = markSpot(team, target, ball, pitch);
    }
  }

  players = players.map(p => {
    if (isHuman(p)) return p;
    const dBall = Math.hypot(p.x - ball.x, p.z - ball.z);
    if (p.role === 'keeper') return stepKeeper(p, ball, players, dt, pitch, state.lastTouch ?? null);
    if (chaser[p.team] === p.id) return moveToward(p, { x: ball.x - attackDir(p.team) * 0.35, z: ball.z }, MATCH.runSpeed, dt);
    if (roles[p.id]) return moveToward(p, roles[p.id], MATCH.runSpeed * 0.85, dt);
    if (possession === p.team && p.role === 'forward' && dBall > 2) return moveToward(p, supportRunSpot(p, ball, players, pitch), MATCH.runSpeed * 0.8, dt);
    const spot = formationSpot(p, ball, pitch);
    // Forwards out of possession stay up near halfway as an outlet for the counter.
    if (p.role === 'forward' && possession !== p.team) {
      const dir = attackDir(p.team);
      spot.x = dir > 0 ? Math.max(spot.x, pitch.x - 2) : Math.min(spot.x, pitch.x + 2);
    }
    return moveToward(p, spot, MATCH.jogSpeed, dt);
  });

  // Keep players apart a little.
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i]; const b = players[j];
    const dx = b.x - a.x; const dz = b.z - a.z; const d = Math.hypot(dx, dz);
    if (d > 0 && d < 0.7) {
      const push = (0.7 - d) / 2;
      if (!isHuman(a)) players[i] = { ...a, x: a.x - dx / d * push, z: a.z - dz / d * push };
      if (!isHuman(b)) players[j] = { ...b, x: b.x + dx / d * push, z: b.z + dz / d * push };
    }
  }

  // Keepers try to save fast balls that reach them (they don't always).
  let seed = state.seed ?? 1;
  let lastTouch = state.lastTouch ?? null;
  for (let i = 0; i < players.length; i++) {
    const k = players[i];
    if (k.role !== 'keeper' || k.cooldown > 0) continue;
    const speed = Math.hypot(ball.vx, ball.vz);
    const diving = Boolean(k.dive);
    const reach = diving ? KEEPER.diveReach : KEEPER.reach;
    const d = Math.hypot(k.x - ball.x, k.z - ball.z);
    if (speed < 4 || ball.y > KEEPER.height || d > reach) continue;
    const roll = nextRandom(seed); seed = roll.seed;
    // Harder, higher and wider shots are harder to stop; one struck straight at him usually sticks.
    const chance = KEEPER.saveChance - Math.max(0, speed - 12) * 0.03 - (ball.y > 1.2 ? 0.1 : 0) - Math.max(0, d - 0.6) * 0.16;
    const dir = attackDir(k.team);
    if (roll.value < chance) {
      const caught = roll.value < chance * (diving ? 0.35 : 0.6);
      // Parries go wide, away from the middle of the goal, not back into danger.
      const wide = Math.sign(ball.z - pitch.z) || (roll.value < chance / 2 ? 1 : -1);
      ball = caught ? { ...ball, x: k.x + dir * 0.4, z: k.z, y: BALL_RADIUS, vx: 0, vy: 0, vz: 0 }
        : { ...ball, vx: dir * Math.max(2, Math.abs(ball.vx) * 0.3), vz: wide * (4 + roll.value * 4), vy: 1.5 };
      players[i] = { ...k, cooldown: caught ? 0.8 : 0.4 };
      lastTouch = k.team;
      events.push({ type: 'save', team: k.team, by: k.id, kind: caught ? 'catch' : 'parry', dive: diving });
    } else {
      players[i] = { ...k, cooldown: 0.5 }; // beaten
    }
  }

  // AI on the ball: keeper clears or rolls it out, outfield shoots, passes or dribbles.
  // When two can reach it, the nearer one gets there first (not whoever is listed first).
  const onBall = players.map((p, i) => ({ p, i, d: Math.hypot(p.x - ball.x, p.z - ball.z) }))
    .filter(({ p, d }) => !isHuman(p) && p.cooldown <= 0 && d <= MATCH.controlRange && ball.y <= 1.4)
    .sort((a, b) => a.d - b.d);
  for (const { p, i } of onBall.slice(0, 1)) {
    // A ball fizzing past is hard to stop: outfield players only block or cut out some of them.
    const pace = Math.hypot(ball.vx, ball.vz);
    if (p.role !== 'keeper' && pace > MATCH.blockPace && lastTouch !== p.team) {
      const roll = nextRandom(seed); seed = roll.seed;
      if (roll.value > MATCH.blockChance) { players[i] = { ...p, cooldown: 0.35 }; continue; }
    }
    const target = goalX(p.team, pitch);
    const toGoal = Math.hypot(target - ball.x, pitch.z - ball.z);
    let kicked = null; let kind = null;
    if (p.role === 'keeper') {
      const mate = bestPassTarget({ players }, p);
      kicked = mate ? passBall(ball, p, mate) : passBall(ball, p, { x: pitch.x, z: pitch.z });
      // Dived at an attacker's feet to win it: that's a save; otherwise he's just rolling it out.
      const smother = players.some(o => o.team !== p.team && Math.hypot(o.x - p.x, o.z - p.z) < 1.6);
      if (smother) events.push({ type: 'save', team: p.team, by: p.id, kind: 'smother', dive: false });
      kind = 'pass';
    } else if (toGoal < MATCH.shootRange && Math.abs(ball.z - pitch.z) < pitch.halfWidth * 0.7) {
      // Aim inside the post the keeper is further from.
      const aimZ = shotAim(players, p.team, ball, i, pitch);
      const dx = target - ball.x; const dz = aimZ - ball.z; const d = Math.hypot(dx, dz);
      kicked = { ...ball, vx: dx / d * MATCH.shotSpeed, vz: dz / d * MATCH.shotSpeed, vy: 0.9 };
      kind = 'shot';
    } else {
      const mate = bestPassTarget({ players }, p);
      const pressed = players.some(o => o.team !== p.team && Math.hypot(o.x - p.x, o.z - p.z) < 2.2);
      if (mate && (pressed || (mate.x - p.x) * attackDir(p.team) > 4)) { kicked = passBall(ball, p, mate); kind = 'pass'; }
      else {
        // Dribble: knock it ahead toward goal.
        const dx = target - ball.x; const dz = (pitch.z - ball.z) * 0.4; const d = Math.hypot(dx, dz) || 1;
        kicked = { ...ball, vx: dx / d * 5.2, vz: dz / d * 5.2 };
        kind = null;
      }
    }
    ball = kicked;
    lastTouch = p.team;
    players[i] = { ...p, cooldown: MATCH.aiKickCooldown, heading: headingTo(ball.vx, ball.vz) };
    if (kind) events.push({ type: kind, team: p.team, by: p.id });
  }

  // You: dribble by running into it, shoot/chip/pass with buttons.
  const human = players.find(p => p.human);
  if (human && you) {
    const before = ball;
    ball = touchBall(ball, human, { x: you.vx, z: you.vz });
    if (ball !== before) lastTouch = human.team;
    if (actions.pass) {
      const mate = bestPassTarget({ players }, human);
      if (mate && Math.hypot(ball.x - human.x, ball.z - human.z) <= 1.0) { ball = passBall(ball, human, mate); events.push({ type: 'pass', team: human.team, by: human.id }); lastTouch = human.team; }
    } else if (actions.shoot || actions.chip) {
      const kicked = kickBall(ball, human, { x: Math.sin(human.heading), z: Math.cos(human.heading) }, Boolean(actions.chip));
      if (kicked) { ball = kicked; lastTouch = human.team; events.push({ type: 'shot', team: human.team, by: human.id }); }
    }
  }

  const rolled = stepBall(ball, dt, pitch);
  ball = rolled.ball;
  if (rolled.goal) {
    // The east goal is the one home attacks.
    const scorer = rolled.goal === 'east' ? 'home' : 'away';
    score = { ...score, [scorer]: score[scorer] + 1 };
    events.push({ type: 'goal', team: scorer });
    return { ...state, seed, lastTouch, players, ball, score, clock, phase: 'goal', pause: MATCH.goalPause, kickoffTeam: scorer === 'home' ? 'away' : 'home', events };
  }
  if (clock <= 0) {
    events.push({ type: 'fulltime', score });
    return { ...state, seed, lastTouch, players, ball, score, clock: 0, phase: 'fulltime', pause: 0, events };
  }
  return { ...state, seed, lastTouch, players, ball, score, clock, phase, pause, events };
}

/** What the match commentary says about a save. */
export function saveMessage(event, opponentName = 'their') {
  const whose = event.team === 'home' ? 'Blue\'s keeper' : `the ${opponentName} keeper`;
  const Whose = whose[0].toUpperCase() + whose.slice(1);
  if (event.kind === 'smother') return `${Whose} comes out and smothers it.`;
  if (event.dive) return event.kind === 'catch' ? `Flying save! ${Whose} holds on.` : `Diving save! ${Whose} tips it wide.`;
  return event.kind === 'parry' ? `${Whose} pushes it away.` : `Saved by ${whose}.`;
}

export function formatClock(seconds) {
  const s = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export { BALL_RADIUS };
