/** Bounded text-derived facial articulation cues; not phoneme/audio lip-sync. */
export type SpeechCue = { start: number; end: number; open: number; press: number };
export function buildNpcSpeechCues(line: unknown, duration: number): SpeechCue[];
export function npcSpeechCueWeight(name: string, elapsed: number, cues: ReadonlyArray<SpeechCue>): number;
