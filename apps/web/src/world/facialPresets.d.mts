export type FacialPresetEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'fear' | 'embarrassed' | 'exerted';
export declare const FACIAL_PRESETS: Readonly<Record<FacialPresetEmotion, Readonly<Record<string, number>>>>;
export declare function facialPresetWeight(emotion: string, name: string): number;
