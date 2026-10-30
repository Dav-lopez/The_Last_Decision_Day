import type { PlanarPosition } from './movement.mjs';
export declare function stepLocomotion(position: PlanarPosition, keys: ReadonlySet<string>, seconds: number,
  sprintEnabled: boolean, cameraForward?: PlanarPosition): {
    position: PlanarPosition; speed: number; moving: boolean; motion: 'idle' | 'walk' | 'run';
  };
