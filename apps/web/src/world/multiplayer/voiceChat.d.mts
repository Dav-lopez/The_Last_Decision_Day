import type { VoiceSignal } from './roomClient.mjs';
export type VoiceState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected';
export declare const VOICE_ICE: ReadonlyArray<{ urls: string }>;
export declare function proximityVolume(distance: number, sameLocation: boolean): number;
export type VoiceChat = {
  readonly state: VoiceState; readonly muted: boolean;
  start(): Promise<void>; accept(): Promise<void>; decline(): void; hangup(): void; setMuted(value: boolean): void;
  handle(signal: Pick<VoiceSignal, 'from' | 'kind' | 'payload'>): Promise<void>; dispose(): void;
};
export declare function createVoiceChat(options: {
  selfId: string; signal: (kind: VoiceSignal['kind'], payload: string) => Promise<void>;
  createPeer: (config: RTCConfiguration) => RTCPeerConnection; getMicrophone: () => Promise<MediaStream>;
  onRemoteStream?: (stream: MediaStream | null) => void; onState?: (state: VoiceState) => void;
}): VoiceChat;
