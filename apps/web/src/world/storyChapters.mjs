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
  priya: Object.freeze({ name: 'Priya', tone: 'neighbour' }),
  dee: Object.freeze({ name: 'Coach Dee', tone: 'neighbour' }),
  brooks: Object.freeze({ name: 'Captain Brooks', tone: 'neighbour' }),
});

/** The last decision: who you tell decides what changes on Maple Street. */
export const DECISIONS = Object.freeze({
  'talked-okafor': Object.freeze({ id: 'garden', title: 'The Maple Street Garden' }),
  'talked-marcus': Object.freeze({ id: 'crossing', title: 'A safer Maple Street' }),
  'talked-tess': Object.freeze({ id: 'football', title: 'Maple Street FC' }),
});
const DECISION_IDS = Object.freeze(Object.values(DECISIONS).map(decision => decision.id));

/**
 * A line may carry a `beat` (open-world 19b): a staged moment the scene acts out — 'note' (you pick the note up),
 * 'photo' (you reach for the old team photo and the camera looks past you at it), 'reveal' (a slow push-in on your
 * face) or 'celebrate' (the street changes and you can't help dancing).
 */
export const STORY_BEATS = Object.freeze(['note', 'photo', 'reveal', 'celebrate']);
const line = (speaker, text, beat) => Object.freeze(beat ? { speaker, text, beat } : { speaker, text });
const lines = scene => scene && Object.freeze(scene.map(([speaker, text, beat]) => line(speaker, text, beat)));
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
      // Optional: walking straight to school skips the hello (and still counts as arriving).
      step('arrival', 'Say hello to a neighbour on Maple Street (walk up to someone and press E)',
        ['talked-ruth', 'talked-okafor', 'talked-marcus', 'talked-elena', 'talked-tess', 'talked-maya', 'talked-jordan'], [
          ['narrator', 'Three weeks ago, your family packed everything into a rented van and drove four hundred miles to Maple Street.'],
          ['narrator', 'New house. New town. Tomorrow, a new school — and nobody here knows your name yet.'],
          ['mom', "Big day!! School's at the end of the street. Doors open 7:30. Say hi to the neighbours. Be yourself ❤️"],
          ['you', 'No pressure, then.'],
        ], ['reached-school']),
      step('to-school', 'Head for school at the end of the street', ['reached-school'], [
        ['you', 'Okay. One person on this street knows my name now.'],
        ['narrator', 'The school is at the end of the street. The doors are already open.'],
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
        ['narrator', 'Morning. A folded note has been slipped under your front door. No stamp. No name.', 'note'],
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
        ['narrator', 'Full time. In the clubhouse, a faded photo: the Maple Street team, 1998. A banner reads LAST DECISION DAY.', 'photo'],
        ['narrator', 'Under it, one name is underlined: Association secretary, A. Rivera.', 'photo'],
        ['you', 'A. Rivera. Ms. Rivera?', 'reveal'],
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
      step('epilogue', 'Last Decision Day is done. Enjoy your street, then sleep when you are ready for what comes next', ['slept'], {
        default: [['narrator', 'Last Decision Day.']],
        garden: [
          ['narrator', 'Last Decision Day. Neighbours you have never met dig planters in front of the houses.', 'celebrate'],
          ['okafor', 'Every choice adds up, young one. This one will grow.'],
          ['rivera', 'Welcome to Maple Street. Properly, this time.'],
        ],
        crossing: [
          ['narrator', 'Last Decision Day. Fresh white stripes appear across Maple Street, and new slow signs go up.', 'celebrate'],
          ['marcus', 'Look at that. Even the bus slows down.'],
          ['rivera', 'Welcome to Maple Street. Properly, this time.'],
        ],
        football: [
          ['narrator', 'Last Decision Day. A banner goes up over the road: MAPLE STREET FC. Training Saturdays.', 'celebrate'],
          ['tess', 'Laps first. Then the fun stuff.'],
          ['rivera', 'Welcome to Maple Street. Properly, this time.'],
        ],
      }, [], { final: true }),
    ]),
  }),
  // Book two, "The Winter After": what your decision costs, and who stands up for it. It starts the morning
  // after Last Decision Day and its scenes follow the decision you made (see DECISIONS).
  Object.freeze({
    id: 'the-letter',
    title: 'Chapter 6 · The Letter',
    steps: Object.freeze([
      step('the-letter', 'Show the letter to Mr. Okafor (he walks the east sidewalk)', ['talked-okafor'], {
        default: [
          ['narrator', 'A month later. First frost on Maple Street, and an envelope on your doormat. A real stamp, this time.', 'note'],
          ['stranger', '"NOTICE. Unregistered street works on Maple Street must be removed by Friday. Fire Safety Office, Capt. B. Brooks."'],
          ['you', 'Removed? We only just made it.'],
        ],
        garden: [
          ['narrator', 'A month later. First frost on the new planters, and an envelope on your doormat. A real stamp, this time.', 'note'],
          ['stranger', '"NOTICE. Unregistered planters on Maple Street must be removed by Friday. Fire Safety Office, Capt. B. Brooks."'],
          ['you', 'Removed? The tomatoes have not even had a summer.'],
        ],
        crossing: [
          ['narrator', 'A month later. First frost on the new white stripes, and an envelope on your doormat. A real stamp, this time.', 'note'],
          ['stranger', '"NOTICE. Unregistered signs and markings on Maple Street must be removed by Friday. Fire Safety Office, Capt. B. Brooks."'],
          ['you', 'Removed? The bus only just learned to slow down.'],
        ],
        football: [
          ['narrator', 'A month later. First frost on the club banner, and an envelope on your doormat. A real stamp, this time.', 'note'],
          ['stranger', '"NOTICE. Unregistered banners and goals on Maple Street must be removed by Friday. Fire Safety Office, Capt. B. Brooks."'],
          ['you', 'Removed? We have not even played a home game.'],
        ],
      }),
      step('ask-ruth-again', 'Ask Ruth what she knows about the Fire Safety Office (she uses the crossing by the school)', ['talked-ruth'], [
        ['okafor', 'Unregistered. Hm. In the old days the Association held a permit for everything, even the bunting.'],
        ['okafor', 'The Association stopped meeting, so the permit lapsed. On paper, young one, your decision belongs to nobody.'],
        ['okafor', 'Ask Ruth who this Captain is. She will know his shoe size.'],
      ]),
      step('rivera-papers', 'Ask Ms. Rivera about the Association papers (inside the school)', ['talked-teacher'], [
        ['ruth', 'Brooks? Fire station downtown, dear. Does everything by the book and reads the book twice.'],
        ['ruth', 'Ana Rivera kept the Association papers. If anyone can make us official again, she can.'],
      ]),
      step('sleep-on-the-letter', 'Head home and sleep. Friday is four days away', ['slept'], [
        ['rivera', 'I still have the charter. The Association can be registered again, and a registered street can apply for a permit.'],
        ['rivera', 'But it needs three sponsors from outside Maple Street. People in town who will say this street is worth the paperwork.'],
        ['you', 'Three people downtown, by Friday.'],
        ['rivera', 'You met a whole street in a week. I like your chances.'],
      ]),
    ]),
  }),
  Object.freeze({
    id: 'friends-in-town',
    title: 'Chapter 7 · Friends in Town',
    steps: Object.freeze([
      step('back-downtown', 'Go downtown: bus from the Maple Street stop, a taxi from the map (N), or drive out past the gate', ['went-downtown'], [
        ['narrator', 'Morning. Three blank lines on the form: Sponsor one. Sponsor two. Sponsor three.'],
        ['mom', 'Ruth told me about the letter!! Go get your signatures. Wear a coat ❤️'],
      ]),
      step('meet-priya', 'Ask Priya at the downtown bus stop to be a sponsor', ['talked-priya'], [
        ['elena', 'Start with Priya at the bus stop. She gives directions to half the town, and the other half asks her first.'],
      ]),
      step('earn-it', 'Work a shift: show the town that Maple Street pulls its weight (apply again at a station if you left your job)', ['worked-shift'], [
        ['priya', 'Maple Street? You are the ones who changed your own street without waiting to be asked. I will sign.'],
        ['priya', 'A tip, though. Town listens to people it has seen working. Do your shift today, and let them see you.'],
      ]),
      step('meet-dee', 'Ask Coach Dee at the Central Park pitch to be a sponsor', ['talked-dee'], [
        ['narrator', 'End of shift. Your boss signs your timesheet, then looks at the form sticking out of your pocket.'],
        ['narrator', '"Sponsors, is it? Try Dee at the pitch. She has coached half the council\'s children."'],
      ]),
      step('charity-match', 'Play a five-a-side match at the Central Park pitch (M on the pitch)', ['played-match'], [
        ['dee', 'I sign for teams, not for speeches. Get Maple Street on this pitch and play. Then we talk.'],
        ['jordan', 'Did somebody say match? I brought the kit. I always bring the kit.'],
      ]),
      step('meet-brooks', 'Find Captain Brooks at the fire station downtown and talk to him', ['talked-brooks'], [
        ['dee', 'You play like you mean it. That is two signatures. For the third you will want somebody the council trusts.'],
        ['narrator', 'In the clubhouse, the faded photo again: the Maple Street team, 1998. This time you read the back row.', 'photo'],
        ['narrator', 'Goalkeeper, with the captain\'s armband: B. Brooks.', 'photo'],
        ['you', 'The Captain who wrote the letter played for Maple Street.', 'reveal'],
      ]),
      step('home-from-town', 'Head home to Maple Street', ['entered-home'], [
        ['brooks', 'I kept goal for that street for nine seasons. Then the Association stopped meeting and nobody rang.'],
        ['brooks', 'I wrote that notice because the rule is the rule, and because I thought nobody was left there who cared.'],
        ['brooks', 'An inspector cannot sponsor what he inspects. But there is a hearing on Friday. Show me a street, and I will see what I can do.'],
      ]),
    ]),
  }),
  Object.freeze({
    id: 'the-hearing',
    title: 'Chapter 8 · The Hearing',
    steps: Object.freeze([
      step('rally-tess', 'Ask Tess to get the whole street to the hearing (she jogs the west sidewalk)', ['talked-tess'], [
        ['narrator', 'Thursday. Two signatures on the form, one empty line, and a hearing tomorrow.'],
        ['you', 'Show him a street. Fine. Who can get a whole street out of bed?'],
      ]),
      step('rally-marcus', 'Tell Marcus about the hearing (he walks the east sidewalk)', ['talked-marcus'], [
        ['tess', 'Everybody, town hall, nine sharp? I will knock on every door. Twice, if they pretend to be asleep.'],
        ['tess', 'Tell Marcus. If he is driving, nobody has an excuse.'],
      ]),
      step('one-more-class', 'Attend one more class while the street gets ready', ['attended-class'], [
        ['marcus', 'A hearing? I will borrow the minibus. Ruth rides up front, or we never hear the end of it.'],
        ['maya', 'Jordan made badges. They say I AM A STREET. Please act like that is normal.'],
      ]),
      step('night-before', 'Head home and sleep. The hearing is in the morning', ['slept'], [
        ['rivera', 'The charter is filed, and you are on it. The newest neighbour signs last. That is the tradition.'],
        ['rivera', 'Whatever the council says tomorrow, you did this properly. Get some sleep.'],
      ]),
      step('the-winter-after', 'Both stories are complete. Keep living your life on Maple Street', [], {
        default: [
          ['narrator', 'Friday. The whole of Maple Street fills three rows of the council chamber.', 'celebrate'],
          ['brooks', 'Notice withdrawn. And put me down as the third sponsor. I am off duty as of now.'],
          ['rivera', 'The Association needs a new secretary. Next autumn, somebody new will find a note signed with your initial.'],
        ],
        garden: [
          ['narrator', 'Friday. Maple Street fills three rows of the council chamber, and Mr. Okafor has brought tomatoes for the clerk.', 'celebrate'],
          ['brooks', 'Planters moved one metre back from the hydrant, permit granted. Put me down as the third sponsor. I am off duty.'],
          ['okafor', 'One metre. The tomatoes will forgive him.'],
          ['rivera', 'The Association needs a new secretary. Next autumn, somebody new will find a note signed with your initial.'],
        ],
        crossing: [
          ['narrator', 'Friday. Maple Street fills three rows of the council chamber, and Marcus has parked the minibus very legally.', 'celebrate'],
          ['brooks', 'The crossing stays. Slow streets are easier for my engines, not harder. Put me down as the third sponsor. I am off duty.'],
          ['marcus', 'Hear that? Even the fire engine slows down.'],
          ['rivera', 'The Association needs a new secretary. Next autumn, somebody new will find a note signed with your initial.'],
        ],
        football: [
          ['narrator', 'Friday. Maple Street fills three rows of the council chamber, in full kit. Jordan insisted.', 'celebrate'],
          ['brooks', 'The banner stays, tied higher. Put me down as the third sponsor. And if the club needs a goalkeeper, I am off duty.'],
          ['tess', 'Laps first, Captain. Same as everybody.'],
          ['rivera', 'The Association needs a new secretary. Next autumn, somebody new will find a note signed with your initial.'],
        ],
      }, [], { final: true, card: 'Maple Street Stays' }),
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

/** True once the very last scene has been reached: nothing left to do but live. */
export function storyComplete(state) {
  const story = normalizeStory(state);
  return story.chapter === CHAPTERS.length - 1 && Boolean(currentStep(story).step.final);
}

const DECISION_CHAPTER = CHAPTERS.findIndex(chapter => chapter.steps.some(step => step.decide));
/** True once Last Decision Day has happened (book one's ending, and all of book two): the street shows your decision. */
export function decisionDayDone(state) {
  const story = normalizeStory(state);
  return story.chapter > DECISION_CHAPTER || Boolean(currentStep(story).step.final);
}

/**
 * How Maple Street looks for the story: null before Last Decision Day, 'made' once your decision is on the
 * street, 'notice' while the Fire Safety notice hangs over it (book two), 'saved' after the hearing.
 */
export function streetPhase(state) {
  const story = normalizeStory(state);
  if (!story.decision || !decisionDayDone(story)) return null;
  if (storyComplete(story)) return 'saved';
  return story.chapter > DECISION_CHAPTER ? 'notice' : 'made';
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
