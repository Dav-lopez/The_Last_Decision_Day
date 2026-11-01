/**
 * Small, deterministic eye fixations while a resident silently listens.
 * The player must be in the resident's forward attention cone: proximity
 * alone does not make someone stare at a person behind their back.
 *
 * The eye and head rigs remain the owners of morphs and bone rotations.
 * This module only computes bounded targets, with no per-frame allocations.
 */
const clamp01 = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const smoothstep = value => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

/** Smooth attention strength for a visible player, including straight ahead. */
export function npcListeningAttention(npc, player, heading) {
  if (!Number.isFinite(npc?.x) || !Number.isFinite(npc?.z) ||
      !Number.isFinite(player?.x) || !Number.isFinite(player?.z) ||
      !Number.isFinite(heading)) return 0;
  const dx = player.x - npc.x, dz = player.z - npc.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.45 || distance >= 2.5) return 0;
  const right = dx * Math.cos(heading) - dz * Math.sin(heading);
  const forward = -dx * Math.sin(heading) - dz * Math.cos(heading);
  if (forward <= 0) return 0;
  const bearing = Math.abs(Math.atan2(right, forward));
  const cone = Math.PI / 3;
  if (bearing >= cone) return 0;
  const near = smoothstep((distance - 0.45) / 0.3);
  const far = smoothstep((2.5 - distance) / 0.55);
  const peripheral = 1 - smoothstep((bearing - 0.55) / (cone - 0.55));
  return near * far * peripheral;
}

const PERIOD = 8.4;
const pulse = (time, start, end) => {
  if (time <= start || time >= end) return 0;
  return smoothstep((time - start) / 0.17) * smoothstep((end - time) / 0.22);
};

/** Signed horizontal eye movement, layered BEFORE per-eye convergence. */
export function npcListeningOffset(elapsed, attention, active) {
  if (active !== true || !Number.isFinite(elapsed) || elapsed < 0) return 0;
  const strength = clamp01(attention);
  if (strength === 0) return 0;
  const phase = elapsed % PERIOD;
  return strength * (0.075 * pulse(phase, 1.15, 1.85) -
    0.06 * pulse(phase, 4.4, 5.2));
}

/** Brief downward fixation, without moving the head or opening the jaw. */
export function npcListeningDown(elapsed, attention, active) {
  if (active !== true || !Number.isFinite(elapsed) || elapsed < 0) return 0;
  const strength = clamp01(attention);
  if (strength === 0) return 0;
  return strength * 0.065 * pulse(elapsed % PERIOD, 6.15, 6.95);
}
