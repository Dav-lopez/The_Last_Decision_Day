import type { CarFootprint, PersonCircle, PlanarPosition } from './movement.mjs';
export declare function stepLocomotion(position: PlanarPosition, keys: ReadonlySet<string>, seconds: number,
  sprintEnabled: boolean, cameraForward?: PlanarPosition, cars?: ReadonlyArray<CarFootprint>, people?: ReadonlyArray<PersonCircle>): {
    position: PlanarPosition; speed: number; moving: boolean; motion: 'idle' | 'walk' | 'run';
  };
