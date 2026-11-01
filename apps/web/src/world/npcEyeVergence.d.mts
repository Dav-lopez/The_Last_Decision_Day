/** Bounded inward gaze offset for each eye when an NPC looks at a nearby player. */
export declare function npcEyeVergence(
  npc: { x: number; z: number } | null,
  player: { x: number; z: number } | null,
  heading: number,
): number;
