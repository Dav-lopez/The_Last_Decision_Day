export type NpcAnimationGroup = { name: string };
export declare function findNpcLocomotionIndices(groups: ReadonlyArray<NpcAnimationGroup> | null | undefined):
  { idleIndex: number; walkIndex: number } | null;
export declare function selectNpcAnimationModel(preferred: string, usable: ReadonlyMap<string, unknown>):
  string | null;
