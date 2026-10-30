/** Facial emotion controls. Optional morph targets degrade gracefully on legacy GLBs. */
export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'fear' | 'embarrassed' | 'exerted';
export type FaceWeights = Record<string, number>;
export const FACE_PRESETS: Record<Emotion, FaceWeights> = {
  neutral: {},
  happy: { mouthSmileLeft: .75, mouthSmileRight: .75, cheekSquintLeft: .3, cheekSquintRight: .3 },
  sad: { mouthFrownLeft: .7, mouthFrownRight: .7, browInnerUp: .55, eyeSquintLeft: .18, eyeSquintRight: .18 },
  angry: { browDownLeft: .75, browDownRight: .75, mouthPressLeft: .55, mouthPressRight: .55 },
  fear: { eyeWideLeft: .75, eyeWideRight: .75, eyeLookUpLeft: .28, eyeLookUpRight: .28, browInnerUp: .65, jawOpen: .3 },
  embarrassed: { eyeLookDownLeft: .4, eyeLookDownRight: .4, mouthSmileLeft: .25, mouthSmileRight: .25 },
  exerted: { mouthOpen: .4, browDownLeft: .2, browDownRight: .2 },
};
export function faceTarget(emotion: Emotion, name: string): number {
  return Math.max(0, Math.min(1, FACE_PRESETS[emotion][name] ?? 0));
}
export function approachFace(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) * 9));
}
