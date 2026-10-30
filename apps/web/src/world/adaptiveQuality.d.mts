export type QualityState = { base: number; scale: number; ambientOcclusion: boolean; elapsed: number; frames: number; cooldown: number; fps: number | null };
export declare const QUALITY: Readonly<{ targetFps: number; headroomFps: number; window: number; step: number; maxScale: number; settle: number }>;
export declare function createQuality(baseScale?: number): QualityState;
export declare function stepQuality(state: QualityState, seconds: number): { state: QualityState; changed: boolean };
