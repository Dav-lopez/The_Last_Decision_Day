/**
 * The in-game phone (P): messages from Mom and the people you've met,
 * contacts, and a career summary. Pure and serialisable.
 *
 * Messages are derived from the game state you already have (story, life
 * clock, relationships, career), so the phone never needs its own copy of the
 * game rules. The only thing it stores is when each message arrived and which
 * ones you have read: { version, arrived: { id: { day, minute } }, read: [id] }.
 */
import { CAST, CHAPTERS } from './storyChapters.mjs';
import { NPC_DIALOGUES } from './npcConversations.mjs';
import { CAREERS, rankOf } from './careers.mjs';
import { RANGE_DRILLS, gradeFor } from './trainingRange.mjs';
import { EVENING_START, TIRED_ENERGY, WAKE_MINUTE } from './lifeClock.mjs';

export const PHONE_APPS = Object.freeze([
  Object.freeze({ id: 'messages', title: 'Messages' }),
  Object.freeze({ id: 'contacts', title: 'Contacts' }),
  Object.freeze({ id: 'career', title: 'Career' }),
  Object.freeze({ id: 'map', title: 'Map' }),
]);

/** How many days of daily texts the inbox keeps. */
export const DAILY_HISTORY_DAYS = 3;
/** Arrival records are trimmed to this many (oldest first). */
const MAX_RECORDS = 160;

const MOM_MORNING = Object.freeze([
  "Morning! There's cereal in the cupboard and juice in the fridge. Have a good day ❤️",
  "Cold one this morning, take a jacket. Love you.",
  'Good luck today! Text me if you need anything at all.',
  'Working a double today, sweetheart. Dinner is in the fridge. See you tonight.',
  "Did you sleep OK? I'm proud of how you're settling in.",
  'Remember: water, lunch, and be kind to yourself. In that order 😄',
  "Just saw a deer on the drive to work!! Boulder is something else. Have a great day.",
]);
const MOM_EVENING = Object.freeze([
  "It's getting dark. Head home soon, OK? 🌙",
  'Where are you? Home before it gets too late, please.',
  "Time to start heading back. I'll leave the porch light on.",
]);
const MOM_TIRED = 'You looked exhausted this morning. Early night tonight, deal?';

/** What friends text you once you get on well with them (trust 2 or more). */
const FRIEND_TEXTS = Object.freeze({
  maya: 'Hey! Saving you a seat at lunch tomorrow. Jordan says he will be on time. He will not.',
  jordan: "FYI: Ms. Rivera's quiz is on Thursday. Chapters 3 and 4. You're welcome.",
  okafor: 'Young one, the tomatoes need picking. Come by any evening, there is plenty to share.',
  tess: 'Kick-about on the lawn later? Bring water. I am not going easy on you.',
  marcus: 'Watch the corner by the school today, a delivery van was flying through it this morning.',
  elena: "Bus was 6 minutes late this morning, if you're heading downtown. Grab a coffee at the stop!",
  ruth: 'Lovely to chat today, dear. Pop round any time. I always have biscuits.',
  priya: 'Free walking tour of Pearl Street on Saturday. Bring a friend! I do a great history bit.',
  dee: 'Training on the Central Park pitch whenever you want. Your first touch is getting better.',
  brooks: 'Good talking to you. Smoke alarm tested this month? Takes ten seconds. Do it for your mom.',
});
/** And a cooler note if things went badly (trust below 0). */
const FRIEND_COOL = 'Hey. About earlier: no hard feelings, OK? Maybe we can start over.';

const SPEAKER_NAMES = Object.freeze({ mom: 'Mom', elena: 'Elena' });

const clampInt = (value, min, max, fallback) => Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
const two = n => String(n).padStart(2, '0');
const hour = minute => `${two(Math.floor(minute / 60) % 24)}:${two(Math.floor(minute % 60))}`;

export function newPhone() { return { version: 1, arrived: {}, read: [] }; }

export function normalizePhone(value) {
  const phone = newPhone();
  if (!value || typeof value !== 'object') return phone;
  const arrived = value.arrived && typeof value.arrived === 'object' ? value.arrived : {};
  for (const [id, at] of Object.entries(arrived)) {
    if (typeof id !== 'string' || id.length > 80 || !at || typeof at !== 'object') continue;
    phone.arrived[id] = { day: clampInt(at.day, 1, 100000, 1), minute: clampInt(at.minute, 0, 1439, 0) };
  }
  if (Array.isArray(value.read)) phone.read = [...new Set(value.read.filter(id => typeof id === 'string' && id.length <= 80))];
  return trim(phone);
}

function trim(phone) {
  const ids = Object.keys(phone.arrived);
  if (ids.length <= MAX_RECORDS) return phone;
  const keep = new Set(ids.sort((a, b) => order(phone.arrived[b]) - order(phone.arrived[a])).slice(0, MAX_RECORDS));
  return {
    ...phone,
    arrived: Object.fromEntries(Object.entries(phone.arrived).filter(([id]) => keep.has(id))),
    read: phone.read.filter(id => keep.has(id)),
  };
}
const order = at => at.day * 1440 + at.minute;

const storyMessages = story => {
  const out = [];
  for (let c = 0; c < CHAPTERS.length && c <= story.chapter; c++) {
    const steps = CHAPTERS[c].steps;
    for (let s = 0; s < steps.length; s++) {
      // Only steps whose scene you have already seen (earlier steps, or the current one once it played).
      if (c === story.chapter && (s > story.step || (s === story.step && !story.seen))) break;
      const scene = steps[s].scene;
      const lines = Array.isArray(scene) ? scene : scene ? (scene[story.decision ?? 'default'] ?? scene.default ?? []) : [];
      lines.forEach((line, i) => {
        if (CAST[line.speaker]?.tone !== 'phone') return;
        out.push({ id: `story:${CHAPTERS[c].id}:${steps[s].id}:${i}`, from: line.speaker, name: SPEAKER_NAMES[line.speaker] ?? CAST[line.speaker].name,
          text: line.text, kind: 'story' });
      });
    }
  }
  return out;
};

/**
 * Every message that should be on the phone right now.
 * `now` is the life clock ({ day, minute, energy }); `location` is 'street' | 'home' | 'school' | 'city'.
 * Story texts were already shown in their scene, so they count as read.
 */
export function phoneMessages({ story, relations, career, now, location = 'street' }) {
  const messages = story ? storyMessages(story) : [];
  const day = Math.max(1, Math.floor(now?.day ?? 1));
  const minute = clampInt(now?.minute, 0, 1439, WAKE_MINUTE);
  for (let d = Math.max(1, day - DAILY_HISTORY_DAYS + 1); d <= day; d++) {
    const today = d === day;
    if (!today || minute >= WAKE_MINUTE) messages.push({ id: `mom:morning:${d}`, from: 'mom', name: 'Mom', text: MOM_MORNING[(d - 1) % MOM_MORNING.length], kind: 'daily', day: d });
    if (today && minute >= EVENING_START && location !== 'home') messages.push({ id: `mom:evening:${d}`, from: 'mom', name: 'Mom', text: MOM_EVENING[(d - 1) % MOM_EVENING.length], kind: 'daily', day: d });
  }
  if ((now?.energy ?? 100) <= TIRED_ENERGY && minute >= WAKE_MINUTE) messages.push({ id: `mom:tired:${day}`, from: 'mom', name: 'Mom', text: MOM_TIRED, kind: 'daily', day });
  for (const [id, relation] of Object.entries(relations?.people ?? {})) {
    if (!relation?.conversations || !NPC_DIALOGUES[id]) continue;
    const name = NPC_DIALOGUES[id].name;
    if (relation.trust >= 2 && FRIEND_TEXTS[id]) messages.push({ id: `friend:${id}:warm`, from: id, name, text: FRIEND_TEXTS[id], kind: 'friend' });
    else if (relation.trust < 0 && id !== 'rivera') messages.push({ id: `friend:${id}:cool`, from: id, name, text: FRIEND_COOL, kind: 'friend' });
  }
  const job = career?.career ? CAREERS[career.career] : null;
  if (job) {
    const sender = job.workplace.replace(/^./, c => c.toUpperCase());
    messages.push({ id: `career:${job.id}:welcome`, from: 'work', name: sender,
      text: `Welcome aboard! You start as ${job.ranks[0]}. Clock in at the ${job.workplace} sign downtown (E) any time from ${hour(job.hours[0])} to ${hour(job.hours[1] % 1440)}.`, kind: 'work' });
    const rank = rankOf(career);
    if (rank && rank.index > 0) messages.push({ id: `career:${job.id}:rank:${rank.index}`, from: 'work', name: sender,
      text: `Congratulations on making ${rank.title}! Pay goes up to $${job.pay[Math.min(rank.index, job.pay.length - 1)]} a shift.`, kind: 'work' });
    if (minute >= WAKE_MINUTE) messages.push({ id: `career:${job.id}:shift:${day}`, from: 'work', name: sender,
      text: job.hours[1] - job.hours[0] >= 1440 ? 'The station is staffed around the clock today. Come in when you can.'
        : `Shifts today run ${hour(job.hours[0])} to ${hour(job.hours[1])}. See you there.`, kind: 'work', day });
  }
  return messages;
}

/**
 * Records the arrival time of messages the phone hasn't seen yet.
 * Returns the new state and the ids that just arrived unread (to buzz for).
 */
export function receiveMessages(phone, messages, now) {
  const at = { day: Math.max(1, Math.floor(now?.day ?? 1)), minute: clampInt(now?.minute, 0, 1439, 0) };
  const fresh = [];
  let arrived = phone.arrived;
  let read = phone.read;
  for (const message of messages) {
    if (arrived[message.id]) continue;
    if (arrived === phone.arrived) arrived = { ...arrived };
    // Daily texts arrive on their own day (morning), not when you happen to open the game.
    arrived[message.id] = message.day && message.day < at.day ? { day: message.day, minute: WAKE_MINUTE } : at;
    if (message.kind === 'story') { if (read === phone.read) read = [...read]; read.push(message.id); }
    else fresh.push(message.id);
  }
  if (arrived === phone.arrived && read === phone.read) return { phone, fresh };
  return { phone: trim({ ...phone, arrived, read }), fresh };
}

/** The inbox: arrived messages, newest first, with arrival time and read flag. */
export function inbox(phone, messages) {
  const read = new Set(phone.read);
  return messages
    .filter(message => phone.arrived[message.id])
    .map((message, index) => ({ ...message, at: phone.arrived[message.id], unread: !read.has(message.id), index }))
    .sort((a, b) => order(b.at) - order(a.at) || b.index - a.index)
    .map(({ index, ...message }) => message);
}

export const unreadCount = (phone, messages) => inbox(phone, messages).filter(message => message.unread).length;

export function markRead(phone, ids) {
  const read = new Set(phone.read);
  const add = ids.filter(id => phone.arrived[id] && !read.has(id));
  return add.length ? { ...phone, read: [...phone.read, ...add] } : phone;
}

/** Message threads, one per sender, newest thread first. */
export function threads(phone, messages) {
  const byFrom = new Map();
  for (const message of inbox(phone, messages)) {
    const thread = byFrom.get(message.from) ?? { from: message.from, name: message.name, messages: [], unread: 0 };
    thread.messages.push(message);
    if (message.unread) thread.unread++;
    byFrom.set(message.from, thread);
  }
  return [...byFrom.values()].map(thread => ({ ...thread, latest: thread.messages[0], messages: [...thread.messages].reverse() }));
}

const PLACES = Object.freeze({ street: 'Maple Street', school: 'Westbrook school', city: 'Downtown' });
export function trustLabel(trust) {
  return trust >= 4 ? 'Close friend' : trust >= 2 ? 'Friend' : trust >= 0 ? 'Acquaintance' : 'Not on good terms';
}

/** Mom, then everyone you've talked to, closest first. */
export function contacts(relations) {
  const met = Object.entries(relations?.people ?? {})
    .filter(([id, relation]) => relation?.conversations > 0 && NPC_DIALOGUES[id])
    .map(([id, relation]) => ({ id, name: NPC_DIALOGUES[id].name, where: PLACES[NPC_DIALOGUES[id].place] ?? 'Around town',
      trust: relation.trust, label: trustLabel(relation.trust), conversations: relation.conversations }))
    .sort((a, b) => b.trust - a.trust || b.conversations - a.conversations || a.name.localeCompare(b.name));
  return [{ id: 'mom', name: 'Mom', where: 'Home, Maple Street', trust: 5, label: 'Family', conversations: 0 }, ...met];
}

/** One-screen career summary for the phone's Career app. */
export function careerSummary(career) {
  const job = career?.career ? CAREERS[career.career] : null;
  const rank = rankOf(career ?? { career: null });
  if (!job || !rank) return { hasJob: false, title: 'No job yet', lines: [
    career?.money ? `Savings $${career.money}` : 'No savings yet',
    'Apply in person downtown: press E at the police station, army office or fire station sign.',
  ] };
  const best = career.training?.best?.[job.id];
  return { hasJob: true, title: `${rank.title} · ${job.title}`, lines: [
    `${career.shifts} shift${career.shifts === 1 ? '' : 's'} worked · savings $${career.money}`,
    rank.nextTitle ? `${rank.shiftsToNext} more shift${rank.shiftsToNext === 1 ? '' : 's'} to ${rank.nextTitle}` : 'Top rank reached',
    job.hours[1] - job.hours[0] >= 1440 ? `${job.workplace}: open around the clock` : `${job.workplace}: shifts ${hour(job.hours[0])}–${hour(job.hours[1])}`,
    `${RANGE_DRILLS[job.id].title}: ${best ? `best ${Math.round(best * 100)}% (${gradeFor(best, 1).title})` : 'not taken yet'}`,
  ] };
}

/** Clock text for a message: "09:14" today, "Yesterday", or "Day 3". */
export function arrivedLabel(at, today) {
  if (at.day === today) return hour(at.minute);
  if (at.day === today - 1) return 'Yesterday';
  return `Day ${at.day}`;
}

const KEY = id => `tld-phone-v1:${id}`;
export function readPhone(characterId, storage = globalThis.localStorage) {
  try { return normalizePhone(JSON.parse(storage?.getItem(KEY(characterId)) ?? 'null')); } catch { return newPhone(); }
}
export function writePhone(characterId, phone, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY(characterId), JSON.stringify(phone)); return true; } catch { return false; }
}
