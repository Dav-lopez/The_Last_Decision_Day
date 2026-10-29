export type PlanarPosition = { x: number; z: number };
export declare const WORLD_RADIUS: number;
export declare const SCHOOL_DOOR: Readonly<PlanarPosition>;
export declare const SOLID_AREAS: ReadonlyArray<Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>>;
export declare function movementVector(keys: ReadonlySet<string>, cameraForward?: PlanarPosition): PlanarPosition;
export declare function stepPosition(position: PlanarPosition, keys: ReadonlySet<string>, elapsedSeconds: number, speed?: number, cameraForward?: PlanarPosition): PlanarPosition;
export declare function isNearSchool(position: PlanarPosition): boolean;
