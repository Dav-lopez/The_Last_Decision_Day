/** Signed, bounded horizontal eye focus for a nearby player. */
export declare function npcAttentionGaze(
  npc: { x: number; z: number } | null,
  player: { x: number; z: number } | null,
  heading: number,
): number;
