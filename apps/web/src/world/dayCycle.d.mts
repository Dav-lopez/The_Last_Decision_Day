export type DayLight = { golden: number; dusk: number; night: number; sun: number; sky: number; sunColour: string; ground: string; haze: string; skyBlend: number; skyBrightness: number; glow: number };
export declare const DAY_LIGHT: Readonly<Record<string, Readonly<Record<string, number | string>>>>;
export declare function mixColour(a: string, b: string, t: number): string;
export declare function dayPhase(minute: number): { golden: number; dusk: number; night: number };
export declare function dayLight(minute: number): DayLight;
export declare function lightKey(minute: number): string;
