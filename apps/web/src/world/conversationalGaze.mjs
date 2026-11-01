import { idleGazeTarget } from './gazeDynamics.mjs';

/**
 * A speaking avatar looks toward the listener most of the time, with short
 * downward/sideways glances between phrases. This is a visual speech cue,
 * not camera tracking or audio-based eye contact. Both eyes share one target.
 * All samples are deterministic and allocate no per-frame objects.
 */
const PERIOD = 5.4;
const MORPHS = Object.create(null);
for (const direction of ['Up', 'Down', 'Left', 'Right']) {
  for (const side of ['Left', 'Right']) {
    MORPHS[`eyeLook${direction}${side}`] = Object.freeze({ direction, side });
  }
}
const smoothstep = x => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

export function conversationalGazeTarget(name, elapsed, fade) {
  const match = typeof name === 'string' ? MORPHS[name] : null;
  if (!match || !Number.isFinite(elapsed) || elapsed < 0 ||
      !Number.isFinite(fade) || fade <= 0) return 0;
  const cycle = Math.floor(elapsed / PERIOD);
  const phase = elapsed - cycle * PERIOD;
  let direction, amplitude;
  if (phase >= 0.8 && phase < 1.7) {
    direction = 'Down';
    amplitude = 0.12 * smoothstep((phase - 0.8) / 0.14) * smoothstep((1.7 - phase) / 0.24);
  } else if (phase >= 3.1 && phase < 3.85) {
    direction = cycle % 2 === 0 ? 'Left' : 'Right';
    amplitude = 0.14 * smoothstep((phase - 3.1) / 0.12) * smoothstep((3.85 - phase) / 0.22);
  } else return 0;
  return match.direction === direction ? amplitude * Math.min(1, fade) * (match.side === 'Left' ? 0.97 : 1) : 0;
}

/** Suppress idle wandering during chat and locomotion, without stacking gazes. */
export function avatarGazeTarget(name, idleElapsed, emotion, speed, speaking, speechElapsed, speechWeight) {
  if (emotion !== 'neutral' || !Number.isFinite(speed) || speed < 0 || speed > 0.3) return 0;
  if (speaking === true || (Number.isFinite(speechWeight) && speechWeight > 0.01)) {
    return conversationalGazeTarget(name, speechElapsed, speechWeight);
  }
  return idleGazeTarget(name, idleElapsed, emotion, speed);
}
