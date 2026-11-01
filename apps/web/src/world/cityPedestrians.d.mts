import type { RoadGraph, TrafficSignal } from './cityTraffic.mjs';
export type Walker = { id: number; look: number; edge: number; forward: boolean; s: number; side: 1 | -1; pace: number; waiting: boolean;
  crossing: { from: { x: number; z: number }; to: { x: number; z: number }; t: number } | null };
export type Crowd = { people: Walker[]; random: () => number };
export type WalkerPose = { id: number; look: number; waiting: boolean; pace: number; crossing: boolean; x: number; z: number; dx: number; dz: number; heading: number };
export declare const WALK: Readonly<{ minSpeed: number; maxSpeed: number; kerb: number; waitAt: number; respawnClear: number; radius: number }>;
export declare function pavementOffsets(graph: RoadGraph, isInside?: (x: number, z: number) => boolean): Array<number | null>;
export declare function pedestrianPose(graph: RoadGraph, offsets: ReadonlyArray<number | null>, walker: Walker | Omit<Walker, 'id' | 'look' | 'pace' | 'waiting'>): { x: number; z: number; dx: number; dz: number; heading: number };
export declare function createPedestrians(graph: RoadGraph, offsets: ReadonlyArray<number | null>, count: number, seed?: number, avoid?: ReadonlyArray<{ x: number; z: number }>): Crowd;
export declare function stepPedestrians(graph: RoadGraph, offsets: ReadonlyArray<number | null>, crowd: Crowd, seconds: number,
  options?: { signals?: Map<string, TrafficSignal> | null; time?: number; focus?: ReadonlyArray<{ x: number; z: number }> }): Crowd;
export declare function pedestrianPoses(graph: RoadGraph, offsets: ReadonlyArray<number | null>, crowd: Crowd): WalkerPose[];
