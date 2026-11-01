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
  'talked-teacher', 'talked-maya', 'talked-jordan', 'talked-neighbour', 'ate', 'entered-home', 'slept', 'drove',
  'talked-ruth', 'talked-okafor', 'talked-marcus', 'talked-elena', 'talked-tess',
  'went-downtown', 'joined-career', 'worked-shift', 'played-match',
  'talked-priya', 'talked-dee', 'talked-brooks',
]);

export const CAST = Object.freeze({
  narrator: Object.freeze({ name: '', tone: 'narration' }),
  you: Object.freeze({ name: 'You', tone: 'player' }),
  mom: Object.freeze({ name: 'Mom (text message)', tone: 'phone' }),
  maya: Object.freeze({ name: 'Maya', tone: 'friend' }),
  jordan: Object.freeze({ name: 'Jordan', tone: 'friend' }),
  rivera: Object.freeze({ name: 'Ms. Rivera', tone: 'teacher' }),
  stranger: Object.freeze({ name: 'Unknown', tone: 'mystery' }),
  ruth: Object.freeze({ name: 'Ruth', tone: 'neighbour' }),
  okafor: Object.freeze({ name: 'Mr. Okafor', tone: 'neighbour' }),
  marcus: Object.freeze({ name: 'Marcus', tone: 'neighbour' }),
  elena: Object.freeze({ name: 'Elena (text message)', tone: 'phone' }),
  tess: Object.freeze({ name: 'Tess', tone: 'neighbour' }),
});

/** The last decision: who you tell decides what changes on Maple Street. */
export const DECISIONS = Object.freeze({
  'talked-okafor': Object.freeze({ id: 'garden', title: 'The Maple Street Garden' }),
  'talked-marcus': Object.freeze({ id: 'crossing', title: 'A safer Maple Street' }),
  'talked-tess': Object.freeze({ id: 'football', title: 'Maple Street FC' }),
});
const DECISION_IDS = Object.freeze(Object.values(DECISIONS).map(decision => decision.id));

const line = (speaker, text) => Object.freeze({ speaker, text });
const lines = scene => scene && Object.freeze(scene.map(([speaker, text]) => line(speaker, text)));
/**
 * `scene` plays when the step starts. It may instead be { default, garden, … }:
 * the version for the decision you made (see DECISIONS).
 */
const step = (id, objective, completeOn, scene = null, skipOn = [], extra = {}) =>
  Object.freeze({
    id, objective, completeOn: Object.freeze(completeOn), skipOn: Object.freeze(skipOn),
    scene: Array.isArray(scene) || scene === null ? lines(scene)
      : Object.freeze(Object.fromEntries(Object.entries(scene).map(([key, value]) => [key, lines(value)]))),
    ...extra,
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
      step('ask-around', 'Find Maya on the school lawn and ask about the note', ['talked-maya'], [
        ['narrator', 'Morning. A folded note has been slipped under your front door. No stamp. No name.'],
        ['stranger', '"Everyone on Maple Street gets one last decision. Choose carefully. — A."'],
        ['you', '…Who is A?'],
        ['narrator', 'Somebody on this street knows something.'],
      ]),
      step('ask-jordan', 'Find Jordan on the school lawn and ask what he knows', ['talked-jordan'], [
        ['maya', 'Jordan may have seen something. Ask him before jumping to conclusions.'],
      ]),
      step('ask-rivera', 'Speak to Ms. Rivera inside the school about the note', ['talked-teacher'], [
        ['jordan', 'I saw that mark on the school noticeboard. Maybe Ms. Rivera can help.'],
      ]),
    ]),
  }),
  Object.freeze({
    id: 'follow-the-lead',
    title: 'Chapter 3 · Follow the Lead',
    steps: Object.freeze([
      step('back-to-class', 'Attend another school class while you work out your next move', ['attended-class'], [
        ['rivera', 'If you feel unsafe about the note, tell a trusted adult. You do not have to solve this alone.'],
        ['narrator', 'The note is still a mystery, but now you have people you can trust.'],
      ]),
      step('ask-ruth', 'Find Ruth on Maple Street and ask what she has seen (she uses the crossing by the school)', ['talked-ruth'], [
        ['maya', "If anyone knows who signs notes with an A, it's Ruth. She knows everything that happens on Maple Street."],
        ['jordan', "She crosses by the school most days. You can't miss her. She'll find you first."],
      ]),
      step('ask-okafor', 'Ask Mr. Okafor about the old days on Maple Street (he walks the east sidewalk)', ['talked-okafor'], [
        ['ruth', "An A? Oh my. I haven't seen one of those notes in twenty years, dear."],
        ['ruth', 'Ask Mr. Okafor. He has lived here the longest, and he never forgets a thing.'],
      ]),
      step('sleep-on-it', 'Head home and sleep on it', ['slept'], [
        ['okafor', 'Ah. Last Decision Day. I wondered when somebody would bring it back, young one.'],
        ['okafor', 'Every autumn, Maple Street let its newest neighbour choose one thing to change on the street. One decision.'],
        ['okafor', 'The invitations were always signed A. Who A was, that is not my secret to tell.'],
        ['okafor', 'But the old Maple Street team played downtown at Central Park. Their photo still hangs in the clubhouse.'],
        ['you', 'So the note was an invitation, not a threat.'],
      ]),
    ]),
  }),
  Object.freeze({
    id: 'downtown',
    title: 'Chapter 4 · Downtown',
    steps: Object.freeze([
      step('go-downtown', 'Go downtown: bus from the Maple Street stop, a taxi from the map (N), or drive out past the gate', ['went-downtown'], [
        ['narrator', 'Morning. The note sits on your desk, next to a map of downtown Boulder.'],
        ['mom', 'Going downtown today? Text me when you get there, and be home before dark ❤️'],
      ]),
      step('find-work', 'Find out how the town works: apply for a job at the police station, army office or fire station', ['joined-career'], [
        ['elena', "Hi, it's Elena from up the street! If you're downtown, the jobs boards at the police station, army office and fire station are worth a look."],
        ['elena', 'Half of Maple Street works down there. You will hear things.'],
      ]),
      step('first-shift', 'Work your first shift', ['worked-shift'], [
        ['narrator', 'Your new boss squints at your address. "Maple Street? The old Association lot. You lot still do the decision thing?"'],
      ]),
      step('the-match', 'Play a five-a-side match at the Central Park pitch (M on the pitch)', ['played-match'], [
        ['jordan', 'Heard you got a job! Come play five-a-side at Central Park. Maple Street versus whoever turns up.'],
        ['jordan', 'Bring your boots. The old team photo is in the clubhouse by the pitch, by the way.'],
      ]),
      step('head-home', 'Head home to Maple Street', ['entered-home'], [
        ['narrator', 'Full time. In the clubhouse, a faded photo: the Maple Street team, 1998. A banner reads LAST DECISION DAY.'],
        ['narrator', 'Under it, one name is underlined: Association secretary, A. Rivera.'],
        ['you', 'A. Rivera. Ms. Rivera?'],
      ]),
    ]),
  }),
  Object.freeze({
    id: 'last-decision-day',
    title: 'Chapter 5 · The Last Decision Day',
    steps: Object.freeze([
      step('ask-a', 'Talk to Ms. Rivera at school about the photo', ['talked-teacher'], [
        ['narrator', "That night you barely sleep. By morning, school can't come soon enough."],
      ]),
      step('decide', 'Make the last decision: tell Mr. Okafor (a garden), Marcus (a safer street) or Tess (a football club)', ['talked-okafor', 'talked-marcus', 'talked-tess'], [
        ['rivera', 'You found the photo. Ana Rivera, Association secretary. Yes, I left the note.'],
        ['rivera', "I grew up on Maple Street. Every autumn the newest neighbour made one decision for the whole street. Then people got busy, and it stopped."],
        ['rivera', 'I hoped someone new would go looking, meet everyone, and bring it back. You did.'],
        ['rivera', 'So: Last Decision Day is tomorrow, and the decision is yours.'],
        ['rivera', 'Mr. Okafor wants a community garden. Marcus wants a proper crossing and slower cars. Tess wants a street football club.'],
        ['you', 'One decision. Choose carefully.'],
      ], [], { decide: true }),
      step('the-day', 'Sleep. Tomorrow is Last Decision Day', ['slept'], {
        default: [['narrator', 'You made your decision. Word spreads down Maple Street before you even get home.']],
        garden: [
          ['okafor', 'A garden! Young one, you have made an old man very happy. The tomatoes will finally have friends.'],
          ['narrator', 'Word spreads. By evening, half the street has offered seeds, tools or opinions.'],
        ],
        crossing: [
          ['marcus', 'A real crossing and a slow zone? Good call, kid. Nobody gets bumped on my watch.'],
          ['narrator', 'Word spreads. Ruth is already telling everyone it was her idea.'],
        ],
        football: [
          ['tess', 'Maple Street FC! I will run the training. You will hate me by week two. It will be great.'],
          ['narrator', 'Word spreads. Jordan has already designed a kit.'],
        ],
      }),
      step('epilogue', 'The story is complete. Keep living your life on Maple Street', [], {
        default: [['narrator', 'Last Decision Day.']],
        garden: [
          ['narrator', 'Last Decision Day. Neighbours you have never met dig planters in front of the houses.'],
          ['okafor', 'Every choice adds up, young one. This one will grow.'],
          ['rivera', 'Welcome to Maple Street. Properly, this time.'],
        ],
        crossing: [
          ['narrator', 'Last Decision Day. Fresh white stripes appear across Maple Street, and new slow signs go up.'],
          ['marcus', 'Look at that. Even the bus slows down.'],
          ['rivera', 'Welcome to Maple Street. Properly, this time.'],
        ],
        football: [
          ['narrator', 'Last Decision Day. A banner goes up over the road: MAPLE STREET FC. Training Saturdays.'],
          ['tess', 'Laps first. Then the fun stuff.'],
          ['rivera', 'Welcome to Maple Street. Properly, this time.'],
        ],
      }, [], { final: true }),
    ]),
  }),
]);

export const NEW_STORY = Object.freeze({ chapter: 0, step: 0, seen: false });

export function normalizeStory(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const chapter = Number.isInteger(safe.chapter) && safe.chapter >= 0 && safe.chapter < CHAPTERS.length ? safe.chapter : 0;
  const steps = CHAPTERS[chapter].steps.length;
  const stepIndex = Number.isInteger(safe.step) && safe.step >= 0 && safe.step < steps ? safe.step : 0;
  const decision = DECISION_IDS.includes(safe.decision) ? safe.decision : null;
  return { chapter, step: stepIndex, seen: safe.seen === true, ...(decision ? { decision } : {}) };
}

/** True once the final scene has been reached: nothing left to do but live. */
export function storyComplete(state) {
  return Boolean(currentStep(state).step.final);
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
  if (story.seen || !step.scene) return null;
  if (Array.isArray(step.scene)) return step.scene;
  return step.scene[story.decision] ?? step.scene.default ?? null;
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
  // A deciding step records which way you went.
  const decision = step.decide ? DECISIONS[event]?.id : story.decision;
  const carry = decision ? { decision } : {};
  if (story.step + 1 < chapter.steps.length) {
    return { state: { chapter: story.chapter, step: story.step + 1, seen: false, ...carry }, completed: step, chapterDone: null };
  }
  const nextChapter = Math.min(story.chapter + 1, CHAPTERS.length - 1);
  const finished = nextChapter !== story.chapter;
  return {
    state: finished ? { chapter: nextChapter, step: 0, seen: false, ...carry } : story,
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
