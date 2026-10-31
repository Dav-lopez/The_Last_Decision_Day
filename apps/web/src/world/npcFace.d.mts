export type NpcFaceContext = {
  talking?: boolean;
  emotion?: 'neutral' | 'happy' | 'sad';
  nearby?: boolean;
  moving?: boolean;
  flinch?: number;
  blink?: { left: number; right: number };
  /** Signed lateral eye focus in [-0.55, 0.55], relative to body heading. */
  gaze?: number;
  /** Seconds since the currently displayed dialogue line began. */
  speechElapsed?: number;
  /** Precomputed dialogue articulation; absent for ambient NPC chatter. */
  speechCues?: ReadonlyArray<{ start: number; end: number; open: number; press: number }>;
};
export type NpcMorph = { name: string; influence: number };
export type NpcFaceState = { elapsed: number; motions: Map<string, { value: number; velocity: number }>; frame: Map<string, number> };
export declare function collectNpcFaceTargets(meshes: ReadonlyArray<{ morphTargetManager?: { numTargets: number; getTarget(index: number): NpcMorph } | null }>): NpcMorph[];
export declare function initialNpcFace(index: number): NpcFaceState;
export declare function npcFaceTarget(name: string, elapsed: number, context?: NpcFaceContext): number;
export declare function advanceNpcFace(state: NpcFaceState, seconds: number, targets: ReadonlyArray<NpcMorph>, context?: NpcFaceContext): NpcFaceState;
export declare function resetNpcFace(state: NpcFaceState, targets: ReadonlyArray<NpcMorph>): NpcFaceState;
