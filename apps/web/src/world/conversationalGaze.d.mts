/** Bounded, deterministic bilateral gaze while a rigged avatar is speaking. */
export function conversationalGazeTarget(name: string, elapsed: number, fade: number): number;
/** Choose speech gaze or neutral idle gaze; movement/emotion suppress both. */
export function avatarGazeTarget(
  name: string, idleElapsed: number, emotion: string, speed: number,
  speaking: boolean, speechElapsed: number, speechWeight: number,
): number;
