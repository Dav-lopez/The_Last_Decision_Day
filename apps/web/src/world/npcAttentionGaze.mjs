/**
 * Signed horizontal gaze toward a nearby player, relative to NPC heading.
 * The normalized visual faces -Z at heading 0; positive means NPC's right.
 * Smoothly release attention at the near/far distance and peripheral-angle
 * boundaries so moving past an NPC does not make the eyes snap to centre.
 * The face spring still owns temporal smoothing and blink masking.
 */
const smoothstep = value => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};

export function npcAttentionGaze(npc, player, heading) {
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

  // Fade out inside the NPC's personal space and at the edge of recognition.
  // A soft peripheral cone prevents an abrupt full-strength-to-zero change
  // when the player crosses the old 60-degree attention threshold.
  const near = smoothstep((distance - 0.35) / 0.3);
  const far = 1 - smoothstep((distance - 2.0) / 0.5);
  const peripheralStart = Math.PI * 0.19;
  const peripheral = 1 - smoothstep((Math.abs(bearing) - peripheralStart) / (limit - peripheralStart));
  return Math.max(-0.55, Math.min(0.55, bearing / limit * 0.55)) * near * far * peripheral;
}
