export type NpcSpeechMood = 'neutral' | 'happy' | 'sad';
export type NpcSpeechState = {
  id: string | null;
  mood: NpcSpeechMood;
  elapsed: number;
  duration: number;
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
