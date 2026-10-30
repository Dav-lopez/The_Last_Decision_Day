import type { PlanarPosition } from './movement.mjs';
export type NpcLook = { skin: string; hair: string; outfit: string };
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
