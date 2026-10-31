import type { CareerState } from './careers.mjs';
import type { StoryState } from './storyChapters.mjs';
import type { NpcRelations } from './npcConversations.mjs';

type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type Progress = { version: number; savedAt: number; story: StoryState; career: CareerState; relations: NpcRelations };
export type ServerProgress = { savedAt: number; data: { version: number; story: StoryState; career: CareerState; relations: NpcRelations } };
export type ServerProgressResponse = { saved?: boolean; savedAt?: number; data?: unknown };
export declare const PROGRESS_VERSION: number;
export declare function normalizeProgress(value: unknown): Progress;
export declare function readProgressChangedAt(characterId: string, storage?: Pick<Storage, 'getItem'>): number;
export declare function markProgressChanged(characterId: string, now?: number, storage?: Pick<Storage, 'setItem'>): boolean;
export declare function collectProgress(characterId: string, storage?: ProgressStorage): Progress;
export declare function applyProgress(characterId: string, progress: unknown, storage?: ProgressStorage): Progress;
export declare function chooseNewestProgress(browser: unknown, account: unknown):
  { source: 'browser' | 'account'; progress: Progress; upload: boolean };
export declare function toServerProgress(progress: unknown): ServerProgress;
export declare function fromServerProgress(response: unknown): Progress | null;
