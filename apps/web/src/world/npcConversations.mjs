/**
 * Playable, offline NPC conversations. Prompt-style persona instructions are
 * curated into fixed, reviewable choices; no third-party prompt is executed.
 * The game owns consequences and relationship data, not the dialogue renderer.
 */
import { NEIGHBORS, isOut } from './npcLayout.mjs';
import { DOWNTOWN_REGULARS } from './downtownPeople.mjs';

const option = (id, label, reply, trust, mood = 'neutral') => Object.freeze({ id, label, reply, trust, mood });

export const NPC_DIALOGUES = Object.freeze({
  maya: Object.freeze({
    name: 'Maya', speaker: 'maya', resident: 'student-a', place: 'street',
    persona: 'Warm, perceptive school friend who notices details others miss. Never invents facts about the player.',
    first: "Hey! I'm Maya. You're settling in okay? You look like you have something on your mind.",
    again: "Good to see you again. What's happening?",
    wary: "We didn't get off to the best start. Did you want to talk?",
    choices: Object.freeze([
      option('note', 'Ask whether Maya knows about the mysterious note', "A note? I noticed someone outside the houses after sunset, but I couldn't see their face. Jordan might have heard more.", 1, 'happy'),
      option('friend', 'Ask Maya if you can be friends', "Of course. Start by being yourself. I'll show you around after class.", 2, 'happy'),
      option('dismiss', 'Tell Maya to leave you alone', "All right. I'll give you some space.", -2, 'sad'),
    ]),
  }),
  jordan: Object.freeze({
    name: 'Jordan', speaker: 'jordan', resident: 'student-b', place: 'street',
    persona: 'Practical, observant classmate who thinks before speaking. Offers grounded leads, not certainty.',
    first: "Jordan here. Need directions, or are you looking for something?",
    again: "Hey again. Got another question?",
    wary: "I can answer a question, but let's keep it respectful.",
    choices: Object.freeze([
      option('note', 'Ask Jordan about the mysterious note', "A note with an A on it? I saw a similar mark near the school noticeboard. I wouldn't jump to conclusions yet.", 1, 'happy'),
      option('school', 'Ask Jordan for school advice', "Show up on time, get some rest, and ask for help when you need it. The teachers notice the effort.", 2, 'happy'),
      option('dismiss', 'Mock Jordan for being too serious', "I was trying to help. Never mind.", -2, 'sad'),
    ]),
  }),
  rivera: Object.freeze({
    name: 'Ms. Rivera', speaker: 'rivera', resident: 'teacher', place: 'school',
    persona: 'Patient, firm teacher who supports learning and never changes grades through dialogue alone.',
    first: "Welcome to Westbrook. How can I help you today?",
    again: "Good to see you. Is there something you'd like to discuss?",
    wary: "I expect a respectful conversation. What do you need?",
    choices: Object.freeze([
      option('note', 'Ask Ms. Rivera about the strange note', "Bring me the note if you still have it. Please don't investigate anything unsafe on your own. We'll handle concerns together.", 1, 'happy'),
      option('advice', 'Ask for advice on improving at school', "Be consistent: attend class, practice what you learn, and take enough time to rest. Improvement takes work.", 2, 'happy'),
      option('dismiss', 'Say the school rules are pointless', "You can disagree, but respect matters. Let's talk once you're ready to listen.", -2, 'sad'),
    ]),
  }),
  // Maple Street neighbours, met out walking. They stop and turn to you while you talk.
  okafor: Object.freeze({
    name: 'Mr. Okafor', speaker: 'okafor', resident: 'neighbor-east', place: 'street',
    persona: 'Warm retired teacher and keen gardener who calls the player "young one". Kind, unhurried, never pushy.',
    first: "Ah, the new family! Welcome to Maple Street, young one. I'm Mr. Okafor. I used to teach, and now I mostly argue with my tomatoes.",
    again: "Hello again, young one. The tomatoes send their regards.",
    wary: "Young one. I hope today is a better day for both of us.",
    choices: Object.freeze([
      option('street', 'Ask what Maple Street is like', "Quiet, mostly. Everybody waves, and somebody always knows your business. Ruth especially. Be kind, and the street is kind back.", 2, 'happy'),
      option('football', 'Ask if he still plays football', "I played centre back in Lagos, forty years ago. The knees remember. There's five-a-side at Central Park downtown. Keep your passes simple and your head up.", 1, 'happy'),
      option('dismiss', 'Tell him you are busy', "Of course. Busy is a good problem to have. Go well.", -1, 'sad'),
    ]),
  }),
  tess: Object.freeze({
    name: 'Tess', speaker: 'tess', resident: 'jogger-west', place: 'street',
    persona: 'Upbeat PE teacher, always mid-run and a little breathless. Encouraging about rest, food and exercise without numbers or pressure.',
    first: "Hey! I'm Tess, from number four. Can't stop long, I'm mid-run!",
    again: "Oh hi! Still on my laps!",
    wary: "Oh. Hi. Quick chat?",
    choices: Object.freeze([
      option('training', 'Ask how to get fitter', "Honestly? Sleep well, eat proper meals and do things you enjoy. Rest days count as training too. Your energy bar will thank you.", 2, 'happy'),
      option('route', 'Ask where she runs', "Up and down Maple Street, and on weekends the trails by downtown. The hill by the school is my nemesis.", 1, 'happy'),
      option('dismiss', 'Laugh at how out of breath she is', "Wow, okay. Try it sometime!", -2, 'sad'),
    ]),
  }),
  marcus: Object.freeze({
    name: 'Marcus', speaker: 'marcus', resident: 'walker-east', place: 'street',
    persona: 'Mechanic with dry humour who knows every car on the street. Gives sensible, safe driving tips.',
    first: "Hey, kid. Marcus. I fix cars downtown, mostly other people's mistakes.",
    again: "What's good? Car treating you right?",
    wary: "Hey. You're the one who bumped into everything, right?",
    choices: Object.freeze([
      option('driving', 'Ask for driving tips', "Brake before the turn, not during it. Give people on the crossing time; they'll wait for you if you're slow and steady. And park on your driveway, not in the lane.", 2, 'happy'),
      option('car', 'Ask about the car on your driveway', "Good little sedan. Original paint. Treat it gently and it'll get you downtown and back for years.", 1, 'happy'),
      option('dismiss', 'Say mechanics are overpaid', "Ha. Say that when your engine's smoking.", -2, 'sad'),
    ]),
  }),
  elena: Object.freeze({
    name: 'Elena', speaker: 'elena', resident: 'commuter-west', place: 'street',
    persona: 'Busy, practical commuter who works downtown near the Municipal Building. Gives honest career advice.',
    first: "Oh, hi! Elena. Sorry, I'm always half running for the bus.",
    again: "Hello! Quickly, though, the bus waits for no one.",
    wary: "Hi. I don't have long.",
    choices: Object.freeze([
      option('careers', 'Ask about jobs downtown', "There's everything down there: police, the fire station, offices, shops. Pick a career that suits you, then show up on time. That's honestly half of it.", 2, 'happy'),
      option('bus', 'Ask how to get downtown', "Take the bus from the stop on Maple Street, or a taxi if you're in a hurry. Press N to see the map. Or drive, if you're feeling brave.", 1, 'happy'),
      option('dismiss', 'Tell her to slow down', "I'll slow down when the bus does!", -1, 'sad'),
    ]),
  }),
  ruth: Object.freeze({
    name: 'Ruth', speaker: 'ruth', resident: 'crosser', place: 'street',
    persona: "Curious neighbour who knows everyone's business and lowers her voice for the good parts. Hints, never certainty.",
    first: "Well hello there! You must be the new one. I'm Ruth. I know everybody, dear, and everybody knows me.",
    again: "Psst. Hello again.",
    wary: "Hmph. Hello.",
    choices: Object.freeze([
      option('note', 'Ask Ruth about the mysterious note', "A note on your doorstep? Ooh. I saw someone near the school noticeboard at dusk last week. Ask your classmates, and keep your eyes open, dear.", 2, 'happy'),
      option('gossip', 'Ask what is new on the street', "The house on the corner sat empty for three years, you know. And Marcus swears he once raced a bus. He lost.", 1, 'happy'),
      option('dismiss', 'Tell her to mind her own business', "Well! Some of us are only being friendly.", -2, 'sad'),
    ]),
  }),
  // Downtown regulars (see downtownPeople.mjs): always at the same spot during the day.
  priya: Object.freeze({
    name: 'Priya', speaker: 'priya', resident: 'downtown-guide', place: 'city',
    persona: 'Cheerful volunteer city guide at the downtown bus stop. Practical directions, never pushy, never invents places.',
    first: "Welcome downtown! I'm Priya, I volunteer as a guide here. First time off the bus?",
    again: "Back again! Where are you headed today?",
    wary: "Hi. Need directions, or just passing?",
    choices: Object.freeze([
      option('sights', 'Ask what there is to do downtown', "Central Park has a caged five-a-side pitch, and the police station, fire station and army recruiting office are all hiring. Press N, tap a spot on the map and follow the GPS line.", 2, 'happy'),
      option('around', 'Ask how to get around safely', "Stay on the pavements and cross at the lights when the traffic has stopped. Taxis run from the map, and the bus home leaves right here.", 1, 'happy'),
      option('dismiss', "Tell her you don't need a guide", "Fair enough! I'm here all day if you change your mind.", -1, 'sad'),
    ]),
  }),
  dee: Object.freeze({
    name: 'Coach Dee', speaker: 'dee', resident: 'downtown-coach', place: 'city',
    persona: 'Loud, big-hearted youth football coach who runs the Central Park five-a-side. Praises effort, teaches simple habits.',
    first: "Hey, new face! Coach Dee. I run the five-a-side here. You play?",
    again: "There they are! Come for a game?",
    wary: "Oh, it's you. Still welcome on my pitch, mind.",
    choices: Object.freeze([
      option('tips', 'Ask for football tips', "Pass early, move into space, and shoot low across the keeper. Keepers come off their line now, so a chip over them works if they rush you.", 2, 'happy'),
      option('league', 'Ask about the season league', "Step onto the pitch and start a match. Every result goes in the league table, and the top of the table gets bragging rights all season.", 1, 'happy'),
      option('dismiss', 'Say football is boring', "Boring? Come lose five-nil to the AI and say that again!", -2, 'sad'),
    ]),
  }),
  brooks: Object.freeze({
    name: 'Captain Brooks', speaker: 'brooks', resident: 'downtown-captain', place: 'city',
    persona: 'Calm, steady fire captain outside the fire station. Gives real fire-safety basics and honest advice about the job.',
    first: "Afternoon. Captain Brooks, from the station here. Something I can help you with?",
    again: "Good to see you again. All well?",
    wary: "Hm. What can I do for you?",
    choices: Object.freeze([
      option('job', 'Ask what it takes to be a firefighter', "Fitness, teamwork and turning up for every shift. Sign on at the station door, then practise the hose on the flame boards at the training range.", 2, 'happy'),
      option('safety', 'Ask for fire-safety advice', "Test your smoke alarm every month, keep your way out clear, and if there's ever a fire: get out, stay out and call for help.", 1, 'happy'),
      option('dismiss', 'Say firefighters just sit around', "We train when it's quiet so we're ready when it isn't. You'll be glad of that one day.", -1, 'sad'),
    ]),
  }),
});

const IDS = Object.freeze(Object.keys(NPC_DIALOGUES));
/** Residents who walk Maple Street; their live positions come from the scene. */
const WALKERS = Object.freeze(['okafor', 'tess', 'marcus', 'elena', 'ruth']);
const TALK_RANGE = 1.8;
const WALKER_RANGE = 2.2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const safeInt = (value, low, high) => Number.isSafeInteger(value) ? clamp(value, low, high) : 0;
const emptyRelation = () => ({ trust: 0, conversations: 0, lastChoice: null });

export function normalizeNpcRelations(value) {
  const relations = {};
  const input = value && typeof value === 'object' && value.version === 1 && value.people && typeof value.people === 'object'
    ? value.people : {};
  for (const id of IDS) {
    const entry = input[id] && typeof input[id] === 'object' ? input[id] : {};
    relations[id] = {
      trust: safeInt(entry.trust, -5, 5),
      conversations: safeInt(entry.conversations, 0, 99),
      lastChoice: NPC_DIALOGUES[id].choices.some(choice => choice.id === entry.lastChoice) ? entry.lastChoice : null,
    };
  }
  return { version: 1, people: relations };
}

export function newNpcRelations() { return normalizeNpcRelations(null); }

const storageKey = characterId => 'tld-npc-relations-v1:' + characterId;
export function readNpcRelations(characterId, storage = globalThis.localStorage) {
  try { return normalizeNpcRelations(JSON.parse(storage?.getItem(storageKey(characterId)) ?? 'null')); }
  catch { return newNpcRelations(); }
}
export function writeNpcRelations(characterId, relations, storage = globalThis.localStorage) {
  try { storage?.setItem(storageKey(characterId), JSON.stringify(normalizeNpcRelations(relations))); return true; }
  catch { return false; }
}

/**
 * Nearest resident you can talk to: a classmate standing within 1.8 m, or a
 * neighbour out walking within 2.2 m of where the scene says they are now
 * (`live`: resident id → position). Never speaks through walls.
 */
export function nearbyNpc(position, location, minute, live = null) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;
  if (location === 'city') return nearbyRegular(position, minute, live);
  if (location !== 'street') return null;
  let best = Infinity;
  let match = null;
  for (const id of ['maya', 'jordan', ...WALKERS]) {
    const npc = NPC_DIALOGUES[id];
    const resident = NEIGHBORS.find(person => person.id === npc.resident);
    if (!resident || !isOut(resident, minute)) continue;
    const at = resident.route.kind === 'stand' ? resident.route.at : live?.[resident.id];
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) continue;
    const distance = Math.hypot(position.x - at.x, position.z - at.z);
    const range = resident.route.kind === 'stand' ? TALK_RANGE : WALKER_RANGE;
    if (distance <= range && distance < best) { best = distance; match = id; }
  }
  return match;
}

/** Downtown: a regular who is out now, standing within 1.8 m of where the scene placed them. */
function nearbyRegular(position, minute, live) {
  let best = Infinity;
  let match = null;
  for (const regular of DOWNTOWN_REGULARS) {
    if (!Number.isFinite(minute) || minute < regular.from || minute >= regular.until) continue;
    const at = live?.[regular.resident];
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) continue;
    const distance = Math.hypot(position.x - at.x, position.z - at.z);
    if (distance <= TALK_RANGE && distance < best) { best = distance; match = regular.npc; }
  }
  return match;
}

/**
 * A spot right beside someone you can talk to on the street now (nearest to `from`
 * when given), for touch hints and automated playtests: { id, x, z } or null.
 * Stands `gap` metres from them, on the side towards the middle of the street.
 * `only` limits it to one person (null when they're not out right now).
 */
export function talkSpot(location, minute, live = null, from = null, gap = 0.8, only = null) {
  if (location !== 'street') return null;
  let best = null;
  for (const id of ['maya', 'jordan', ...WALKERS]) {
    if (only && id !== only) continue;
    const npc = NPC_DIALOGUES[id];
    const resident = NEIGHBORS.find(person => person.id === npc.resident);
    if (!resident || !isOut(resident, minute)) continue;
    const at = resident.route.kind === 'stand' ? resident.route.at : live?.[resident.id];
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) continue;
    const side = at.x > 0 ? -1 : 1;
    const spot = { id, x: at.x + side * gap, z: at.z };
    const distance = from ? Math.hypot(spot.x - from.x, spot.z - from.z) : 0;
    if (!best || distance < best.distance) best = { ...spot, distance };
  }
  if (!best) return null;
  return { id: best.id, x: best.x, z: best.z };
}

export function beginNpcConversation(id, relations) {
  const npc = NPC_DIALOGUES[id];
  if (!npc) return null;
  const relation = normalizeNpcRelations(relations).people[id] ?? emptyRelation();
  const greeting = relation.conversations === 0 ? npc.first : relation.trust < 0 ? npc.wary : npc.again;
  return {
    id, name: npc.name, speaker: npc.speaker, resident: npc.resident,
    greeting, choices: npc.choices.map(({ id: choiceId, label }) => ({ id: choiceId, label })),
  };
}

/** Replaying a conversation is allowed but cannot escape the reputation bounds. */
export function chooseNpcReply(relations, id, choiceId) {
  const npc = NPC_DIALOGUES[id];
  const choice = npc?.choices.find(item => item.id === choiceId);
  if (!choice) return null;
  const state = normalizeNpcRelations(relations);
  const prior = state.people[id];
  const next = {
    version: 1,
    people: {
      ...state.people,
      [id]: {
        trust: clamp(prior.trust + choice.trust, -5, 5),
        conversations: clamp(prior.conversations + 1, 0, 99),
        lastChoice: choice.id,
      },
    },
  };
  return {
    state: next, reply: choice.reply, mood: choice.mood, trustDelta: next.people[id].trust - prior.trust,
    event: id === 'maya' ? 'talked-maya' : id === 'jordan' ? 'talked-jordan' : id === 'rivera' ? 'talked-teacher' : `talked-${id}`,
  };
}
