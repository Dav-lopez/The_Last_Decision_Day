import type { Emotion } from './facialEmotions';

/** Normalized effects that can be consumed by skin shaders and tear/sweat meshes. */
export type FacialEffects = { tears: number; blush: number; sweat: number; wateryEyes: number };
export const EMPTY_EFFECTS: FacialEffects = { tears: 0, blush: 0, sweat: 0, wateryEyes: 0 };
export function targetFacialEffects(emotion: Emotion, speed: number): FacialEffects {
  const crying = emotion === 'sad';
  const embarrassed = emotion === 'embarrassed';
  const exertion = Math.max(0, Math.min(1, (speed - 1.8) / 3.2));
  return {
    tears: crying ? 0.85 : 0,
    wateryEyes: crying ? 1 : 0,
    blush: embarrassed ? 0.75 : 0,
    sweat: Math.max(emotion === 'fear' ? 0.4 : 0, emotion === 'exerted' ? 0.75 : 0, exertion),
  };
}
export function smoothFacialEffects(current: FacialEffects, target: FacialEffects, seconds: number): FacialEffects {
  const t = 1 - Math.exp(-Math.max(0, seconds) * 2.5);
  return {
    tears: current.tears + (target.tears - current.tears) * t,
    wateryEyes: current.wateryEyes + (target.wateryEyes - current.wateryEyes) * t,
    blush: current.blush + (target.blush - current.blush) * t,
    sweat: current.sweat + (target.sweat - current.sweat) * t,
  };
}
