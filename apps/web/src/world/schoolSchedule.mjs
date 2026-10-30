/**
 * The school day. Doors open 7:30 AM–4:00 PM; four 90-minute lessons with
 * breaks and lunch. Taking a class skips to the end of the lesson and costs
 * less energy than walking about (you're sitting down).
 */
import { ENERGY_DRAIN_PER_MINUTE, formatClock, normalizeLife } from './lifeClock.mjs';

export const SCHOOL_OPENS = 7 * 60 + 30;
export const SCHOOL_CLOSES = 16 * 60;
/** You may take your seat from 5 minutes before a lesson until 15 minutes into it. */
export const EARLY_MINUTES = 5;
export const LATE_MINUTES = 15;
export const CLASS_ENERGY_FACTOR = 0.6;

const lesson = (id, title, start, end) => Object.freeze({ id, title, start, end, kind: 'class' });
export const TIMETABLE = Object.freeze([
  lesson('math', 'Math', 8 * 60, 9 * 60 + 30),
  lesson('science', 'Science', 9 * 60 + 45, 11 * 60 + 15),
  Object.freeze({ id: 'lunch', title: 'Lunch', start: 11 * 60 + 15, end: 12 * 60, kind: 'break' }),
  lesson('history', 'History', 12 * 60, 13 * 60 + 30),
  lesson('art', 'Art', 13 * 60 + 45, 15 * 60 + 15),
]);
const LESSONS = TIMETABLE.filter(entry => entry.kind === 'class');

export function isSchoolOpen(minute) {
  return Number.isFinite(minute) && minute >= SCHOOL_OPENS && minute < SCHOOL_CLOSES;
}

/** The timetable entry happening now (lesson or lunch), if any. */
export function currentEntry(minute) {
  return TIMETABLE.find(entry => minute >= entry.start && minute < entry.end) ?? null;
}

/** The lesson you can still join right now, if any. */
export function joinableLesson(minute) {
  if (!Number.isFinite(minute)) return null;
  return LESSONS.find(entry => minute >= entry.start - EARLY_MINUTES && minute <= entry.start + LATE_MINUTES) ?? null;
}

export function nextLesson(minute) {
  return LESSONS.find(entry => entry.start > minute) ?? null;
}

/**
 * Sit through a lesson: the clock jumps to its end and energy drains for the
 * time spent, at the seated rate. Returns null if the lesson can't be joined now.
 */
export function attendLesson(life, minute = normalizeLife(life).minute) {
  const state = normalizeLife(life);
  const entry = joinableLesson(minute);
  if (!entry) return null;
  const spent = Math.max(0, entry.end - state.minute);
  return {
    lesson: entry,
    life: {
      day: state.day,
      minute: entry.end,
      energy: Math.max(0, state.energy - spent * ENERGY_DRAIN_PER_MINUTE * CLASS_ENERGY_FACTOR),
    },
  };
}

/** One line for the chalkboard and the HUD. */
export function schoolStatus(minute) {
  if (!isSchoolOpen(minute)) return `School is closed · opens ${formatClock(SCHOOL_OPENS)}`;
  const now = currentEntry(minute);
  const joinable = joinableLesson(minute);
  if (joinable) return `${joinable.title} · ${formatClock(joinable.start)}–${formatClock(joinable.end)} · take a seat`;
  if (now?.kind === 'class') return `${now.title} in progress until ${formatClock(now.end)}`;
  const next = nextLesson(minute);
  if (now?.kind === 'break') return `Lunch until ${formatClock(now.end)}${next ? ` · next: ${next.title}` : ''}`;
  return next ? `Next: ${next.title} at ${formatClock(next.start)}` : 'Lessons are over for today';
}
