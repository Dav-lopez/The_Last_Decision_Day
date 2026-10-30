export type FacialEffectWeights = { tears: number; blush: number; sweat: number; wateryEyes: number };
export function calculateFacialEffectTargets(emotion: string, speed: number): FacialEffectWeights;
export function stepFacialEffectWeights(
  current: FacialEffectWeights,
  target: FacialEffectWeights,
  seconds: number,
): FacialEffectWeights;
