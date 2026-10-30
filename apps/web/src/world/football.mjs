/**
 * Street football (five-a-side) on a caged pitch in downtown's Central Park.
 * Pure ball physics and touches; positions are world metres (x east, z north),
 * y up. The pitch runs east–west with a goal at each end.
 */
import { CITY_ORIGIN } from './cityLayout.mjs';

export const BALL_RADIUS = 0.11;
const GRAVITY = 9.81;
export const PITCH = Object.freeze({
  x: CITY_ORIGIN.x + 150, z: CITY_ORIGIN.z - 222, // centre spot, in Central Park
  halfLength: 20, halfWidth: 12,
  goalHalfWidth: 2.5, goalHeight: 2.0, goalDepth: 1.2,
});
export const KICK = Object.freeze({ power: 14, lift: 2.2, chipPower: 8.5, chipLift: 6.2, reach: 1.0 });

export function newBall(pitch = PITCH) {
  return { x: pitch.x, y: BALL_RADIUS, z: pitch.z, vx: 0, vy: 0, vz: 0, spin: 0 };
}

export function onPitch(position, pitch = PITCH, margin = 0) {
  return Math.abs(position.x - pitch.x) <= pitch.halfLength + margin && Math.abs(position.z - pitch.z) <= pitch.halfWidth + margin;
}

/**
 * Advance the ball. It rolls with friction, bounces, rebounds off the cage
 * boards and is caught by the nets. Returns { ball, goal } where goal is
 * 'east' | 'west' when it has just crossed that goal line.
 */
export function stepBall(ball, seconds, pitch = PITCH) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.05)) : 0;
  let { x, y, z, vx, vy, vz, spin } = ball;
  const wasInGoal = Math.abs(x - pitch.x) > pitch.halfLength;
  vy -= GRAVITY * dt;
  x += vx * dt; y += vy * dt; z += vz * dt;
  if (y <= BALL_RADIUS) {
    y = BALL_RADIUS;
    vy = vy < -0.6 ? -vy * 0.55 : 0;
  }
  const grounded = y <= BALL_RADIUS + 1e-6 && vy === 0;
  // Rolling resistance on grass plus a little air drag.
  const drag = Math.exp(-(grounded ? 0.9 : 0.08) * dt);
  vx *= drag; vz *= drag;
  const speed = Math.hypot(vx, vz);
  if (grounded && speed < 0.05) { vx = 0; vz = 0; }

  const dx = x - pitch.x; const dz = z - pitch.z;
  const inMouth = Math.abs(dz) < pitch.goalHalfWidth - BALL_RADIUS && y < pitch.goalHeight - BALL_RADIUS;
  // Side boards.
  if (Math.abs(dz) > pitch.halfWidth - BALL_RADIUS) {
    z = pitch.z + Math.sign(dz) * (pitch.halfWidth - BALL_RADIUS);
    vz = -vz * 0.6;
  }
  // End boards, except the goal mouth; inside the goal, the net stops it.
  const limit = pitch.halfLength - BALL_RADIUS;
  if (Math.abs(dx) > limit) {
    if (inMouth || wasInGoal) {
      const back = pitch.halfLength + pitch.goalDepth - BALL_RADIUS;
      if (Math.abs(dx) > back) { x = pitch.x + Math.sign(dx) * back; vx = -vx * 0.15; vz *= 0.5; }
      if (Math.abs(z - pitch.z) > pitch.goalHalfWidth - BALL_RADIUS) {
        z = pitch.z + Math.sign(z - pitch.z) * (pitch.goalHalfWidth - BALL_RADIUS); vz = -vz * 0.3;
      }
      if (y > pitch.goalHeight - BALL_RADIUS) { y = pitch.goalHeight - BALL_RADIUS; vy = -Math.abs(vy) * 0.3; }
    } else {
      x = pitch.x + Math.sign(dx) * limit;
      vx = -vx * 0.6;
    }
  }
  spin += Math.hypot(vx, vz) * dt / BALL_RADIUS;
  const next = { x, y, z, vx, vy, vz, spin };
  const nowInGoal = Math.abs(x - pitch.x) > pitch.halfLength;
  const goal = nowInGoal && !wasInGoal ? (x > pitch.x ? 'east' : 'west') : null;
  return { ball: next, goal };
}

/**
 * Dribbling: running into the ball knocks it a little ahead in your running
 * direction. `velocity` is the player's ground velocity (m/s).
 */
export function touchBall(ball, player, velocity) {
  const dx = ball.x - player.x; const dz = ball.z - player.z;
  const distance = Math.hypot(dx, dz);
  const speed = Math.hypot(velocity.x, velocity.z);
  if (distance > 0.5 || ball.y > 0.5 || speed < 0.2) return ball;
  // Only when moving toward the ball.
  if ((dx * velocity.x + dz * velocity.z) <= 0) return ball;
  const push = speed * 1.35 + 0.4;
  return { ...ball, vx: velocity.x / speed * push, vz: velocity.z / speed * push, vy: Math.max(ball.vy, 0) };
}

/** Kick (or chip) the ball the way you face if it's within reach; null when out of reach. */
export function kickBall(ball, player, facing, chip = false) {
  const distance = Math.hypot(ball.x - player.x, ball.z - player.z);
  if (distance > KICK.reach || ball.y > 1.2) return null;
  const length = Math.hypot(facing.x, facing.z) || 1;
  const power = chip ? KICK.chipPower : KICK.power;
  return { ...ball, vx: facing.x / length * power, vz: facing.z / length * power, vy: chip ? KICK.chipLift : KICK.lift };
}

/** Facing direction for a Babylon heading (rotation.y). */
export const facingOf = heading => ({ x: Math.sin(heading), z: Math.cos(heading) });
