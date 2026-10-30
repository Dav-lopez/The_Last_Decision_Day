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
  goalPause: 2.5, kickoffPause: 1.2,
  aiKickCooldown: 0.6,
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
  if (player.role === 'keeper') {
    const z = Math.max(-pitch.goalHalfWidth + 0.4, Math.min(pitch.goalHalfWidth - 0.4, (ball.z - pitch.z) * 0.35));
    return { x: pitch.x - dir * (pitch.halfLength - 0.8), z: pitch.z + z };
  }
  const shiftX = (ball.x - pitch.x) * 0.55;
  const shiftZ = (ball.z - pitch.z) * 0.3;
  return {
    x: clamp(pitch.x + dir * fx * pitch.halfLength + shiftX, pitch.x - pitch.halfLength + 1, pitch.x + pitch.halfLength - 1),
    z: clamp(pitch.z + fz * pitch.halfWidth + shiftZ, pitch.z - pitch.halfWidth + 1, pitch.z + pitch.halfWidth - 1),
  };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
    return { ...p, x, z: p.team === team && p.role === 'forward' && p.slot === 0 ? pitch.z : spot.z, vx: 0, vz: 0, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, cooldown: 0 };
  });
  return { ...state, players, ball, phase: 'kickoff', pause: MATCH.kickoffPause, kickoffTeam: team };
}

const headingTo = (dx, dz) => Math.atan2(dx, dz);
/** Deterministic 0..1 from a seed (so matches replay identically in tests). */
const nextRandom = seed => { const next = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return { seed: next, value: next / 4294967296 }; };
export const KEEPER = Object.freeze({ reach: 1.2, height: 1.9, saveChance: 0.72 });
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
    const marker = Math.min(...state.players.filter(p => p.team !== passer.team).map(p => Math.hypot(p.x - mate.x, p.z - mate.z)));
    const score = (mate.x - passer.x) * dir * 0.6 + Math.min(marker, 6) * 1.2 - d * 0.15;
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

  players = players.map(p => {
    if (isHuman(p)) return p;
    const dBall = Math.hypot(p.x - ball.x, p.z - ball.z);
    if (p.role === 'keeper') {
      const ownGoal = goalX(p.team === 'home' ? 'away' : 'home', pitch);
      const inBox = Math.abs(ball.x - ownGoal) < 6 && Math.abs(ball.z - pitch.z) < 6;
      // A shot coming in: get across to where it will cross the line.
      const incoming = (ownGoal - ball.x) * ball.vx > 0 && Math.abs(ball.vx) > 3;
      let target = inBox && dBall < 4 ? { x: ball.x, z: ball.z } : formationSpot(p, ball, pitch);
      if (incoming) {
        const t = (ownGoal - ball.x) / ball.vx;
        const z = clamp(ball.z + ball.vz * t, pitch.z - pitch.goalHalfWidth, pitch.z + pitch.goalHalfWidth);
        target = { x: ownGoal - attackDir(p.team) * 0.6, z };
      }
      return moveToward(p, target, MATCH.keeperSpeed * (incoming ? 1.4 : 1), dt);
    }
    if (chaser[p.team] === p.id) return moveToward(p, { x: ball.x - attackDir(p.team) * 0.35, z: ball.z }, MATCH.runSpeed, dt);
    return moveToward(p, formationSpot(p, ball, pitch), MATCH.jogSpeed, dt);
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
  for (let i = 0; i < players.length; i++) {
    const k = players[i];
    if (k.role !== 'keeper' || k.cooldown > 0) continue;
    const speed = Math.hypot(ball.vx, ball.vz);
    if (speed < 4 || ball.y > KEEPER.height || Math.hypot(k.x - ball.x, k.z - ball.z) > KEEPER.reach) continue;
    const roll = nextRandom(seed); seed = roll.seed;
    // Harder, higher shots are harder to stop.
    const chance = KEEPER.saveChance - Math.max(0, speed - 12) * 0.03 - (ball.y > 1.2 ? 0.1 : 0);
    if (roll.value < chance) {
      const dir = attackDir(k.team);
      const caught = roll.value < chance * 0.5;
      ball = caught ? { ...ball, x: k.x + dir * 0.4, z: k.z, y: BALL_RADIUS, vx: 0, vy: 0, vz: 0 }
        : { ...ball, vx: dir * Math.abs(ball.vx) * 0.35, vz: (roll.value - 0.5) * 8, vy: 1.5 };
      players[i] = { ...k, cooldown: caught ? 0.8 : 0.4 };
      events.push({ type: 'save', team: k.team, by: k.id });
    } else {
      players[i] = { ...k, cooldown: 0.5 }; // beaten
    }
  }

  // AI on the ball: keeper clears or rolls it out, outfield shoots, passes or dribbles.
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (isHuman(p) || p.cooldown > 0) continue;
    if (Math.hypot(p.x - ball.x, p.z - ball.z) > MATCH.controlRange || ball.y > 1.4) continue;
    const target = goalX(p.team, pitch);
    const toGoal = Math.hypot(target - ball.x, pitch.z - ball.z);
    let kicked = null; let kind = null;
    if (p.role === 'keeper') {
      const mate = bestPassTarget({ players }, p);
      kicked = mate ? passBall(ball, p, mate) : passBall(ball, p, { x: pitch.x, z: pitch.z });
      kind = 'save';
    } else if (toGoal < MATCH.shootRange && Math.abs(ball.z - pitch.z) < pitch.halfWidth * 0.7) {
      // Aim inside a post, alternating sides by player.
      const aimZ = pitch.z + (i % 2 ? 1 : -1) * (pitch.goalHalfWidth - 0.6);
      const dx = target - ball.x; const dz = aimZ - ball.z; const d = Math.hypot(dx, dz);
      kicked = { ...ball, vx: dx / d * 13, vz: dz / d * 13, vy: 1.2 };
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
    players[i] = { ...p, cooldown: MATCH.aiKickCooldown, heading: headingTo(ball.vx, ball.vz) };
    if (kind) events.push({ type: kind, team: p.team, by: p.id });
    break;
  }

  // You: dribble by running into it, shoot/chip/pass with buttons.
  const human = players.find(p => p.human);
  if (human && you) {
    ball = touchBall(ball, human, { x: you.vx, z: you.vz });
    if (actions.pass) {
      const mate = bestPassTarget({ players }, human);
      if (mate && Math.hypot(ball.x - human.x, ball.z - human.z) <= 1.0) { ball = passBall(ball, human, mate); events.push({ type: 'pass', team: human.team, by: human.id }); }
    } else if (actions.shoot || actions.chip) {
      const kicked = kickBall(ball, human, { x: Math.sin(human.heading), z: Math.cos(human.heading) }, Boolean(actions.chip));
      if (kicked) { ball = kicked; events.push({ type: 'shot', team: human.team, by: human.id }); }
    }
  }

  const rolled = stepBall(ball, dt, pitch);
  ball = rolled.ball;
  if (rolled.goal) {
    // The east goal is the one home attacks.
    const scorer = rolled.goal === 'east' ? 'home' : 'away';
    score = { ...score, [scorer]: score[scorer] + 1 };
    events.push({ type: 'goal', team: scorer });
    return { ...state, seed, players, ball, score, clock, phase: 'goal', pause: MATCH.goalPause, kickoffTeam: scorer === 'home' ? 'away' : 'home', events };
  }
  if (clock <= 0) {
    events.push({ type: 'fulltime', score });
    return { ...state, seed, players, ball, score, clock: 0, phase: 'fulltime', pause: 0, events };
  }
  return { ...state, seed, players, ball, score, clock, phase, pause, events };
}

export function formatClock(seconds) {
  const s = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export { BALL_RADIUS };
