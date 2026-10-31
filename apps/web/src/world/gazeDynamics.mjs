/**
 * Deterministic idle eye motion for the playable rig. The authored GLBs have
 * bilateral up/down and left/right gaze morphs; use both to break the fixed
 * forward stare without moving the character's head or changing gameplay.
 *
 * Horizontal saccades have a brief rapid onset and a short fixation, rather
 * than keeping the eyes pointed sideways for an entire multi-second cycle.
 * Eye blink masking is handled by the existing facial morph synchronizer.
 */
const PERIOD = 4.8;
const IN = 0.18;
const OUT = 0.3;
const MAX_VERTICAL = 0.16;
const MAX_HORIZONTAL = 0.20;

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

/**
 * @param {string} name Bilateral eyeLookUp/Down/Left/Right morph name.
 * @param {number} elapsedSeconds Monotonic accumulated animation time.
 * @param {string} emotion Current gameplay/preview emotion.
 * @param {number} speed Character speed in world units per second.
 * @returns {number} Additional normalized morph influence in [0, 0.20].
 */
export function idleGazeTarget(name, elapsedSeconds, emotion, speed) {
  const match = /^eyeLook(Up|Down|Left|Right)(Left|Right)$/.exec(name);
  if (!match || emotion !== 'neutral' ||
      !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 ||
      !Number.isFinite(speed) || speed > 0.3 || speed < 0) return 0;

  const cycle = Math.floor(elapsedSeconds / PERIOD);
  const phase = elapsedSeconds - cycle * PERIOD;
  // Down, up, rest, left saccade, rest, right saccade, rest.
  // The first three phases preserve the established idle gaze rhythm.
  const pose = cycle % 7;
  const direction = match[1];
  let amplitude;
  if ((pose === 0 && direction === 'Down') || (pose === 1 && direction === 'Up')) {
    const envelope = smoothstep(phase / IN) * smoothstep((PERIOD - phase) / OUT);
    amplitude = MAX_VERTICAL * envelope;
  } else if ((pose === 3 && direction === 'Left') || (pose === 5 && direction === 'Right')) {
    // A quick glance and short fixation: no prolonged sideways staring.
    const envelope = smoothstep((phase - 0.5) / 0.13) * smoothstep((2.1 - phase) / 0.22);
    amplitude = MAX_HORIZONTAL * envelope;
  } else return 0;

  // Both eyes move together with subtle, stable asymmetry, not strabismus.
  return Math.min(MAX_HORIZONTAL, amplitude * (match[2] === 'Left' ? 0.94 : 1));
}
