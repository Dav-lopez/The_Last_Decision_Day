/**
 * The story: chapters made of steps. Each step shows an objective and, when it
 * starts, an optional dialogue scene. Steps complete on gameplay events the
 * scene already produces (leaving home, reaching school, finishing a class…),
 * so the story never needs its own copies of the game rules.
 *
 * Pure and serialisable: the state is { chapter, step, seen } and advances
 * only through advanceStory(state, event).
 */

/** Events the world reports. */
export const STORY_EVENTS = Object.freeze([
  'game-start', 'left-home', 'reached-school', 'entered-school', 'attended-class',
  'talked-teacher', 'ate', 'entered-home', 'slept', 'drove',
]);

export const CAST = Object.freeze({
  narrator: Object.freeze({ name: '', tone: 'narration' }),
  you: Object.freeze({ name: 'You', tone: 'player' }),
  mom: Object.freeze({ name: 'Mom (text message)', tone: 'phone' }),
  maya: Object.freeze({ name: 'Maya', tone: 'friend' }),
  jordan: Object.freeze({ name: 'Jordan', tone: 'friend' }),
  rivera: Object.freeze({ name: 'Ms. Rivera', tone: 'teacher' }),
  stranger: Object.freeze({ name: 'Unknown', tone: 'mystery' }),
});

const line = (speaker, text) => Object.freeze({ speaker, text });
const step = (id, objective, completeOn, scene = null, skipOn = []) =>
  Object.freeze({
    id, objective, completeOn: Object.freeze(completeOn), skipOn: Object.freeze(skipOn),
    scene: scene && Object.freeze(scene.map(([speaker, text]) => line(speaker, text))),
  });

export const CHAPTERS = Object.freeze([
  Object.freeze({
    id: 'new-in-town',
    title: 'Chapter 1 · New in Town',
    steps: Object.freeze([
      step('arrival', 'Look around Maple Street, then head for school', ['reached-school'], [
        ['narrator', 'Three weeks ago, your family packed everything into a rented van and drove four hundred miles to Maple Street.'],
        ['narrator', 'New house. New town. Tomorrow, a new school — and nobody here knows your name yet.'],
        ['mom', "Big day!! School's at the end of the street. Doors open 7:30. Be yourself ❤️"],
        ['you', 'No pressure, then.'],
      ]),
      step('classmates', 'Go inside the school (E at the entrance)', ['entered-school'], [
        ['maya', "Hey — you're the new kid from the blue house, right? I'm Maya."],
        ['jordan', "Jordan. Math is first, and Ms. Rivera locks the door at 8:15. Don't be late."],
        ['maya', "She's actually nice. Just… punctual. Come on, we'll show you the room."],
      ]),
      step('first-class', 'Take a seat at a desk for your first class', ['attended-class'], [
        ['rivera', "You must be our new student. Welcome to Westbrook. Any free desk is yours — we're starting now."],
      ]),
      step('teacher', 'Talk to Ms. Rivera after class', ['talked-teacher'], [
        ['narrator', 'The bell rings. Chairs scrape. Maya gives you a thumbs-up on her way out.'],
      ]),
      step('head-home', 'Head home for the evening', ['entered-home'], [
        ['rivera', 'Not bad for a first day. A word of advice: every choice you make here adds up — grades, friends, sleep. Pace yourself.'],
        ['you', 'Every choice adds up. Got it.'],
      ]),
      // Optional: going straight to bed skips dinner (and still counts as sleeping).
      step('dinner', 'Make yourself something to eat', ['ate'], [
        ['mom', "Working late, sorry!! There's food in the fridge. Proud of you."],
      ], ['slept']),
      step('sleep', 'Get some sleep (E beside your bed)', ['slept'], [
        ['you', 'First day: survived. Bed is calling.'],
      ]),
    ]),
  }),
  Object.freeze({
    id: 'the-note',
    title: 'Chapter 2 · The Note',
    steps: Object.freeze([
      step('ask-around', 'Ask Maya and Jordan about the note (coming soon)', [], [
        ['narrator', 'Morning. A folded note has been slipped under your front door. No stamp. No name.'],
        ['stranger', '"Everyone on Maple Street gets one last decision. Choose carefully. — A."'],
        ['you', '…Who is A?'],
        ['narrator', 'Somebody on this street knows something.'],
      ]),
    ]),
  }),
]);

export const NEW_STORY = Object.freeze({ chapter: 0, step: 0, seen: false });

export function normalizeStory(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const chapter = Number.isInteger(safe.chapter) && safe.chapter >= 0 && safe.chapter < CHAPTERS.length ? safe.chapter : 0;
  const steps = CHAPTERS[chapter].steps.length;
  const stepIndex = Number.isInteger(safe.step) && safe.step >= 0 && safe.step < steps ? safe.step : 0;
  return { chapter, step: stepIndex, seen: safe.seen === true };
}

export function currentStep(state) {
  const story = normalizeStory(state);
  const chapter = CHAPTERS[story.chapter];
  return { chapter, step: chapter.steps[story.step], index: story.step };
}

/** The dialogue to play now (once per step), or null. Mark it played with markSceneSeen. */
export function pendingScene(state) {
  const story = normalizeStory(state);
  const { step } = currentStep(story);
  return !story.seen && step.scene ? step.scene : null;
}

export function markSceneSeen(state) {
  return { ...normalizeStory(state), seen: true };
}

/**
 * Report a gameplay event. Completes the current step when it matches and
 * moves to the next step (or chapter). Returns { state, completed, chapterDone }.
 */
export function advanceStory(state, event) {
  const story = normalizeStory(state);
  const { chapter, step } = currentStep(story);
  if (STORY_EVENTS.includes(event) && step.skipOn.includes(event) && story.step + 1 < chapter.steps.length) {
    // An optional step is skipped and the event is applied to the step after it.
    return advanceStory({ chapter: story.chapter, step: story.step + 1, seen: true }, event);
  }
  if (!STORY_EVENTS.includes(event) || !step.completeOn.includes(event)) return { state: story, completed: null, chapterDone: null };
  if (story.step + 1 < chapter.steps.length) {
    return { state: { chapter: story.chapter, step: story.step + 1, seen: false }, completed: step, chapterDone: null };
  }
  const nextChapter = Math.min(story.chapter + 1, CHAPTERS.length - 1);
  const finished = nextChapter !== story.chapter;
  return {
    state: finished ? { chapter: nextChapter, step: 0, seen: false } : story,
    completed: step,
    chapterDone: finished ? chapter : null,
  };
}

const KEY = id => `tld-story-v1:${id}`;
export function readStory(characterId, storage = globalThis.localStorage) {
  try { return normalizeStory(JSON.parse(storage?.getItem(KEY(characterId)) ?? 'null')); } catch { return { ...NEW_STORY }; }
}
export function writeStory(characterId, state, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY(characterId), JSON.stringify(normalizeStory(state))); return true; } catch { return false; }
}
