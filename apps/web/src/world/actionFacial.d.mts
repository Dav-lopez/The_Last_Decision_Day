import type { ActionState } from './actionMixer.mjs';
/** Bounded timed speech-morph influence; returns zero for non-speaking actions. */
export declare function actionFacialWeight(name: string, action: ActionState | null, weight: number): number;
