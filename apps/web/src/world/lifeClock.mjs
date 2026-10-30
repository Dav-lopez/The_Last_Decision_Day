/**
 * In-game day clock and energy. Pure rules; the scene advances them each frame.
 * One real second is one game minute, so a full day lasts 24 real minutes.
 */
export const MINUTES_PER_DAY = 24 * 60;
export const GAME_MINUTES_PER_SECOND = 1;
export const WAKE_MINUTE = 7 * 60;
export const EVENING_START = 19 * 60;
export const MORNING_START = 6 * 60;
export const BED_RANGE = 1.3;
/** Awake, energy lasts ~16 game hours; running costs double, driving a little less. */
export const ENERGY_DRAIN_PER_MINUTE = 100 / (16 * 60);
export const ENERGY_PER_HOUR_SLEPT = 12.5;
export const TIRED_ENERGY = 25;
export const SLEEPY_THRESHOLD = 90;
const ACTIVITY_COST = Object.freeze({ idle: 1, walk: 1, run: 2, drive: 0.8 });

export const NEW_LIFE = Object.freeze({ day: 1, minute: WAKE_MINUTE, energy: 100 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeLife(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const day = Number.isInteger(safe.day) && safe.day >= 1 ? safe.day : NEW_LIFE.day;
  const minute = Number.isFinite(safe.minute) ? clamp(safe.minute, 0, MINUTES_PER_DAY - 0.001) : NEW_LIFE.minute;
  const energy = Number.isFinite(safe.energy) ? clamp(safe.energy, 0, 100) : NEW_LIFE.energy;
  return { day, minute, energy };
}

/** Advance real seconds of play. Days roll over at midnight. */
export function advanceLife(life, seconds, activity = 'idle') {
  const state = normalizeLife(life);
  if (!Number.isFinite(seconds) || seconds <= 0) return state;
  const minutes = Math.min(seconds, 1) * GAME_MINUTES_PER_SECOND;
  const total = state.minute + minutes;
  const cost = ACTIVITY_COST[activity] ?? 1;
  return {
    day: state.day + Math.floor(total / MINUTES_PER_DAY),
    minute: total % MINUTES_PER_DAY,
    energy: clamp(state.energy - minutes * ENERGY_DRAIN_PER_MINUTE * cost, 0, 100),
  };
}

export function isEvening(minute) {
  return minute >= EVENING_START || minute < MORNING_START;
}

export function isExhausted(life) {
  return normalizeLife(life).energy <= 0;
}

/** Whether going to bed is allowed now, with the reason shown to the player when it isn't. */
export function canSleep(life) {
  const state = normalizeLife(life);
  if (state.energy >= SLEEPY_THRESHOLD && !isEvening(state.minute)) return { ok: false, reason: "You're not tired yet." };
  return { ok: true, reason: '' };
}

/**
 * Sleep until 7:00 — the same morning when it's after midnight, otherwise the
 * next morning. Energy returns with each hour slept.
 */
export function sleepUntilMorning(life) {
  const state = normalizeLife(life);
  const sameMorning = state.minute < WAKE_MINUTE;
  const minutesSlept = sameMorning ? WAKE_MINUTE - state.minute : MINUTES_PER_DAY - state.minute + WAKE_MINUTE;
  return {
    life: {
      day: sameMorning ? state.day : state.day + 1,
      minute: WAKE_MINUTE,
      energy: clamp(state.energy + (minutesSlept / 60) * ENERGY_PER_HOUR_SLEPT, 0, 100),
    },
    hoursSlept: minutesSlept / 60,
  };
}

export function nearBed(position, bedSide, range = BED_RANGE) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.z) &&
    Math.hypot(position.x - bedSide.x, position.z - bedSide.z) <= range;
}

export function formatClock(minute) {
  const total = Math.floor(normalizeLife({ minute }).minute);
  const hours24 = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function storageKey(characterId) {
  return `tld-life-v1:${characterId}`;
}
export function readLife(characterId, storage = globalThis.localStorage) {
  try {
    return normalizeLife(JSON.parse(storage?.getItem(storageKey(characterId)) ?? 'null'));
  } catch {
    return { ...NEW_LIFE };
  }
}
export function writeLife(characterId, life, storage = globalThis.localStorage) {
  try {
    storage?.setItem(storageKey(characterId), JSON.stringify(normalizeLife(life)));
    return true;
  } catch {
    return false;
  }
}
