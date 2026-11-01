import type { PlanarPosition } from './movement.mjs';
export type CarState = { x: number; z: number; rotation: number; speed: number };
export type DriveInput = { throttle: number; steer: number; handbrake?: boolean; horn?: boolean };
export declare const VEHICLE: Readonly<{
  maxForwardSpeed: number; maxReverseSpeed: number; acceleration: number; reverseAcceleration: number;
  brakeDeceleration: number; coastDeceleration: number; wheelbase: number; maxSteerAngle: number;
  parkedSpeed: number; exitClearance: number; handbrakeDeceleration: number; handbrakeYaw: number;
}>;
export declare function vehicleForward(rotation: number): PlanarPosition;
export declare function carLocalToWorld(car: CarState, localX: number, localZ: number): PlanarPosition;
export declare function driveInput(keys: ReadonlySet<string>): DriveInput;
export declare function vehicleBlocked(car: CarState, otherCars?: ReadonlyArray<CarState>, people?: ReadonlyArray<{ x: number; z: number; radius?: number }>): boolean;
type People = ReadonlyArray<{ x: number; z: number; radius?: number }>;
export type VehicleBlocker = (car: CarState, otherCars: ReadonlyArray<CarState>, people: People) => boolean;
export declare function stepVehicle(car: CarState, input: DriveInput, seconds: number,
  otherCars?: ReadonlyArray<CarState>, people?: People, blocked?: VehicleBlocker): CarState & { collided: boolean };
export declare const TOWN_EXIT: Readonly<{ halfWidth: number; beyond: number; leaveAt: number; gateRange: number }>;
export declare function onExitRoad(point: PlanarPosition): boolean;
export declare function leavingTown(car: CarState): boolean;
export declare function footprintPoints(car: CarState): PlanarPosition[];
export declare function canExitVehicle(car: CarState): boolean;
export declare function vehicleExitPosition(car: CarState, allCars: ReadonlyArray<CarState>, isFree?: ((point: PlanarPosition) => boolean) | null): PlanarPosition | null;
export declare function chaseCameraAlpha(rotation: number): number;
export declare function speedKmh(speed: number): number;
