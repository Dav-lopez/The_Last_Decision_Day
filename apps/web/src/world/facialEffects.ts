import type { Emotion } from './facialEmotions';
import { calculateFacialEffectTargets, stepFacialEffectWeights } from './facialEffectDynamics.mjs';

/** Normalized effects consumed by the skin, eyes, cheek and droplet materials. */
export type FacialEffects = { tears: number; blush: number; sweat: number; wateryEyes: number };
export const EMPTY_EFFECTS: FacialEffects = { tears: 0, blush: 0, sweat: 0, wateryEyes: 0 };

/** Keep the existing avatar API; effect targets remain driven by gameplay. */
export function targetFacialEffects(emotion: Emotion, speed: number): FacialEffects {
  return calculateFacialEffectTargets(emotion, speed);
}

/** Independent, frame-rate-stable attack/release rates for visible facial effects. */
export function smoothFacialEffects(current: FacialEffects, target: FacialEffects, seconds: number): FacialEffects {
  return stepFacialEffectWeights(current, target, seconds);
}
