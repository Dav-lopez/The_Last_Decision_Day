export type Look = { skin: string; outfit: string; hair: string };
export type LookChoice = { id: string; label: string; hex: string };
export declare const LOOKS: Readonly<{ skin: readonly LookChoice[]; outfit: readonly LookChoice[]; hair: readonly LookChoice[] }>;
export declare const DEFAULT_LOOK: Readonly<Look>;
export declare function normalizeLook(value: unknown): Look;
export declare function colorFor(part: keyof Look, id: string): string;
export declare function readLook(characterId: string, storage?: Pick<Storage, 'getItem'>): Look;
export declare function writeLook(characterId: string, look: Look, storage?: Pick<Storage, 'setItem'>): boolean;
