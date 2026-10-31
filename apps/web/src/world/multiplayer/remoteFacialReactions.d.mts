export type RemoteFacialReaction = {
  emotion: 'neutral' | 'happy';
  speakingUntil: number;
  expiresAt: number;
};
export type RemoteFacialPose = { emotion: 'neutral' | 'happy'; speaking: boolean };
export function initialRemoteFacialReaction(): RemoteFacialReaction;
export function remoteMessageReaction(previous: RemoteFacialReaction, text: string, now: number): RemoteFacialReaction;
export function remoteEmoteReaction(previous: RemoteFacialReaction, emote: string, now: number): RemoteFacialReaction;
export function remoteFacialPose(reaction: RemoteFacialReaction, now: number, visible: boolean): RemoteFacialPose;
