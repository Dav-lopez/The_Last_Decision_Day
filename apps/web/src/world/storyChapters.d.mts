export type StoryEvent = 'game-start' | 'left-home' | 'reached-school' | 'entered-school' | 'attended-class'
  | 'talked-teacher' | 'talked-maya' | 'talked-jordan' | 'talked-neighbour' | 'ate' | 'entered-home' | 'slept' | 'drove'
  | 'talked-ruth' | 'talked-okafor' | 'talked-marcus' | 'talked-elena' | 'talked-tess'
  | 'went-downtown' | 'joined-career' | 'worked-shift' | 'played-match';
export type SpeakerId = 'narrator' | 'you' | 'mom' | 'maya' | 'jordan' | 'rivera' | 'stranger' | 'ruth' | 'okafor' | 'marcus' | 'elena' | 'tess';
export type DecisionId = 'garden' | 'crossing' | 'football';
export type StoryLine = Readonly<{ speaker: SpeakerId; text: string }>;
export type StoryStep = Readonly<{ id: string; objective: string; completeOn: ReadonlyArray<StoryEvent>; skipOn: ReadonlyArray<StoryEvent>; scene: ReadonlyArray<StoryLine> | Readonly<Record<string, ReadonlyArray<StoryLine>>> | null; decide?: boolean; final?: boolean }>;
export type StoryChapter = Readonly<{ id: string; title: string; steps: ReadonlyArray<StoryStep> }>;
export type StoryState = { chapter: number; step: number; seen: boolean; decision?: DecisionId };
export declare const STORY_EVENTS: ReadonlyArray<StoryEvent>;
export declare const CAST: Readonly<Record<SpeakerId, Readonly<{ name: string; tone: string }>>>;
export declare const CHAPTERS: ReadonlyArray<StoryChapter>;
export declare const DECISIONS: Readonly<Record<string, Readonly<{ id: DecisionId; title: string }>>>;
export declare function storyComplete(state: StoryState): boolean;
export declare const NEW_STORY: Readonly<StoryState>;
export declare function normalizeStory(value: unknown): StoryState;
export declare function currentStep(state: StoryState): { chapter: StoryChapter; step: StoryStep; index: number };
export declare function pendingScene(state: StoryState): ReadonlyArray<StoryLine> | null;
export declare function markSceneSeen(state: StoryState): StoryState;
export declare function advanceStory(state: StoryState, event: StoryEvent): { state: StoryState; completed: StoryStep | null; chapterDone: StoryChapter | null };
export declare function readStory(characterId: string, storage?: Storage): StoryState;
export declare function writeStory(characterId: string, state: StoryState, storage?: Storage): boolean;
