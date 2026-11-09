import type { Scene, TransformNode } from '@babylonjs/core';
export declare function createNpcHeadRig(scene: Scene, holder: TransformNode): {
  setYaw: (yaw: number) => void;
  setPose: (pose: { yaw: number; pitch: number; roll: number }) => void;
  /** A spoken gesture (nod, shake, tilt) layered on top; zeros clear it. Limited to ±0.3 yaw, ±0.22 pitch, ±0.12 roll. */
  setGesture: (angles: { yaw: number; pitch: number; roll: number } | null) => void;
  dispose: () => void;
};
