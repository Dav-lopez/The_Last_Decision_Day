export type NpcFaceContext = {
  talking?: boolean;
  emotion?: 'neutral' | 'happy' | 'sad' | 'angry';
  nearby?: boolean;
  moving?: boolean;
  flinch?: number;
  blink?: { left: number; right: number };
  /** Signed lateral eye focus in [-0.55, 0.55], relative to body heading. */
  gaze?: number;
  /** Inward binocular offset in [0, 0.065] for nearby player focus. */
  vergence?: number;
  /** Strength of the player's presence in the NPC's forward listening cone, in [0, 1]. */
  attention?: number;
  /** Seconds since the currently displayed dialogue line began. */
  speechElapsed?: number;
  /** Duration of the active line, used for finite sentence-ending facial movement. */
  speechDuration?: number;
  /** Cached question/exclamation ending; no text parsing during rendering. */
  prosody?: 'none' | 'question' | 'exclaim';
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
