export type NpcHeadAttentionContext = {
  moving?: boolean;
  talking?: boolean;
  flinch?: number;
};
export declare function npcHeadAttentionTarget(
  npc: { x: number; z: number } | null,
  player: { x: number; z: number } | null,
  heading: number,
  context?: NpcHeadAttentionContext,
): number;
export declare function stepNpcHeadAttention(current: number, target: number, seconds: number): number;
