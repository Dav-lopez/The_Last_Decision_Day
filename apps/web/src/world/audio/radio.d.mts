import type { StationId } from './radioDial.mjs';
export type { StationId } from './radioDial.mjs';
export { STATION_IDS, nextStation, readRadioStation, writeRadioStation } from './radioDial.mjs';
export type RadioSong = { title: string; artist: string; root: number; chords: number[][]; melody: (number | null)[][]; comp: string; lead: string; beat: 'pop' | 'lofi' | 'swing' | 'synth' };
export type RadioStation = { id: StationId; name: string; short: string; genre: string; bpm: number; motif: { at: number; n: number }[]; motifInstrument: string; lines: string[]; songs: RadioSong[] };
export type RadioNote = { frequency: number; duration: number; gain: number; instrument: string };
export type RadioProgram =
  | { kind: 'song'; station: StationId; songIndex: number; title: string; artist: string; songStep: number; remaining: number }
  | { kind: 'ident'; station: StationId; songIndex: number; identStep: number; line: string; next: string };
export declare const STATIONS: readonly RadioStation[];
export declare function frequency(midi: number): number;
export declare function stationById(id: string | null | undefined): RadioStation | null;
export declare function radioStepSeconds(id: string | null | undefined): number;
export declare function programLength(id: string | null | undefined): number;
export declare function programAt(id: string | null | undefined, step: number): RadioProgram | null;
export declare function tuneInStep(id: string | null | undefined, nowMs: number): number;
export declare function radioStep(id: string | null | undefined, step: number, mood?: { intensity?: number }): RadioNote[];
