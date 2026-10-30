export type Look = {
  body: string; skin: string; hair: string; hairStyle: string; facialHair: string;
  top: string; outfit: string; bottom: string; bottomColor: string; shoes: string; shoeColor: string;
};
export type LookChoice = { id: string; label: string; hex: string };
export type StyleChoice = { id: string; label: string; model?: string };
export type ColourPart = 'skin' | 'hair' | 'outfit' | 'bottomColor' | 'shoeColor';
export type StylePart = 'body' | 'hairStyle' | 'facialHair' | 'top' | 'bottom' | 'shoes';
export declare const LOOKS: Readonly<Record<ColourPart, readonly LookChoice[]>>;
export declare const STYLES: Readonly<Record<StylePart, readonly StyleChoice[]>>;
export declare const DEFAULT_LOOK: Readonly<Look>;
export declare const BODY_DEFAULTS: Readonly<Record<string, Partial<Look>>>;
export declare function normalizeLook(value: unknown): Look;
export declare function colorFor(part: ColourPart, id: string): string;
export declare function modelFor(look: Partial<Look> | null | undefined): string;
export declare function withBody(look: Partial<Look>, body: string): Look;
export type Zone = 'top' | 'upper-arm' | 'forearm' | 'midriff' | 'waist' | 'thigh' | 'knee' | 'shin' | 'lower-shin' | 'ankle' | 'foot' | 'sole';
export declare const ZONES: readonly Zone[];
export declare const ZONE_MATERIALS: Readonly<Record<Zone, string>>;
export type ZonePaint = { colour: string; skin: boolean; roughness: number };
export declare function dressZones(look: Partial<Look>): {
  zones: Record<Zone, ZonePaint>; skirt: { colour: string; roughness: number } | null;
  hair: string[]; skin: string; hairColour: string;
};
export declare function readLook(characterId: string, storage?: Pick<Storage, 'getItem'>): Look;
export declare function writeLook(characterId: string, look: Partial<Look>, storage?: Pick<Storage, 'setItem'>): boolean;
