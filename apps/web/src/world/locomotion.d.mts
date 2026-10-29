export type LocomotionState = 'idle' | 'walk' | 'run';
export type LocomotionWeights = Record<LocomotionState, number>;
export function locomotionState(speed: number): LocomotionState;
export function blendLocomotion(weights: LocomotionWeights, speed: number, deltaSeconds: number): LocomotionWeights;
export function turnTowards(current: number, target: number, deltaSeconds: number): number;
