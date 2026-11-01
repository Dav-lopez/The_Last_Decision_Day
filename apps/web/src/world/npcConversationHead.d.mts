export type NpcConversationHeadPose = { pitch: number; roll: number };
export type NpcConversationHeadContext = {
  talking?: boolean;
  speaking?: boolean;
  elapsed?: number;
  duration?: number;
  mood?: 'neutral' | 'happy' | 'sad' | 'angry';
  moving?: boolean;
  flinch?: number;
};
export declare function npcConversationHeadTarget(context?: NpcConversationHeadContext): NpcConversationHeadPose;
export declare function stepNpcConversationHead(
  previous: NpcConversationHeadPose | null,
  target: NpcConversationHeadPose | null,
  seconds: number,
): NpcConversationHeadPose;
