/**
 * Careers: police officer, soldier, firefighter. Apply at the workplace
 * downtown, work shifts there (the clock jumps, energy drops, you're paid),
 * and rise through the ranks. Each career has a uniform for the wardrobe.
 * Browser-local for now, like the look and the story.
 */
import { CITY_ORIGIN } from './cityLayout.mjs';
import { normalizeTraining } from './trainingRange.mjs';

export const SHIFT_HOURS = 4;
export const SHIFT_ENERGY = 30;

export const CAREERS = Object.freeze({
  police: Object.freeze({
    id: 'police', title: 'Police Officer', workplace: 'Police Station', building: 'Municipal Building',
    ranks: Object.freeze(['Cadet', 'Officer', 'Corporal', 'Sergeant', 'Detective', 'Lieutenant']),
    pay: Object.freeze([60, 95, 115, 135, 160, 190]), // per shift, by rank
    shiftsPerRank: 3,
    duties: Object.freeze(['Foot patrol on Pearl Street', 'Traffic stop on Broadway', 'Report writing at the station', 'Community meeting at the library', 'Lost-child call at Central Park']),
    uniform: Object.freeze({ top: 'longsleeve', outfit: 'navy', bottom: 'trousers', bottomColor: 'navy', shoes: 'dress', shoeColor: 'black' }),
    hours: Object.freeze([6 * 60, 22 * 60]),
  }),
  soldier: Object.freeze({
    id: 'soldier', title: 'Soldier', workplace: 'Army Recruiting Office', building: 'Randolph Center',
    ranks: Object.freeze(['Recruit', 'Private', 'Private First Class', 'Specialist', 'Corporal', 'Sergeant']),
    pay: Object.freeze([55, 85, 100, 120, 140, 165]),
    shiftsPerRank: 3,
    duties: Object.freeze(['Physical training: 5 km run', 'Drill and ceremony', 'Land navigation course', 'Equipment inspection', 'First-aid training']),
    uniform: Object.freeze({ top: 'tshirt', outfit: 'olive', bottom: 'trousers', bottomColor: 'olive', shoes: 'boots', shoeColor: 'brown' }),
    hours: Object.freeze([5 * 60, 20 * 60]),
  }),
  firefighter: Object.freeze({
    id: 'firefighter', title: 'Firefighter', workplace: 'Fire Station', building: 'Downtown Boulder Station',
    ranks: Object.freeze(['Probationary', 'Firefighter', 'Engineer', 'Lieutenant', 'Captain', 'Battalion Chief']),
    pay: Object.freeze([58, 90, 110, 135, 160, 185]),
    shiftsPerRank: 3,
    duties: Object.freeze(['Hose and ladder drills', 'Kitchen fire on Spruce Street', 'Station and truck checks', 'School fire-safety visit', 'Smoke alarm installs']),
    uniform: Object.freeze({ top: 'tshirt', outfit: 'navy', bottom: 'trousers', bottomColor: 'tan', shoes: 'boots', shoeColor: 'black' }),
    hours: Object.freeze([0, 24 * 60]),
  }),
});

export const NO_CAREER = Object.freeze({ career: null, shifts: 0, money: 0, lastShiftAt: null, training: Object.freeze({ best: Object.freeze({}), lastPaidAt: null }) });

export function normalizeCareer(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const career = safe.career in CAREERS ? safe.career : null;
  const count = v => Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  return { career, shifts: career ? count(safe.shifts) : 0, money: count(safe.money), lastShiftAt: Number.isFinite(safe.lastShiftAt) ? safe.lastShiftAt : null, training: normalizeTraining(safe.training) };
}

export function rankOf(state) {
  const job = CAREERS[state?.career];
  if (!job) return null;
  const index = Math.min(job.ranks.length - 1, Math.floor((state.shifts ?? 0) / job.shiftsPerRank));
  const nextAt = index < job.ranks.length - 1 ? (index + 1) * job.shiftsPerRank : null;
  return { index, title: job.ranks[index], nextTitle: nextAt === null ? null : job.ranks[index + 1], shiftsToNext: nextAt === null ? 0 : nextAt - state.shifts };
}

/** Join a career (switching starts over at the bottom rank; savings stay). */
export function joinCareer(state, career) {
  const current = normalizeCareer(state);
  if (!(career in CAREERS)) return current;
  if (current.career === career) return current;
  return { ...current, career, shifts: 0, lastShiftAt: null };
}
export function quitCareer(state) {
  return { ...normalizeCareer(state), career: null, shifts: 0, lastShiftAt: null };
}

/**
 * Work a shift at `totalMinutes` (life time) with `energy`. Shifts need the
 * workplace open, enough energy, and a break since the last shift. Returns
 * { ok, reason } or { ok, state, pay, duty, promoted, hours, energy }.
 */
export function workShift(state, { minute, totalMinutes, energy }) {
  const current = normalizeCareer(state);
  const job = CAREERS[current.career];
  if (!job) return { ok: false, reason: 'Apply for a job first.' };
  const [open, close] = job.hours;
  if (!(minute >= open && minute < close)) return { ok: false, reason: `${job.workplace} shifts start between ${fmt(open)} and ${fmt(close)}.` };
  if (!(energy >= SHIFT_ENERGY)) return { ok: false, reason: "You're too tired for a shift. Eat or sleep first." };
  if (current.lastShiftAt !== null && totalMinutes - current.lastShiftAt < SHIFT_HOURS * 60 + 120) {
    return { ok: false, reason: 'You just finished a shift. Take a break first.' };
  }
  const before = rankOf(current);
  const shifts = current.shifts + 1;
  const pay = job.pay[before.index];
  const next = { ...current, shifts, money: current.money + pay, lastShiftAt: totalMinutes + SHIFT_HOURS * 60 };
  const after = rankOf(next);
  return {
    ok: true, state: next, pay, hours: SHIFT_HOURS, energy: SHIFT_ENERGY,
    duty: job.duties[current.shifts % job.duties.length],
    promoted: after.index > before.index ? after.title : null,
  };
}
const fmt = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Workplace door (world) for a career: the building centre pushed out to a free spot by the caller's collider. */
export function workplaceCentre(city, career) {
  const job = CAREERS[career];
  const building = job && city?.buildings.find(b => b.name === job.building);
  if (!building) return null;
  const x = building.ring.reduce((s, p) => s + p[0], 0) / building.ring.length;
  const z = building.ring.reduce((s, p) => s + p[1], 0) / building.ring.length;
  return { local: [x, z], world: { x: CITY_ORIGIN.x + x, z: CITY_ORIGIN.z + z }, building };
}

/**
 * The walkable spot outside each workplace: the nearest point to the building centre that the collider leaves
 * free (rings outward from 2 m to 60 m, 32 directions each). Pure, so the map and taxi know the doors before the
 * downtown scene (and its signs) is built.
 * @param {{ blockedLocal: (x: number, z: number) => boolean }} collider
 */
export function workplaceDoors(city, collider) {
  const doors = new Map();
  for (const id of Object.keys(CAREERS)) {
    const centre = workplaceCentre(city, id);
    if (!centre) continue;
    const [cx, cz] = centre.local;
    let door = null;
    for (let r = 2; r < 60 && !door; r += 0.5) {
      for (let a = 0; a < 32; a++) {
        const x = cx + Math.cos(a / 32 * Math.PI * 2) * r; const z = cz + Math.sin(a / 32 * Math.PI * 2) * r;
        if (!collider.blockedLocal(x, z)) { door = [x, z]; break; }
      }
    }
    if (door) doors.set(id, { x: CITY_ORIGIN.x + door[0], z: CITY_ORIGIN.z + door[1] });
  }
  return doors;
}

const KEY = 'tld-career-v1:';
export function readCareer(characterId, storage = globalThis.localStorage) {
  try { return normalizeCareer(JSON.parse(storage?.getItem(KEY + characterId) ?? 'null')); } catch { return { ...NO_CAREER }; }
}
export function writeCareer(characterId, state, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY + characterId, JSON.stringify(normalizeCareer(state))); return true; } catch { return false; }
}
