export type FacialMorphState = { value: number; velocity: number };
/** Advance a named facial spring only once per frame, sharing its influence across meshes. */
export declare function advanceSharedFacialMorph(
  name: string,
  fallback: number,
  target: number,
  seconds: number,
  blink: { left: number; right: number } | null | undefined,
  motions: Map<string, FacialMorphState>,
  frameWeights: Map<string, number>,
): number;
