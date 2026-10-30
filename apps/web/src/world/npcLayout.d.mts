import type { PlanarPosition } from './movement.mjs';
export type NpcLook = { skin: string; hair: string; outfit: string } & Partial<import('./appearance.mjs').Look>;
export type NpcRoute =
  | { kind: 'segment'; a: Readonly<PlanarPosition>; b: Readonly<PlanarPosition> }
  | { kind: 'stand'; at: Readonly<PlanarPosition>; facing: number };
export type Neighbor = Readonly<{ id: string; look: Readonly<NpcLook>; route: Readonly<NpcRoute>; speed: number; startOffset: number; from: number; until: number }>;
export type NpcPose = { x: number; z: number; dx: number; dz: number; moving: boolean };
export declare const PERSON_RADIUS: number;
export declare const KEEP_RIGHT: number;
export declare function carAhead(npc: Neighbor, walked: number, cars: ReadonlyArray<{ x: number; z: number; rotation: number }>): boolean;
export declare const NEIGHBORS: ReadonlyArray<Neighbor>;
export declare function isOut(npc: Neighbor, minute: number): boolean;
export declare function routePose(npc: Neighbor, walked: number): NpcPose;
export declare function shouldYield(pose: NpcPose, obstacles: ReadonlyArray<PlanarPosition & { radius?: number }>): boolean;
export declare function personHeading(dx: number, dz: number): number;
export type MovingCar = { x: number; z: number; rotation: number; speed?: number };
export declare const DODGE_DISTANCE: number;
export declare function inRoad(point: PlanarPosition): boolean;
export declare function inCarPath(x: number, z: number, cars: ReadonlyArray<MovingCar>, horizon?: number, margin?: number): boolean;
export declare function carComing(npc: Neighbor, walked: number, cars: ReadonlyArray<MovingCar>): boolean;
export declare function crossingPace(pose: PlanarPosition, cars: ReadonlyArray<MovingCar>): number;
export declare function dodgeFrom(pose: PlanarPosition, cars: ReadonlyArray<MovingCar>): PlanarPosition | null;
