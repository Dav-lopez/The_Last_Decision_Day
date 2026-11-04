import type { PlanarPosition } from './movement.mjs';
export type VehicleKind = 'sedan' | 'cruiser' | 'fire-engine';
export type SirenPattern = 'wail' | 'growl';
export type VehicleSpec = Readonly<{
  kind: VehicleKind; name: string; halfWidth: number; halfLength: number;
  maxForwardSpeed: number; maxReverseSpeed: number; acceleration: number; reverseAcceleration: number;
  brakeDeceleration: number; coastDeceleration: number; wheelbase: number; maxSteerAngle: number;
  handbrakeDeceleration: number; handbrakeYaw: number; hornPitch: number; siren: SirenPattern | null;
}>;
export declare const VEHICLE_SPECS: Readonly<Record<VehicleKind, VehicleSpec>>;
export declare const CAREER_VEHICLES: Readonly<{
  police: Readonly<{ kind: 'cruiser'; career: 'police'; job: string }>;
  firefighter: Readonly<{ kind: 'fire-engine'; career: 'firefighter'; job: string }>;
}>;
type Sized = { kind?: VehicleKind; x: number; z: number; rotation?: number };
export declare function vehicleSpec(carOrKind: VehicleKind | { kind?: VehicleKind } | null | undefined): VehicleSpec;
export declare function vehicleSize(car: { kind?: VehicleKind } | null | undefined): { halfWidth: number; halfLength: number };
export declare function vehicleCareer(kind: VehicleKind | undefined): 'police' | 'firefighter' | null;
export declare function mayDrive(kind: VehicleKind | undefined, career: string | null | undefined): { ok: boolean; reason: string };
export declare function footprintSamples(car: Sized, margin?: number, spacing?: number): PlanarPosition[];
export declare function distanceToVehicle(car: Sized, point: PlanarPosition): number;
export declare function stationBay(door: PlanarPosition | null | undefined, kind: VehicleKind, isFree: (x: number, z: number) => boolean,
  options?: { along?: PlanarPosition | null; maxRadius?: number; margin?: number; step?: number; doorClearance?: number }): { x: number; z: number; rotation: number } | null;
export declare function sirenFrequency(pattern: SirenPattern | null | undefined, seconds: number): number | null;
export declare function beaconPhase(kind: VehicleKind, seconds: number): { left: boolean; right: boolean; white: boolean };
export declare function streetDirection(roads: ReadonlyArray<{ points: number[][] }> | null | undefined, point: PlanarPosition): PlanarPosition | null;
