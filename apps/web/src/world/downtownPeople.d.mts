import type { PlanarPosition } from './movement.mjs';
import type { NpcLook } from './npcLayout.mjs';
export type DowntownNpcId = 'priya' | 'dee' | 'brooks';
export type DowntownRegular = Readonly<{ npc: DowntownNpcId; resident: string; anchor: 'stop' | 'pitch' | 'firefighter'; from: number; until: number; look: Readonly<NpcLook> }>;
export type PlacedRegular = Readonly<{
  id: string; npc: DowntownNpcId; look: Readonly<NpcLook>;
  route: Readonly<{ kind: 'stand'; at: Readonly<{ x: number; z: number }>; facing: number }>;
  speed: number; startOffset: number; from: number; until: number; talk: Readonly<{ x: number; z: number }>; solo: true;
}>;
export declare const DOWNTOWN_REGULARS: ReadonlyArray<DowntownRegular>;
export declare const KEEP_CLEAR: Readonly<{ stop: number; workplace: number; pitchMargin: number }>;
export declare const TALK_GAP: number;
export declare function offTraffic(roads: ReadonlyArray<{ kind: string; width: number; points: number[][] }> | null | undefined, x: number, z: number, margin?: number): boolean;
export declare function standNear(anchor: { x: number; z: number } | null | undefined, prefer: { x: number; z: number } | null | undefined,
  isFree?: (x: number, z: number) => boolean, distance?: number): { at: { x: number; z: number }; talk: { x: number; z: number }; facing: number } | null;
export declare function placeDowntownRegulars(sites?: {
  stop?: { x: number; z: number; dx?: number; dz?: number; awayX?: number; awayZ?: number } | null;
  pitch?: { x: number; z: number; halfLength: number; halfWidth: number } | null;
  doors?: ReadonlyMap<string, PlanarPosition> | null;
  isFree?: (x: number, z: number) => boolean;
}): PlacedRegular[];
export declare function regularIsOut(regular: { from: number; until: number }, minute: number): boolean;
export declare function downtownTalkSpot(placed: ReadonlyArray<PlacedRegular> | null | undefined, minute: number, from?: { x: number; z: number } | null): { id: DowntownNpcId; x: number; z: number } | null;
