export type EmotionBlinkState = {
  emotion: string;
  kind: 'fear' | 'embarrassed' | null;
  elapsed: number;
  cooldown: number;
  left: number;
  right: number;
};
export function initialEmotionBlink(): EmotionBlinkState;
export function stepEmotionBlink(previous: EmotionBlinkState, emotion: string, seconds: number): EmotionBlinkState;
export function combineBlinkFrames(natural: { left: number; right: number }, reflex: { left: number; right: number }): { left: number; right: number };
