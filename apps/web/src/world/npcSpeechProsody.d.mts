export type NpcSpeechProsody = 'none' | 'question' | 'exclaim';
/** Classify the final punctuation once when a new NPC line begins. */
export declare function classifyNpcSpeechProsody(line: unknown): NpcSpeechProsody;
/** Bounded, allocation-free per-frame morph weight for the end of a line. */
export declare function npcSpeechProsodyWeight(
  name: string, elapsed: number, duration: number, prosody: NpcSpeechProsody,
): number;
