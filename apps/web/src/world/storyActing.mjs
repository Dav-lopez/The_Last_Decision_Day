/**
 * Acting for directed story scenes (open-world 19b). For each line of a scene,
 * what your character does (a gesture from the action clips), the face they
 * pull, and the mood of the neighbour who is speaking.
 *
 * Pure: the scene plays the returned clip on the rigged avatar and holds the
 * emotion while the line is on screen.
 */
import { CAST } from './storyChapters.mjs';

/** Gestures a story line can start on your character (all clips in human-actions.glb). */
export const STORY_GESTURES = Object.freeze(['Talk', 'PickUp', 'Interact', 'Dance']);
const BEAT_GESTURE = Object.freeze({ note: 'PickUp', photo: 'Interact', celebrate: 'Dance' });

/**
 * `line` is a StoryLine; `mood` the scene's ('opening' | 'scene' | 'ending');
 * `previous` the line before it (so a staged beat that carries over two lines
 * — reaching for the photo — isn't restarted). `driving` scenes keep your hands
 * on the wheel.
 *
 * Returns { gesture, emotion, npcMood }: `gesture` null means "stop whatever
 * gesture the scene started", `emotion` null means "the usual face".
 */
export function lineActing(line, { mood = 'scene', previous = null, driving = false } = {}) {
  const speaker = line?.speaker;
  const beat = line?.beat ?? null;
  const tone = CAST[speaker]?.tone;
  let gesture = null;
  if (!driving) {
    if (beat && BEAT_GESTURE[beat]) gesture = previous?.beat === beat ? 'hold' : BEAT_GESTURE[beat];
    else if (speaker === 'you') gesture = 'Talk';
  }
  let emotion = null;
  if (mood === 'ending' || beat === 'celebrate') emotion = 'happy';
  // An unsigned note, a voice you don't know, the penny dropping: wide-eyed.
  else if (tone === 'mystery' || beat === 'note' || beat === 'reveal') emotion = 'fear';
  const text = String(line?.text ?? '');
  const npcMood = mood === 'ending' || /!['"”]?\s*$/.test(text) ? 'happy' : 'neutral';
  return { gesture, emotion, npcMood };
}
