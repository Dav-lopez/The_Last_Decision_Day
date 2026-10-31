import type { Scene, TransformNode } from '@babylonjs/core';
import type { EmotionHeadPose } from './emotionalHeadPose.mjs';
export type EmotionalHeadRig = {
  setPose: (pose: EmotionHeadPose) => void;
  dispose: () => void;
};
/** Additive, animation-safe Head-bone facial pose; inert for legacy rigs without Head. */
export declare function createEmotionalHeadRig(scene: Scene, holder: TransformNode): EmotionalHeadRig;
