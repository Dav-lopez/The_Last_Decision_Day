export type StoryEvent = 'game-start' | 'left-home' | 'reached-school' | 'entered-school' | 'attended-class'
  | 'talked-teacher' | 'ate' | 'entered-home' | 'slept' | 'drove';
export type SpeakerId = 'narrator' | 'you' | 'mom' | 'maya' | 'jordan' | 'rivera' | 'stranger';
export type StoryLine = Readonly<{ speaker: SpeakerId; text: string }>;
export type StoryStep = Readonly<{ id: string; objective: string; completeOn: ReadonlyArray<StoryEvent>; skipOn: ReadonlyArray<StoryEvent>; scene: ReadonlyArray<StoryLine> | null }>;
export type StoryChapter = Readonly<{ id: string; title: string; steps: ReadonlyArray<StoryStep> }>;
export type StoryState = { chapter: number; step: number; seen: boolean };
export declare const STORY_EVENTS: ReadonlyArray<StoryEvent>;
export declare const CAST: Readonly<Record<SpeakerId, Readonly<{ name: string; tone: string }>>>;
export declare const CHAPTERS: ReadonlyArray<StoryChapter>;
export declare const NEW_STORY: Readonly<StoryState>;
export declare function normalizeStory(value: unknown): StoryState;
export declare function currentStep(state: StoryState): { chapter: StoryChapter; step: StoryStep; index: number };
export declare function pendingScene(state: StoryState): ReadonlyArray<StoryLine> | null;
export declare function markSceneSeen(state: StoryState): StoryState;
export declare function advanceStory(state: StoryState, event: StoryEvent): { state: StoryState; completed: StoryStep | null; chapterDone: StoryChapter | null };
export declare function readStory(characterId: string, storage?: Storage): StoryState;
export declare function writeStory(characterId: string, state: StoryState, storage?: Storage): boolean;
