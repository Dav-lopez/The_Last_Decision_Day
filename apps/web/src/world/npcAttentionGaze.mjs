/**
 * Signed horizontal gaze toward a nearby player, relative to NPC heading.
 * The normalized visual faces -Z at heading 0; positive means NPC's right.
 * Ignore targets behind, too close, or outside the attention cone.
 * The face spring owns smoothing and blink masking.
 */
export function npcAttentionGaze(npc, player, heading) {
  if (![npc?.x, npc?.z, player?.x, player?.z, heading].every(Number.isFinite)) return 0;
  const dx = player.x - npc.x, dz = player.z - npc.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.35 || distance > 2.5) return 0;
  const right = dx * Math.cos(heading) - dz * Math.sin(heading);
  const forward = -dx * Math.sin(heading) - dz * Math.cos(heading);
  if (forward <= 0) return 0;
  const bearing = Math.atan2(right, forward);
  const limit = Math.PI / 3;
  if (Math.abs(bearing) >= limit) return 0;
  return Math.max(-0.55, Math.min(0.55, bearing / limit * 0.55));
}
