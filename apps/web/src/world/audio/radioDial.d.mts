export type StationId = 'maple' | 'lowtide' | 'downtown' | 'pulse';
export declare const STATION_IDS: readonly StationId[];
export declare function isStation(id: unknown): id is StationId;
export declare function nextStation(current: string | null | undefined, dir?: number): StationId | null;
export declare function readRadioStation(storage?: Pick<Storage, 'getItem'>): StationId | null;
export declare function writeRadioStation(id: string | null, storage?: Pick<Storage, 'setItem'>): boolean;
