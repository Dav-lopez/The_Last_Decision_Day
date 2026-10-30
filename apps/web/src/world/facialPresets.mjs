/**
 * Morph weights for the actual skinned facial surfaces in human.glb.
 * Small bilateral differences avoid the mirrored, mannequin-like expression
 * of identical left/right weights. These are static poses; the runtime's
 * damped morph animator handles transitions and blink composition.
 *
 * Every target is optional: the shipped legacy asset has fewer targets than
 * the facial-generator candidate. Never require a new GLB to load this module.
 */
const preset = values => Object.freeze(values);

export const FACIAL_PRESETS = Object.freeze({
  neutral: preset({}),
  happy: preset({
    mouthSmileLeft: 0.79, mouthSmileRight: 0.69,
    cheekSquintLeft: 0.34, cheekSquintRight: 0.27,
    browInnerUp: 0.08,
  }),
  sad: preset({
    mouthFrownLeft: 0.72, mouthFrownRight: 0.63,
    browInnerUp: 0.66, eyeSquintLeft: 0.20, eyeSquintRight: 0.15,
    jawOpen: 0.08,
  }),
  angry: preset({
    browDownLeft: 0.83, browDownRight: 0.75,
    mouthPressLeft: 0.64, mouthPressRight: 0.55,
    eyeSquintLeft: 0.22, eyeSquintRight: 0.18,
  }),
  fear: preset({
    eyeWideLeft: 0.79, eyeWideRight: 0.74,
    eyeLookUpLeft: 0.27, eyeLookUpRight: 0.23,
    browInnerUp: 0.70, jawOpen: 0.32, mouthOpen: 0.19,
  }),
  embarrassed: preset({
    eyeLookDownLeft: 0.43, eyeLookDownRight: 0.38,
    mouthSmileLeft: 0.26, mouthSmileRight: 0.17,
    cheekSquintLeft: 0.17, cheekSquintRight: 0.12,
    browInnerUp: 0.11,
  }),
  exerted: preset({
    mouthOpen: 0.48, jawOpen: 0.18,
    browDownLeft: 0.24, browDownRight: 0.20,
    eyeSquintLeft: 0.13, eyeSquintRight: 0.12,
  }),
});

/** Return a bounded, finite morph influence for unknown/legacy target names. */
export function facialPresetWeight(emotion, name) {
  if (typeof emotion !== 'string' || typeof name !== 'string') return 0;
  const value = Object.hasOwn(FACIAL_PRESETS, emotion)
    ? FACIAL_PRESETS[emotion][name] : undefined;
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
