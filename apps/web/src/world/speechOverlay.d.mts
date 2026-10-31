export type SpeechOverlay = { elapsed: number; weight: number };
export function stepSpeechOverlay(previous: SpeechOverlay, speaking: boolean, seconds: number): SpeechOverlay;
