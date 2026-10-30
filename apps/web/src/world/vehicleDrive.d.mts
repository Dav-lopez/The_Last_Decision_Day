import type { PlanarPosition } from './movement.mjs';
export type CarState = { x: number; z: number; rotation: number; speed: number };
export type DriveInput = { throttle: number; steer: number };
export declare const VEHICLE: Readonly<{
  maxForwardSpeed: number; maxReverseSpeed: number; acceleration: number; reverseAcceleration: number;
  brakeDeceleration: number; coastDeceleration: number; wheelbase: number; maxSteerAngle: number;
  parkedSpeed: number; exitClearance: number;
}>;
export declare function vehicleForward(rotation: number): PlanarPosition;
export declare function carLocalToWorld(car: CarState, localX: number, localZ: number): PlanarPosition;
export declare function driveInput(keys: ReadonlySet<string>): DriveInput;
export declare function vehicleBlocked(car: CarState, otherCars?: ReadonlyArray<CarState>): boolean;
export declare function stepVehicle(car: CarState, input: DriveInput, seconds: number,
  otherCars?: ReadonlyArray<CarState>): CarState & { collided: boolean };
export declare function canExitVehicle(car: CarState): boolean;
export declare function vehicleExitPosition(car: CarState, allCars: ReadonlyArray<CarState>): PlanarPosition | null;
export declare function chaseCameraAlpha(rotation: number): number;
export declare function speedKmh(speed: number): number;
