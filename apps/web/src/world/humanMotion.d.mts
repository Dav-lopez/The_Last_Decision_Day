export type HumanMotion = 'idle' | 'walk' | 'run';
export type HumanWeights = Record<HumanMotion, number>;
export declare const HUMAN_CROSSFADE_SECONDS: number;
export declare const HUMAN_WALK_SPEED: number;
export declare const HUMAN_RUN_SPEED: number;
export declare const HUMAN_MOTIONS: readonly HumanMotion[];
export declare function classifyHumanMotion(speed: number): HumanMotion;
export declare function blendHumanWeights(from: HumanWeights, target: HumanMotion, elapsed: number, duration?: number): HumanWeights;
export declare function smoothHumanHeading(current: number, target: number, seconds: number, responsiveness?: number): number;
