/**
 * Head gestures for whoever is speaking (open-world 19c): a nod when they agree or welcome you, a head shake
 * when they say no, and a curious tilt on a question or when they're unsure. Read from the line itself, played
 * once at the start of the line on top of the conversation head motion (and the authored clip underneath).
 *
 * Pure: returns small Head-bone angles in radians; the head rig applies them after the animations.
 */
export const HEAD_GESTURES = Object.freeze({
  nod: Object.freeze({ seconds: 1.1, beats: 2, pitch: 0.17 }),
  shake: Object.freeze({ seconds: 1.3, beats: 2.5, yaw: 0.24 }),
  tilt: Object.freeze({ seconds: 1.6, roll: 0.1, pitch: -0.04 }),
});
export const HEAD_GESTURE_LIMITS = Object.freeze({ yaw: 0.3, pitch: 0.22, roll: 0.12 });

const STILL = Object.freeze({ yaw: 0, pitch: 0, roll: 0 });
const SHAKE = /^(?:no|nope|nah)[.!,]|^(?:never|i can'?t|i won'?t|not a chance)\b/i;
const NOD = /^(?:yes|yeah|yep|ok|okay|sure|right|of course|exactly|good|great|deal|alright|fine|thanks|thank you|welcome|got it|ah|hey|hi|hello)\b/i;
const TILT = /\b(?:maybe|perhaps|not sure|i guess|who knows|no idea|i wonder|i wondered|wonder)\b/i;

/** Which gesture a line gets, or null. Questions and uncertainty tilt; agreement and greetings nod; refusals shake. */
export function headGestureFor(text) {
  const line = String(text ?? '').replace(/^["“'‘…\s.]+/u, '').trim();
  if (!line) return null;
  if (SHAKE.test(line)) return 'shake';
  if (NOD.test(line) || /\b(?:got it|deal|okay|agreed)[.!]?["”']?\s*$/iu.test(line) || /(?:^|[.!?]\s+)(?:yes|yeah|good call)\b/i.test(line)) return 'nod';
  if (TILT.test(line) || /\?["”']?\s*$/u.test(line)) return 'tilt';
  return null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

/** The gesture's head angles `elapsed` seconds in; still before and after it. */
export function headGestureOffset(gesture, elapsed) {
  const shape = HEAD_GESTURES[gesture];
  if (!shape || !Number.isFinite(elapsed) || elapsed <= 0 || elapsed >= shape.seconds) return STILL;
  const t = elapsed / shape.seconds;
  const envelope = smoothstep(elapsed / 0.12) * smoothstep((shape.seconds - elapsed) / 0.3);
  if (gesture === 'nod') {
    // Down-and-up dips (never above level): sin² gives `beats` dips over the gesture.
    const dip = Math.sin(Math.PI * shape.beats * t) ** 2;
    return { yaw: 0, pitch: shape.pitch * dip * envelope, roll: 0 };
  }
  if (gesture === 'shake') return { yaw: shape.yaw * Math.sin(Math.PI * 2 * shape.beats * t) * envelope, pitch: 0, roll: 0 };
  return { yaw: 0, pitch: shape.pitch * envelope, roll: shape.roll * envelope };
}
