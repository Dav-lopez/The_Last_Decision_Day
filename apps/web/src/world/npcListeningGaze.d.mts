/** Visibility-weighted attention toward a nearby player in the forward cone. */
export declare function npcListeningAttention(
  npc: { x: number; z: number } | null,
  player: { x: number; z: number } | null,
  heading: number,
): number;
/** Signed, low-amplitude horizontal fixation offset for an idle listener. */
export declare function npcListeningOffset(elapsed: number, attention: number, active: boolean): number;
/** Low-amplitude downward fixation offset for an idle listener. */
export declare function npcListeningDown(elapsed: number, attention: number, active: boolean): number;
