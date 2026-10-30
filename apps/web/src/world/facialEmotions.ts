/** Facial emotion controls. Optional morph targets degrade gracefully on legacy GLBs. */
import { FACIAL_PRESETS, facialPresetWeight } from './facialPresets.mjs';

export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'fear' | 'embarrassed' | 'exerted';
export type FaceWeights = Record<string, number>;
export const FACE_PRESETS: Record<Emotion, FaceWeights> = FACIAL_PRESETS;
export function faceTarget(emotion: Emotion, name: string): number {
  return facialPresetWeight(emotion, name);
}
export function approachFace(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) * 9));
}
