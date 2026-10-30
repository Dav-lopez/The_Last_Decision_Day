export type NpcFaceContext = {
  talking?: boolean;
  emotion?: 'neutral' | 'happy' | 'sad';
  nearby?: boolean;
  moving?: boolean;
  flinch?: number;
  blink?: { left: number; right: number };
};
export type NpcMorph = { name: string; influence: number };
export type NpcFaceState = { elapsed: number; motions: Map<string, { value: number; velocity: number }> };
export declare function collectNpcFaceTargets(meshes: ReadonlyArray<{ morphTargetManager?: { numTargets: number; getTarget(index: number): NpcMorph } | null }>): NpcMorph[];
export declare function initialNpcFace(index: number): NpcFaceState;
export declare function npcFaceTarget(name: string, elapsed: number, context?: NpcFaceContext): number;
export declare function advanceNpcFace(state: NpcFaceState, seconds: number, targets: ReadonlyArray<NpcMorph>, context?: NpcFaceContext): NpcFaceState;
export declare function resetNpcFace(state: NpcFaceState, targets: ReadonlyArray<NpcMorph>): NpcFaceState;
