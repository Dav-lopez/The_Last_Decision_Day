import type { RoadGraph } from './cityTraffic.mjs';
import type { CareerId } from './careers.mjs';
export type TaskSpec = Readonly<{ id: string; title: string; spacing: number; onFoot: boolean; brief: string; stops: readonly string[]; signOff: string;
  hose?: Readonly<{ stop: number; arrive: string }>; drill?: Readonly<{ arrive: string }> }>;
/** `hose`: this stop is a fire to put out at (x, z), city-local. */
/** `drill`: a route-march checkpoint where you call the bearing to the next one (routeMarch.mjs). */
export type TaskStop = { x: number; z: number; line: string; final: boolean; hose?: { x: number; z: number; arrive: string }; drill?: { arrive: string } };
export type TaskBeat = 'hose' | 'bearing';
export type CareerTask = {
  career: CareerId; id: string; title: string; brief: string; onFoot: boolean; stops: TaskStop[]; next: number;
  elapsed: number; par: number; length: number; done: boolean; warnedOnFoot: boolean; beat: TaskBeat | null;
};
export type TaskEvent = { type: 'stop'; index: number; line: string } | { type: 'done' } | { type: 'beat'; beat: TaskBeat; index: number; line: string }
  | { type: 'on-foot'; reason: 'march' | 'hose' | 'sign-off' };
export declare const HOSE_SECONDS: number;
export declare const DRILL_SECONDS: number;
export declare const TASK_REACH: number;
export declare const TASK_REACH_CAR: number;
export declare const TASKS: Readonly<Record<CareerId, TaskSpec>>;
export declare function planTask(career: string, graph: RoadGraph | null | undefined, door: { x: number; z: number } | null | undefined,
  options?: { seed?: number; collider?: { blockedLocal(x: number, z: number): boolean } | null }): CareerTask | null;
export declare function stepTask(task: CareerTask, at: { x: number; z: number; seconds?: number; driving?: boolean }): { task: CareerTask; event: TaskEvent | null };
export declare function finishBeat(task: CareerTask): { task: CareerTask; event: TaskEvent | null };
export declare function taskResult(task: CareerTask | null, basePay: number): { band: 'outstanding' | 'good' | 'late'; title: string; bonus: number; seconds: number; par: number };
export declare function taskStatus(task: CareerTask | null): { title: string; next: string; done: number; total: number; left: number; onFoot: boolean; beat: TaskBeat | null } | null;
export declare function formatClock(seconds: number): string;
