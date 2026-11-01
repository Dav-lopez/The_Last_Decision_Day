/**
 * Restrained conversational Head-bone motion for NPCs.
 *
 * Mouth cues already follow the currently displayed dialogue line. Give the
 * head a separate, finite nod/tilt envelope so the face does not look fixed
 * while speaking. No animation groups, random timers or extra GLBs are needed.
 * The renderer applies this as an additive pose after authored animations.
 */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const REST = Object.freeze({ pitch: 0, roll: 0 });
const MAX_PITCH = 0.085;
const MAX_ROLL = 0.04;

/**
 * Target pitch/roll (radians), never yaw: the attention rig owns yaw.
 * Talking but no longer speaking retains only a subtle mood pose, rather
 * than looping a nod after the dialogue line has finished.
 */
export function npcConversationHeadTarget({
  talking = false, speaking = false, elapsed = 0, duration = 0,
  mood = 'neutral', moving = false, flinch = 0,
} = {}) {
  if (!talking || moving || !Number.isFinite(flinch) || flinch < 0 || flinch > 0.15) return REST;
  const basePitch = mood === 'sad' ? 0.033 : mood === 'happy' ? -0.011 : mood === 'angry' ? -0.017 : 0;
  const baseRoll = mood === 'sad' ? 0.010 : mood === 'happy' ? -0.008 : mood === 'angry' ? 0.006 : 0;
  if (!speaking || !Number.isFinite(elapsed) || !Number.isFinite(duration) ||
      duration <= 0 || elapsed < 0 || elapsed >= duration) {
    return { pitch: basePitch, roll: baseRoll };
  }
  // Ease in at the beginning of a line and out before the last syllable.
  // A line's clock restarts with every reply; the smoothing step below keeps
  // interrupted or rapidly changed lines continuous.
  const envelope = smoothstep(elapsed / 0.2) * smoothstep((duration - elapsed) / 0.28);
  const nod = 0.037 * Math.sin(elapsed * Math.PI * 2 * 1.35) * envelope;
  const tilt = 0.013 * Math.sin(elapsed * 2.4) * envelope;
  return {
    pitch: clamp(basePitch + nod, -MAX_PITCH, MAX_PITCH),
    roll: clamp(baseRoll + tilt, -MAX_ROLL, MAX_ROLL),
  };
}

/** Smooth interruption, with an angular-speed cap and bounded tab-resume dt. */
export function stepNpcConversationHead(previous, target, seconds) {
  const fromPitch = Number.isFinite(previous?.pitch) ? clamp(previous.pitch, -MAX_PITCH, MAX_PITCH) : 0;
  const fromRoll = Number.isFinite(previous?.roll) ? clamp(previous.roll, -MAX_ROLL, MAX_ROLL) : 0;
  const toPitch = Number.isFinite(target?.pitch) ? clamp(target.pitch, -MAX_PITCH, MAX_PITCH) : 0;
  const toRoll = Number.isFinite(target?.roll) ? clamp(target.roll, -MAX_ROLL, MAX_ROLL) : 0;
  const dt = Number.isFinite(seconds) ? clamp(seconds, 0, 0.1) : 0;
  if (dt === 0) return { pitch: fromPitch, roll: fromRoll };
  const alpha = 1 - Math.exp(-9 * dt);
  return {
    pitch: clamp(fromPitch + clamp((toPitch - fromPitch) * alpha, -0.24 * dt, 0.24 * dt), -MAX_PITCH, MAX_PITCH),
    roll: clamp(fromRoll + clamp((toRoll - fromRoll) * alpha, -0.14 * dt, 0.14 * dt), -MAX_ROLL, MAX_ROLL),
  };
}
