import type { PlanarPosition } from './movement.mjs';
import type { PropBlocker, PropSite } from './propLayout.mjs';
export type FrontDoor = Readonly<{ id: string; own: boolean; x: number; z: number }>;
export type WallId = 'back' | 'front' | 'left' | 'right';
export declare const HOME_ORIGIN: Readonly<PlanarPosition>;
export declare const ROOM: Readonly<{ halfWidth: number; halfDepth: number; wallHeight: number; wallThickness: number }>;
export declare const DOOR_HALF_WIDTH: number;
export declare const FRONT_DOORS: ReadonlyArray<FrontDoor>;
export declare const HOME_FURNITURE: ReadonlyArray<PropSite>;
export declare const DOOR_LEAF: PropBlocker;
export declare const HOME_BLOCKERS: ReadonlyArray<PropBlocker>;
export declare const HOME_SPAWN: Readonly<PlanarPosition & { rotation: number }>;
export declare const HOME_EXIT_DOOR: Readonly<PlanarPosition>;
export declare const BED_SIDE: Readonly<PlanarPosition>;
export declare const HOME_WALLS: ReadonlyArray<Readonly<{ id: WallId; normal: Readonly<PlanarPosition> }>>;
export declare function streetDoorAt(position: PlanarPosition): FrontDoor | null;
export declare function atHomeExit(position: PlanarPosition): boolean;
export declare function streetSpawnFor(door: FrontDoor): PlanarPosition & { rotation: number };
export declare function isInsideHome(position: PlanarPosition): boolean;
export declare function homeBlocked(x: number, z: number): boolean;
export declare function stepHomeLocomotion(position: PlanarPosition, keys: ReadonlySet<string>, seconds: number,
  sprintEnabled: boolean, cameraForward?: PlanarPosition): {
    position: PlanarPosition; speed: number; moving: boolean; motion: 'idle' | 'walk' | 'run';
  };
export declare function wallsToFade(cameraPosition: PlanarPosition): WallId[];
