import type { AudioSettings } from './director.mjs';
export declare const AUDIO_DEFAULTS: Readonly<AudioSettings>;
export declare function normalizeAudioSettings(value: unknown): AudioSettings;
export declare function readAudioSettings(storage?: Storage): AudioSettings;
export declare function writeAudioSettings(value: AudioSettings, storage?: Storage): boolean;
