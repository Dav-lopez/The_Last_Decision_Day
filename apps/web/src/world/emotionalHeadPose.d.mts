/** Local Head-bone rotations, in radians, additive to authored body clips. */
export type EmotionHeadPose = { pitch: number; roll: number };
export declare function emotionHeadTarget(
  emotion: string, speed?: number, action?: string | null,
): EmotionHeadPose;
export declare function stepEmotionHeadPose(
  previous: EmotionHeadPose, target: EmotionHeadPose, seconds: number,
): EmotionHeadPose;
