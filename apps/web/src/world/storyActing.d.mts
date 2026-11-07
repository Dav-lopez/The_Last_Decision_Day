import type { StoryLine } from './storyChapters.mjs';
import type { SceneMood } from './cutscene.mjs';
export type StoryGesture = 'Talk' | 'PickUp' | 'Interact' | 'Dance';
export type StoryEmotion = 'happy' | 'fear';
export declare const STORY_GESTURES: ReadonlyArray<StoryGesture>;
/** `gesture`: a clip to start, 'hold' to keep the one playing, or null to stop the scene's gesture. */
export declare function lineActing(line: StoryLine | null | undefined, options?: { mood?: SceneMood; previous?: StoryLine | null; driving?: boolean }): {
  gesture: StoryGesture | 'hold' | null; emotion: StoryEmotion | null; npcMood: 'neutral' | 'happy';
};
