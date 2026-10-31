/**
 * A small, additive head turn toward a nearby player. The eye morphs lead;
 * the Head bone follows only a fraction of the bearing, never the full torso.
 * This is a procedural attention cue, not a substitute for authored head clips.
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = value => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};
const MAX_YAW = 0.22;

/** Signed local Head-bone yaw in radians; zero means preserve the animation. */
export function npcHeadAttentionTarget(npc, player, heading, context = {}) {
  if (![npc?.x, npc?.z, player?.x, player?.z, heading].every(Number.isFinite) ||
      context.moving || (Number.isFinite(context.flinch) && context.flinch > 0.15)) return 0;
  const dx = player.x - npc.x, dz = player.z - npc.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.45 || distance >= 3.1) return 0;
  // The visual is normalized to face -Z, while the imported Head bone faces
  // +Z before the model's PI rotation. Hence the local yaw sign is reversed.
  const right = dx * Math.cos(heading) - dz * Math.sin(heading);
  const forward = -dx * Math.sin(heading) - dz * Math.cos(heading);
  if (forward <= 0) return 0;
  const bearing = Math.atan2(right, forward);
  const cone = 1.2;
  if (Math.abs(bearing) >= cone) return 0;
  const near = smoothstep((distance - 0.45) / 0.3);
  const far = 1 - smoothstep((distance - 2.5) / 0.6);
  const peripheral = 1 - smoothstep((Math.abs(bearing) - 0.65) / (cone - 0.65));
  // During conversation the torso already turns to face the player.
  const conversationScale = context.talking ? 0.3 : 1;
  return clamp(-bearing * 0.33, -MAX_YAW, MAX_YAW) *
    near * far * peripheral * conversationScale;
}

/** Smooth acquisition and release, with a hard angular-velocity cap. */
export function stepNpcHeadAttention(current, target, seconds) {
  const from = Number.isFinite(current) ? clamp(current, -MAX_YAW, MAX_YAW) : 0;
  const to = Number.isFinite(target) ? clamp(target, -MAX_YAW, MAX_YAW) : 0;
  const dt = Number.isFinite(seconds) ? clamp(seconds, 0, 0.1) : 0;
  if (dt === 0) return from;
  const eased = (to - from) * (1 - Math.exp(-7 * dt));
  return clamp(from + clamp(eased, -0.9 * dt, 0.9 * dt), -MAX_YAW, MAX_YAW);
}
