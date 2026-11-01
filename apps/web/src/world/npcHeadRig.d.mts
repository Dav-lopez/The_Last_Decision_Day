import type { Scene, TransformNode } from '@babylonjs/core';
export declare function createNpcHeadRig(scene: Scene, holder: TransformNode): {
  setYaw: (yaw: number) => void;
  setPose: (pose: { yaw: number; pitch: number; roll: number }) => void;
  dispose: () => void;
};
