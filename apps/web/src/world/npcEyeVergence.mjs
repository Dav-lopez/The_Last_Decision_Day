/**
 * Subtle binocular convergence when a stationary resident focuses on a nearby
 * player. The existing horizontal gaze morphs can turn each eye separately:
 * the left eye turns slightly right, the right eye slightly left. At a distance
 * both eyes return to parallel. No extra GLB targets or shader work required.
 *
 * Heading zero faces -Z. The eye centres in the authored head are 0.104 m
 * apart; convert the half-interocular angle into the existing 0.55-at-60deg
 * gaze influence scale. Spatial falloffs avoid popping at interaction edges.
 */
const smoothstep = value => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};

export function npcEyeVergence(npc, player, heading) {
  if (![npc?.x, npc?.z, player?.x, player?.z, heading].every(Number.isFinite)) return 0;
  const dx = player.x - npc.x, dz = player.z - npc.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.35 || distance >= 2.5) return 0;
  const right = dx * Math.cos(heading) - dz * Math.sin(heading);
  const forward = -dx * Math.sin(heading) - dz * Math.cos(heading);
  if (forward <= 0) return 0;
  const bearing = Math.atan2(right, forward);
  const limit = Math.PI / 3;
  if (Math.abs(bearing) >= limit) return 0;

  const near = smoothstep((distance - 0.35) / 0.3);
  const far = 1 - smoothstep((distance - 1.7) / 0.8);
  const peripheral = 1 - smoothstep((Math.abs(bearing) - 0.4) / (limit - 0.4));
  const angle = Math.atan2(0.052, distance);
  return Math.min(0.065, angle / limit * 0.55 * near * far * peripheral);
}
