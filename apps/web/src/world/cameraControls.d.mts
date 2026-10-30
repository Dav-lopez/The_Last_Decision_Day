import type { ArcRotateCamera } from '@babylonjs/core';
export type CameraMode = 'follow' | 'overhead' | 'indoor';
export declare const CAMERA_PRESETS: Readonly<Record<CameraMode, Readonly<{
  radius: number; beta: number; minRadius: number; maxRadius: number; minBeta: number; maxBeta: number;
}>>>;
export declare function createCameraControls(camera: ArcRotateCamera): {
  setMode(mode: CameraMode, reset?: boolean): void;
  cancel(): void;
  follow(position: { x: number; z: number }, seconds: number): void;
  update(seconds: number): void;
  zoom(direction: 'in' | 'out'): void;
  reset(): void;
};
