import type { SpeechCue } from './npcSpeechCues.mjs';
export type SpeechOverlay = { elapsed: number; weight: number };
export function stepSpeechOverlay(previous: SpeechOverlay, speaking: boolean, seconds: number): SpeechOverlay;
export function remoteCuedSpeechWeight(name: string, cues: ReadonlyArray<SpeechCue>, elapsed: number, fade: number): number;
