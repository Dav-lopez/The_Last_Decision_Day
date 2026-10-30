import type { City } from './cityLayout.mjs';
import type { PlanarPosition } from './movement.mjs';
export type CareerId = 'police' | 'soldier' | 'firefighter';
export type Career = Readonly<{
  id: CareerId; title: string; workplace: string; building: string; ranks: readonly string[]; pay: readonly number[];
  shiftsPerRank: number; duties: readonly string[]; hours: readonly [number, number] | readonly number[];
  uniform: Readonly<{ top: string; outfit: string; bottom: string; bottomColor: string; shoes: string; shoeColor: string }>;
}>;
export type TrainingRecord = { best: Partial<Record<CareerId, number>>; lastPaidAt: number | null };
export type CareerState = { career: CareerId | null; shifts: number; money: number; lastShiftAt: number | null; training?: TrainingRecord };
export declare const SHIFT_HOURS: number;
export declare const SHIFT_ENERGY: number;
export declare const CAREERS: Readonly<Record<CareerId, Career>>;
export declare const NO_CAREER: Readonly<CareerState>;
export declare function normalizeCareer(value: unknown): CareerState;
export declare function rankOf(state: CareerState): { index: number; title: string; nextTitle: string | null; shiftsToNext: number } | null;
export declare function joinCareer(state: CareerState, career: string): CareerState;
export declare function quitCareer(state: CareerState): CareerState;
export declare function workShift(state: CareerState, now: { minute: number; totalMinutes: number; energy: number }):
  { ok: false; reason: string } | { ok: true; state: CareerState; pay: number; duty: string; promoted: string | null; hours: number; energy: number };
export declare function workplaceCentre(city: City | null | undefined, career: string): { local: [number, number]; world: PlanarPosition; building: City['buildings'][number] } | null;
export declare function readCareer(characterId: string, storage?: Pick<Storage, 'getItem'>): CareerState;
export declare function writeCareer(characterId: string, state: CareerState, storage?: Pick<Storage, 'setItem'>): boolean;
