/**
 * Short, single-shot eyelid reflexes when the playable character becomes
 * startled or embarrassed. Natural blinking retains its own independent clock.
 *
 * These cues are generated only on emotion transitions, never by polling a
 * fixed emotion each frame. A refractory period prevents rapid dialogue or
 * multiplayer updates from producing a strobing face.
 */
const clamp01 = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const smoothstep = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const REFRACTORY = 1.2;
const REFLEX = Object.freeze({
  fear: Object.freeze({ close: 0.065, hold: 0.035, open: 0.14, intensity: 0.96 }),
  embarrassed: Object.freeze({ close: 0.11, hold: 0.055, open: 0.19, intensity: 0.72 }),
});

export function initialEmotionBlink() {
  return { emotion: 'neutral', kind: null, elapsed: 0, cooldown: 0, left: 0, right: 0 };
}

function eyelidAt(time, config) {
  if (time <= 0) return 0;
  if (time < config.close) return config.intensity * smoothstep(time / config.close);
  if (time < config.close + config.hold) return config.intensity;
  return config.intensity * (1 - smoothstep((time - config.close - config.hold) / config.open));
}

/**
 * @param {ReturnType<typeof initialEmotionBlink>} previous
 * @param {string} emotion
 * @param {number} seconds A render delta, bounded to 100 ms after tab resumes.
 */
export function stepEmotionBlink(previous, emotion, seconds) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(0.1, seconds)) : 0;
  const oldEmotion = typeof previous?.emotion === 'string' ? previous.emotion : 'neutral';
  const nextEmotion = typeof emotion === 'string' ? emotion : 'neutral';
  const oldCooldown = Number.isFinite(previous?.cooldown) ? Math.max(0, previous.cooldown) : 0;
  let cooldown = Math.max(0, oldCooldown - dt);
  const changed = nextEmotion !== oldEmotion;
  let kind = Object.hasOwn(REFLEX, previous?.kind) ? previous.kind : null;
  let elapsed = Number.isFinite(previous?.elapsed) ? Math.max(0, previous.elapsed) : 0;
  if (changed && !kind && Object.hasOwn(REFLEX, nextEmotion) && cooldown <= 0) {
    kind = nextEmotion;
    elapsed = 0;
    cooldown = REFRACTORY;
  }
  if (!kind) return { emotion: nextEmotion, kind: null, elapsed: 0, cooldown, left: 0, right: 0 };
  const config = REFLEX[kind];
  elapsed += dt;
  const duration = config.close + config.hold + config.open + 0.016;
  if (elapsed >= duration) {
    return { emotion: nextEmotion, kind: null, elapsed: 0, cooldown, left: 0, right: 0 };
  }
  return {
    emotion: nextEmotion, kind, elapsed, cooldown,
    left: eyelidAt(elapsed, config),
    right: eyelidAt(elapsed - 0.016, config),
  };
}

/** Union two independent eyelid closures, never adding above 1. */
export function combineBlinkFrames(natural, reflex) {
  const union = (a, b) => 1 - (1 - clamp01(a)) * (1 - clamp01(b));
  return {
    left: union(natural?.left, reflex?.left),
    right: union(natural?.right, reflex?.right),
  };
}
