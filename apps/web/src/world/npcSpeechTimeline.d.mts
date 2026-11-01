import type { NpcSpeechProsody } from './npcSpeechProsody.mjs';
export type NpcSpeechMood = 'neutral' | 'happy' | 'sad';
export type NpcSpeechCue = { start: number; end: number; open: number; press: number };
export type NpcSpeechState = {
  id: string | null;
  mood: NpcSpeechMood;
  elapsed: number;
  duration: number;
  /** Cached ending inflection, independent of the character's emotional mood. */
  prosody: NpcSpeechProsody;
  /** Cached bounded mouth/closure timeline derived from the displayed text. */
  cues: ReadonlyArray<NpcSpeechCue>;
};
/** Estimate a bounded mouth-animation window from a displayed dialogue line. */
export declare function npcSpeechDuration(line: unknown): number;
/** Start or restart articulation for a new line, preserving the selected resident. */
export declare function beginNpcSpeech(
  id: string | null, mood?: NpcSpeechMood, line?: string,
): NpcSpeechState;
/** Advance once per scene frame; invalid and large deltas are clamped. */
export declare function advanceNpcSpeech(state: NpcSpeechState, seconds: number): NpcSpeechState;
export declare function isNpcSpeaking(state: NpcSpeechState): boolean;
/** Prevent ambient Talk from reactivating a selected resident's finished line. */
export declare function npcShouldArticulate(
  state: NpcSpeechState, residentId: string, ambientTalking?: boolean,
): boolean;
