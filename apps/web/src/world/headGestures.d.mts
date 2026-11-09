export type HeadGesture = 'nod' | 'shake' | 'tilt';
export type HeadAngles = { yaw: number; pitch: number; roll: number };
export declare const HEAD_GESTURES: Readonly<Record<HeadGesture, Readonly<{ seconds: number; beats?: number; pitch?: number; yaw?: number; roll?: number }>>>;
export declare const HEAD_GESTURE_LIMITS: Readonly<HeadAngles>;
export declare function headGestureFor(text: string | null | undefined): HeadGesture | null;
export declare function headGestureOffset(gesture: HeadGesture | null | undefined, elapsed: number): HeadAngles;
