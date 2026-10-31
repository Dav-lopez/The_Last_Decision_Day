import type { RoadGraph } from './cityTraffic.mjs';
export type RoutePoint = [number, number];
export declare function nearestOnRoads(graph: RoadGraph, x: number, z: number): { edge: number; s: number; x: number; z: number; distance: number } | null;
export declare function routeBetween(graph: RoadGraph, from: { x: number; z: number }, to: { x: number; z: number }, maxSnap?: number): { points: RoutePoint[]; length: number } | null;
export declare function polylineLength(points: ReadonlyArray<readonly [number, number]>): number;
export declare function formatDistance(metres: number): string;
