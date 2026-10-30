/**
 * Playable, offline NPC conversations. Prompt-style persona instructions are
 * curated into fixed, reviewable choices; no third-party prompt is executed.
 * The game owns consequences and relationship data, not the dialogue renderer.
 */
import { NEIGHBORS, isOut } from './npcLayout.mjs';

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
});

const IDS = Object.freeze(Object.keys(NPC_DIALOGUES));
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

/** Nearest visible classmate standing within 1.8 m; never speaks through walls. */
export function nearbyNpc(position, location, minute) {
  if (location !== 'street' || !Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;
  let best = 1.8;
  let match = null;
  for (const id of ['maya', 'jordan']) {
    const npc = NPC_DIALOGUES[id];
    const resident = NEIGHBORS.find(person => person.id === npc.resident);
    if (!resident || !isOut(resident, minute) || resident.route.kind !== 'stand') continue;
    const distance = Math.hypot(position.x - resident.route.at.x, position.z - resident.route.at.z);
    if (distance <= best) { best = distance; match = id; }
  }
  return match;
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
    event: id === 'maya' ? 'talked-maya' : id === 'jordan' ? 'talked-jordan' : 'talked-teacher',
  };
}
