export type GraphicsMode = 'auto' | 'performance' | 'quality';
export type GraphicsPreset = Readonly<{ id: GraphicsMode; title: string; description: string; scale: number; adaptive: boolean; ambientOcclusion: boolean }>;
export type PlayerSettings = { graphics: GraphicsMode; hintDismissed: boolean };
export declare const GRAPHICS_MODES: ReadonlyArray<GraphicsPreset>;
export declare function graphicsMode(id: unknown): GraphicsPreset;
export declare function readSettings(storage?: Pick<Storage, 'getItem'>): PlayerSettings;
export declare function writeSettings(settings: PlayerSettings, storage?: Pick<Storage, 'setItem'>): boolean;
export declare function progressKeys(characterId: string): string[];
export declare function resetProgress(characterId: string, storage?: Pick<Storage, 'getItem' | 'removeItem'>): number;
