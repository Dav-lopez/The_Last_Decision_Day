export type AudioCue = 'notice'|'message'|'talk'|'door'|'car'|'bus'|'bell'|'food'|'wake'|'achievement'|'kick'|'whistle'|'goal'|'save'|'jump'|'land'|'shift'|'promotion'|'horn'|'checkpoint'|'dispatch'|'map'|'chat'|'emote'|'shot'|'rifle'|'spray'|'ding'|'reload';
export type AudioStatus = 'off' | 'running' | 'suspended' | 'unavailable';
export type AudioSettings = { master: number; music: number; effects: number; ambience: number; muted: boolean };
export type AudioWorld = { location?: 'street'|'home'|'school'|'city'|'pitch'; match?: boolean; speed?: number; drivingSpeed?: number|null; reading?: boolean; paused?: boolean; evening?: boolean };
export declare function createGameAudio(options?: { createContext?: () => AudioContext; onStatus?: (status: AudioStatus) => void; onCue?: (cue: AudioCue) => void }): {
  enable(): Promise<boolean>; disable(): void; setSettings(value: AudioSettings): void; setHidden(hidden: boolean): void;
  cue(name: AudioCue): void;
  update(world: AudioWorld): void; dispose(): void;
};
export type GameAudio = ReturnType<typeof createGameAudio>;
