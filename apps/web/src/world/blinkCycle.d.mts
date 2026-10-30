export type BlinkState = { elapsed: number; count: number };
export type BlinkFrame = BlinkState & { left: number; right: number };
export function stepBlink(state: BlinkState, seconds: number): BlinkFrame;
