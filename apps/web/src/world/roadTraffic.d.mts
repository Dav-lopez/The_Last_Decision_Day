import type { OpenRoad } from './openRoad.mjs';
export type RoadCar = { id: number; paint: number; dir: 1 | -1; along: number; speed: number; cruise: number; parked: boolean };
export type RoadTraffic = { cars: RoadCar[]; random: () => number };
export type RoadCarPose = { id: number; paint: number; speed: number; x: number; z: number; rotation: number; dx: number; dz: number };
export declare const ROAD_TRAFFIC: Readonly<Record<string, number>>;
export declare function roadPoint(road: OpenRoad, along: number): { x: number; z: number; dx: number; dz: number; half: number };
export declare function trafficStretch(road: OpenRoad): { from: number; to: number };
export declare function roadCarPose(road: OpenRoad, car: Pick<RoadCar, 'along' | 'dir'>): { x: number; z: number; rotation: number; dx: number; dz: number };
export declare function createRoadTraffic(road: OpenRoad, count?: number, seed?: number): RoadTraffic;
export declare function laneGap(road: OpenRoad, car: RoadCar, cars: ReadonlyArray<RoadCar>, obstacles?: ReadonlyArray<{ x: number; z: number; radius?: number }>): number;
export declare function stepRoadTraffic(road: OpenRoad, traffic: RoadTraffic, seconds: number,
  obstacles?: ReadonlyArray<{ x: number; z: number; radius?: number }>, viewers?: ReadonlyArray<{ x: number; z: number }>): RoadTraffic;
export declare function roadTrafficPoses(road: OpenRoad, traffic: RoadTraffic): RoadCarPose[];
