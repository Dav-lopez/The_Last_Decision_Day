/**
 * Cosmetic car damage (open-world item 13): scratches and dents from bumps.
 * Renderer-independent: decides how hard a knock was, which panel took it,
 * where on that panel the mark goes and whether it is a scratch or a dent.
 * Car-local coordinates: x to the right, z forwards (metres), like vehicleDrive.
 */
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from './streetLayout.mjs';

export const DAMAGE = Object.freeze({
  minSpeed: 1.4,     // m/s: slower knocks leave nothing
  fullSpeed: 8.5,    // m/s: a knock this hard is the worst a single bump can do
  dentAbove: 0.45,   // severity at which a mark becomes a dent rather than a scratch
  scrapeBelow: 0.4,  // a light knock while steering scrapes the side instead of the nose
  mergeRadius: 0.42, // metres: a new knock this close to an old mark deepens it
  panelWear: 0.6,    // panel damage added per unit of severity
  maxMarks: 10,
});

export const PANELS = Object.freeze(['front', 'rear', 'left', 'right']);

export function createCarDamage() {
  return { panels: { front: 0, rear: 0, left: 0, right: 0 }, marks: [], hits: 0 };
}

/** 0 for a nudge, rising to 1 for a full-speed knock. */
export function impactSeverity(speed) {
  const value = Math.abs(Number(speed) || 0);
  if (!Number.isFinite(value) || value <= DAMAGE.minSpeed) return 0;
  return Math.min(1, (value - DAMAGE.minSpeed) / (DAMAGE.fullSpeed - DAMAGE.minSpeed));
}

/** A small repeatable wobble so marks don't all land on the same spot. */
function jitter(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Where a knock lands. Driving forwards the nose takes it, reversing the tail;
 * steering moves the hit towards that corner, and a light knock while steering
 * scrapes down the side instead.
 */
export function impactSpot({ speed = 0, steer = 0 } = {}, severity, seed = 0) {
  const forwards = (Number(speed) || 0) >= 0;
  const turn = Math.max(-1, Math.min(1, Number(steer) || 0));
  const end = forwards ? 1 : -1;
  if (turn !== 0 && severity < DAMAGE.scrapeBelow) {
    // Turning right (forwards) swings the right flank into whatever is there.
    const side = (forwards ? turn : -turn) > 0 ? 'right' : 'left';
    const along = end * CAR_HALF_LENGTH * (0.55 + 0.25 * jitter(seed + 1));
    return { panel: side, x: (side === 'right' ? 1 : -1) * CAR_HALF_WIDTH, z: along };
  }
  const across = Math.max(-0.8, Math.min(0.8, turn * 0.55 + 0.22 * jitter(seed + 2))) * CAR_HALF_WIDTH;
  return { panel: forwards ? 'front' : 'rear', x: across, z: end * CAR_HALF_LENGTH };
}

/**
 * Record a knock. Returns the new damage state and the mark that changed
 * (null for a nudge): `replaces` names an older mark it deepened or pushed out.
 */
export function applyImpact(state, input = {}) {
  const severity = impactSeverity(input.speed);
  if (severity <= 0) return { state, mark: null, replaces: null };
  const hits = state.hits + 1;
  const spot = impactSpot(input, severity, hits);
  const panels = { ...state.panels, [spot.panel]: Math.min(1, state.panels[spot.panel] + severity * DAMAGE.panelWear) };
  const near = state.marks.find(mark => mark.panel === spot.panel && Math.hypot(mark.x - spot.x, mark.z - spot.z) < DAMAGE.mergeRadius);
  let marks;
  let mark;
  let replaces = null;
  if (near) {
    const deeper = Math.min(1, Math.max(near.severity, severity) + severity * 0.25);
    mark = { ...near, id: `${near.id.split('~')[0]}~${hits}`, severity: deeper, kind: deeper >= DAMAGE.dentAbove ? 'dent' : near.kind, size: markSize(deeper) };
    replaces = near.id;
    marks = state.marks.map(item => item === near ? mark : item);
  } else {
    mark = { id: `m${hits}`, panel: spot.panel, x: spot.x, z: spot.z, severity, kind: severity >= DAMAGE.dentAbove ? 'dent' : 'scratch', size: markSize(severity), angle: jitter(hits + 3) * 0.6 };
    marks = [...state.marks, mark];
    if (marks.length > DAMAGE.maxMarks) {
      // Out of room: the faintest old scratch makes way.
      const drop = marks.slice(0, -1).reduce((weakest, item) => item.severity < weakest.severity ? item : weakest);
      replaces = drop.id;
      marks = marks.filter(item => item !== drop);
    }
  }
  return { state: { panels, marks, hits }, mark, replaces };
}

/** Decal size in metres for a mark of this severity. */
export function markSize(severity) {
  return 0.32 + 0.38 * Math.max(0, Math.min(1, severity));
}

/** Bodywork condition, 100 % for a clean car. */
export function bodyCondition(state) {
  const wear = PANELS.reduce((sum, panel) => sum + (state?.panels?.[panel] ?? 0), 0);
  return Math.max(0, Math.min(100, Math.round(100 - wear * 25)));
}

/** A short word for the drive HUD. */
export function conditionLabel(percent) {
  if (percent >= 100) return 'Clean';
  if (percent >= 85) return 'Scratched';
  if (percent >= 60) return 'Dented';
  return 'Battered';
}

/**
 * How many marks to draw per car at the current adaptive quality (its `scale`
 * is the hardware scaling level: higher means fewer pixels, as for skid marks).
 */
export function marksForQuality(quality) {
  const scale = Number(quality?.scale) || 1;
  const base = Number(quality?.base) || 1;
  if (scale > base + 0.6) return 3;
  if (scale > base + 0.2) return 6;
  return DAMAGE.maxMarks;
}
