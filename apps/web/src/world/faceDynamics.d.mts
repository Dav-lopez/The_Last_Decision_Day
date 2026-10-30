/** Stateful, bounded facial morph dynamics. */
export type FacialMorphState = { value: number; velocity: number };
export declare function facialMorphFrequency(name: string): number;
export declare function advanceFacialMorph(
  previous: FacialMorphState | undefined,
  target: number,
  seconds: number,
  name?: string,
): FacialMorphState;
