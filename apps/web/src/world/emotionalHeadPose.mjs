/** Subtle facial-body language layered over authored Head-bone animation. */
const POSES = Object.freeze({
  neutral: Object.freeze({ pitch: 0, roll: 0 }),
  happy: Object.freeze({ pitch: -0.028, roll: 0.024 }),
  sad: Object.freeze({ pitch: 0.082, roll: -0.022 }),
  angry: Object.freeze({ pitch: -0.044, roll: 0.012 }),
  fear: Object.freeze({ pitch: -0.048, roll: -0.009 }),
  embarrassed: Object.freeze({ pitch: 0.070, roll: -0.042 }),
  exerted: Object.freeze({ pitch: 0.025, roll: 0 }),
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const unit = value => clamp(value, 0, 1);
const smoothstep = value => { const t = unit(value); return t * t * (3 - 2 * t); };
const limits = { pitch: 0.12, roll: 0.07 };

/** Motion and large body actions fade the head cue to preserve authored clips. */
export function emotionHeadTarget(emotion, speed = 0, action = null) {
  const pose = Object.hasOwn(POSES, emotion) ? POSES[emotion] : POSES.neutral;
  const motion = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const scale = (1 - smoothstep(motion / 1.4)) *
    (action === 'Drive' || action === 'JumpAir' || action === 'Dance' ? 0 : action === 'Talk' ? 0.7 : 1);
  return { pitch: pose.pitch * scale, roll: pose.roll * scale };
}

/** Frame-bounded, velocity-limited settling; interrupted moods reverse smoothly. */
export function stepEmotionHeadPose(previous, target, seconds) {
  const dt = Number.isFinite(seconds) ? clamp(seconds, 0, 0.1) : 0;
  const next = {};
  for (const axis of ['pitch', 'roll']) {
    const limit = limits[axis];
    const from = Number.isFinite(previous?.[axis]) ? clamp(previous[axis], -limit, limit) : 0;
    const to = Number.isFinite(target?.[axis]) ? clamp(target[axis], -limit, limit) : 0;
    const delta = (to - from) * (1 - Math.exp(-7 * dt));
    next[axis] = clamp(from + clamp(delta, -0.36 * dt, 0.36 * dt), -limit, limit);
  }
  return next;
}
