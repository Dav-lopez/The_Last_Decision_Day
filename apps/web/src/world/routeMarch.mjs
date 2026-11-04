/**
 * Scored route march (open-world 16c). A soldier's duty is five checkpoints on foot (careerTasks.mjs); this module
 * scores it. Every leg has its own split par from the distance walked, and every checkpoint asks for a bearing to
 * the next one (map and compass drill: three compass points, one of them right). Points per checkpoint: up to 3 for
 * the split, 2 for the right bearing. The total grades the march and adds a bonus on top of the time bonus.
 * Pure and city-local (x east, z north), so the scene only shows the card and passes the choice back.
 */

export const PACE = 3.2;           // par pace in m/s, the same jog careerTasks.mjs uses for the whole run
export const STOP_SECONDS = 8;     // par allowance per checkpoint
export const DRILL_SECONDS = 4;    // par allowance per bearing call
export const BEARING_POINTS = 2;

export const COMPASS = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
export const COMPASS_NAMES = Object.freeze({
  N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west',
});

/** Split bands: a leg walked within `within` × its par earns `points`. */
export const PACES = Object.freeze([
  Object.freeze({ id: 'sharp', title: 'Sharp', within: 0.85, points: 3 }),
  Object.freeze({ id: 'on-pace', title: 'On pace', within: 1, points: 2 }),
  Object.freeze({ id: 'steady', title: 'Steady', within: 1.35, points: 1 }),
  Object.freeze({ id: 'behind', title: 'Behind', within: Infinity, points: 0 }),
]);

/** Final grades by share of the maximum score, and the bonus on the shift's base pay. */
export const GRADES = Object.freeze([
  Object.freeze({ id: 'distinction', title: 'Distinction', share: 0.8, rate: 0.4 }),
  Object.freeze({ id: 'pass', title: 'Pass', share: 0.55, rate: 0.2 }),
  Object.freeze({ id: 'needs-work', title: 'Needs work', share: -Infinity, rate: 0 }),
]);

const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);

/** Compass point (index into COMPASS) from `from` to `to`: 0 = north (+z), clockwise. */
export function bearingIndex(from, to) {
  if (!finite(from) || !finite(to)) return 0;
  const angle = Math.atan2(to.x - from.x, to.z - from.z); // 0 north, +π/2 east
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

/**
 * A march scorecard for a planned route march (the task from planTask: regular stops, then the door).
 * Each leg runs from the previous checkpoint (the door for the first) to the next; its par is the jog at PACE
 * over the same 1.25× street allowance as the whole run, plus the checkpoint allowance.
 */
export function createMarch(task) {
  const stops = task?.stops ?? [];
  const door = stops[stops.length - 1];
  if (!door || stops.length < 2) return null;
  const legs = [];
  let previous = door;
  for (let i = 0; i < stops.length - 1; i++) {
    const stop = stops[i];
    const distance = Math.hypot(stop.x - previous.x, stop.z - previous.z) * 1.25;
    const to = stops[i + 1];
    legs.push({ par: Math.ceil(distance / PACE + STOP_SECONDS), split: null, pace: null, points: 0,
      answer: COMPASS[bearingIndex(stop, to)], toFinal: Boolean(to.final), called: null, correct: null });
    previous = stop;
  }
  return { legs, legStart: 0, score: 0 };
}

/** Pace band for a leg walked in `split` seconds against `par`. */
export function paceFor(split, par) {
  const ratio = par > 0 ? split / par : Infinity;
  return PACES.find(p => ratio <= p.within) ?? PACES[PACES.length - 1];
}

/** Arrived at checkpoint `index` with the run's clock at `elapsed`: record the split. */
export function markLeg(march, index, elapsed) {
  const leg = march?.legs[index];
  if (!leg || leg.split !== null) return { march, leg: null };
  const split = Math.max(0, (Number(elapsed) || 0) - march.legStart);
  const pace = paceFor(split, leg.par);
  const legs = march.legs.slice();
  legs[index] = { ...leg, split: Math.round(split), pace: pace.id, points: pace.points };
  return { march: { ...march, legs, score: march.score + pace.points }, leg: { ...legs[index], title: pace.title } };
}

/**
 * The three compass points offered at checkpoint `index`: the right one and the two at right angles to it, in a
 * shuffled order that is fixed for the checkpoint (so the keys don't move under you).
 */
export function bearingOptions(march, index) {
  const leg = march?.legs[index];
  if (!leg) return [];
  const right = COMPASS.indexOf(leg.answer);
  const options = [right, (right + 2) % 8, (right + 6) % 8].map(i => COMPASS[i]);
  const shift = (index * 2 + right) % 3;
  return [...options.slice(shift), ...options.slice(0, shift)];
}

/** The card shown while you call the bearing at checkpoint `index`. */
export function drillStatus(march, index) {
  const leg = march?.legs[index];
  if (!leg) return null;
  const target = leg.toFinal ? 'the Recruiting Office' : `checkpoint ${index + 2}`;
  return {
    index,
    prompt: `Map and compass: which way is ${target}? Check the N on the minimap.`,
    options: bearingOptions(march, index).map(point => `${point} · ${COMPASS_NAMES[point]}`),
    split: leg.split, par: leg.par, pace: leg.pace,
  };
}

/**
 * Call the bearing at checkpoint `index` with option `choice` (0-based, as offered). The checkpoint is then done;
 * returns the new scorecard, whether it was right and the line to show.
 */
export function callBearing(march, index, choice) {
  const leg = march?.legs[index];
  const options = bearingOptions(march, index);
  if (!leg || leg.called !== null || !Number.isInteger(choice) || choice < 0 || choice >= options.length) return { march, correct: null, line: null };
  const called = options[choice];
  const correct = called === leg.answer;
  const points = correct ? BEARING_POINTS : 0;
  const legs = march.legs.slice();
  legs[index] = { ...leg, called, correct, points: leg.points + points };
  const line = correct ? `Bearing ${COMPASS_NAMES[called]}: correct.` : `Bearing ${COMPASS_NAMES[called]}: no, it's ${COMPASS_NAMES[leg.answer]}.`;
  return { march: { ...march, legs, score: march.score + points }, correct, line };
}

/** The next leg starts when you leave a checkpoint (after the bearing call). */
export function startLeg(march, elapsed) {
  if (!march) return march;
  return { ...march, legStart: Math.max(0, Number(elapsed) || 0) };
}

/** Score, maximum and grade for the whole march; `rate` is the share of base pay added as a bonus. */
export function marchResult(march) {
  const legs = march?.legs ?? [];
  const max = legs.length * (PACES[0].points + BEARING_POINTS);
  const score = legs.reduce((sum, leg) => sum + leg.points, 0);
  const share = max > 0 ? score / max : 0;
  const grade = GRADES.find(g => share >= g.share) ?? GRADES[GRADES.length - 1];
  const bearings = legs.filter(leg => leg.correct).length;
  return { score, max, grade: grade.id, title: grade.title, rate: grade.rate, bearings, legs: legs.length };
}
