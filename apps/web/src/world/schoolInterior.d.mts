import type { PlanarPosition } from './movement.mjs';
import type { PropBlocker, PropSite } from './propLayout.mjs';
export type ClassDesk = Readonly<{ id: string; desk: PropSite; chair: PropSite }>;
export declare const SCHOOL_ORIGIN: Readonly<PlanarPosition>;
export declare const CLASSROOM: Readonly<{ halfWidth: number; halfDepth: number; wallHeight: number; wallThickness: number }>;
export declare const CLASSROOM_DOOR_HALF_WIDTH: number;
export declare const CLASS_DESKS: ReadonlyArray<ClassDesk>;
export declare const TEACHER_DESK: PropSite;
export declare const CLASSROOM_FURNITURE: ReadonlyArray<PropSite>;
export declare const CLASSROOM_BLOCKERS: ReadonlyArray<PropBlocker>;
export declare const CLASSROOM_SPAWN: Readonly<PlanarPosition & { rotation: number }>;
export declare const CLASSROOM_EXIT: Readonly<PlanarPosition>;
export declare const TEACHER_SPOT: Readonly<PlanarPosition>;
export declare const TEACHER_STANDS: Readonly<PlanarPosition>;
export declare const CHALKBOARD: Readonly<{ x: number; width: number; height: number; y: number }>;
export declare function isInsideClassroom(position: PlanarPosition): boolean;
export declare function classroomBlocked(x: number, z: number, people?: ReadonlyArray<{ x: number; z: number; radius?: number }>): boolean;
export declare function stepClassroomLocomotion(position: PlanarPosition, keys: ReadonlySet<string>, seconds: number,
  sprintEnabled: boolean, cameraForward?: PlanarPosition, people?: ReadonlyArray<{ x: number; z: number; radius?: number }>): {
    position: PlanarPosition; speed: number; moving: boolean; motion: 'idle' | 'walk' | 'run';
  };
export declare function atClassroomExit(position: PlanarPosition): boolean;
export declare function nearTeacher(position: PlanarPosition): boolean;
export declare function deskInReach(position: PlanarPosition): ClassDesk | null;
