import type { SpeechCue } from '../npcSpeechCues.mjs';
export type RemoteFacialReaction = { emotion: 'neutral' | 'happy'; speakingUntil: number; expiresAt: number; startedAt: number; speechCues: ReadonlyArray<SpeechCue> };
export type RemoteFacialPose = { emotion: 'neutral' | 'happy'; speaking: boolean };
export type RemoteSpeechTrack = { elapsed: number; cues: ReadonlyArray<SpeechCue> };
export function initialRemoteFacialReaction(): RemoteFacialReaction;
export function remoteMessageReaction(previous: RemoteFacialReaction, text: string, now: number): RemoteFacialReaction;
export function remoteEmoteReaction(previous: RemoteFacialReaction, emote: string, now: number): RemoteFacialReaction;
export function remoteFacialPose(reaction: RemoteFacialReaction, now: number, visible: boolean): RemoteFacialPose;
export function remoteSpeechTrack(reaction: RemoteFacialReaction, now: number, visible: boolean): RemoteSpeechTrack;
