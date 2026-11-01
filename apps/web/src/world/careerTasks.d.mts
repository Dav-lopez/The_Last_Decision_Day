import type { RoadGraph } from './cityTraffic.mjs';
import type { CareerId } from './careers.mjs';
export type TaskSpec = Readonly<{ id: string; title: string; spacing: number; onFoot: boolean; brief: string; stops: readonly string[]; signOff: string }>;
export type TaskStop = { x: number; z: number; line: string; final: boolean };
export type CareerTask = {
  career: CareerId; id: string; title: string; brief: string; onFoot: boolean; stops: TaskStop[]; next: number;
  elapsed: number; par: number; length: number; done: boolean; warnedOnFoot: boolean;
};
export type TaskEvent = { type: 'stop'; index: number; line: string } | { type: 'done' } | { type: 'on-foot' };
export declare const TASK_REACH: number;
export declare const TASK_REACH_CAR: number;
export declare const TASKS: Readonly<Record<CareerId, TaskSpec>>;
export declare function planTask(career: string, graph: RoadGraph | null | undefined, door: { x: number; z: number } | null | undefined,
  options?: { seed?: number; collider?: { blockedLocal(x: number, z: number): boolean } | null }): CareerTask | null;
export declare function stepTask(task: CareerTask, at: { x: number; z: number; seconds?: number; driving?: boolean }): { task: CareerTask; event: TaskEvent | null };
export declare function taskResult(task: CareerTask | null, basePay: number): { band: 'outstanding' | 'good' | 'late'; title: string; bonus: number; seconds: number; par: number };
export declare function taskStatus(task: CareerTask | null): { title: string; next: string; done: number; total: number; left: number; onFoot: boolean } | null;
export declare function formatClock(seconds: number): string;
