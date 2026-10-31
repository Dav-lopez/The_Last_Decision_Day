export type LoadTask = { id: string; label: string; weight: number; background?: boolean };
export type LoadTaskState = 'pending' | 'loading' | 'done' | 'failed';
export type LoadingSnapshot = {
  fraction: number;
  ready: boolean;
  canSkip: boolean;
  label: string;
  elapsed: number;
  tasks: { id: string; label: string; state: LoadTaskState }[];
  failed: string[];
  background: { id: string; label: string; fraction: number }[];
};
export type LoadingTracker = {
  start(id: string, at: number): void;
  progress(id: string, fraction: number, at: number): void;
  finish(id: string): void;
  fail(id: string): void;
  skip(): void;
  snapshot(at: number): LoadingSnapshot;
};
export declare const WORLD_LOAD_TASKS: readonly LoadTask[];
export declare const LOADING: Readonly<{ creepHalfLifeMs: number; creepCeiling: number; maxWaitMs: number; skipAfterMs: number; easeRate: number }>;
export declare const LOADING_TIPS: readonly string[];
export declare function creep(elapsedMs: number, halfLifeMs?: number, ceiling?: number): number;
export declare function easeProgress(displayed: number, target: number, seconds: number, rate?: number): number;
export declare function tipAt(elapsedMs: number, tips?: readonly string[], everyMs?: number): string;
export declare function createLoadingTracker(tasks?: readonly LoadTask[], now?: number): LoadingTracker;
