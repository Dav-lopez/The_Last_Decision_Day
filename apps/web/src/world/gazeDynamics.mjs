/**
 * Subtle, deterministic eye movements while the character is idle.
 * Uses the existing bilateral up/down gaze morphs; no extra meshes, timers,
 * random state, or per-frame allocations are needed beyond the returned value.
 *
 * A short ease-in/ease-out window avoids discontinuities at cycle boundaries.
 * Emotional eye direction and deliberate movement always take precedence.
 */
const PERIOD = 4.8;
const IN = 0.18;
const OUT = 0.3;
const MAX_GAZE = 0.16;

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

/**
 * @param {string} name Bilateral eyeLookUp/eyeLookDown morph name.
 * @param {number} elapsedSeconds Monotonic accumulated animation time.
 * @param {string} emotion Current gameplay/preview emotion.
 * @param {number} speed Character speed in world units per second.
 * @returns {number} Additional normalized morph influence in [0, 0.16].
 */
export function idleGazeTarget(name, elapsedSeconds, emotion, speed) {
  if (!/^eyeLook(?:Up|Down)(?:Left|Right)$/.test(name) || emotion !== 'neutral' ||
      !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 ||
      !Number.isFinite(speed) || speed > 0.3 || speed < 0) return 0;

  const cycle = Math.floor(elapsedSeconds / PERIOD);
  const phase = elapsedSeconds - cycle * PERIOD;
  // Cycle 0 is downward, cycle 1 upward, cycle 2 rests; repeats.
  const pose = cycle % 3;
  if (pose === 2) return 0;
  const lookingUp = pose === 1;
  if (name.includes('Up') !== lookingUp) return 0;

  const envelope = smoothstep(phase / IN) * smoothstep((PERIOD - phase) / OUT);
  // Tiny left/right asymmetry avoids a perfectly mirrored mannequin stare.
  const asymmetry = name.endsWith('Left') ? 0.94 : 1;
  return Math.min(MAX_GAZE, MAX_GAZE * asymmetry * envelope);
}
