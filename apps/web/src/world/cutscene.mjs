/**
 * Directed story scenes (open-world 19a). While a story scene is on screen the
 * third-person camera is taken over by a small "director": every line gets a
 * shot chosen from who is speaking and where they stand, with a slow move
 * inside the shot and a hard cut between shots, like a film.
 *
 * Pure: plans and camera poses are plain numbers, so they are tested in node
 * and the scene just copies a pose onto the ArcRotateCamera each frame.
 *
 * Camera convention (Babylon's ArcRotateCamera): the camera sits at
 * target + radius · (cos α sin β, cos β, sin α sin β).
 */
import { CAST, CHAPTERS, DECISIONS } from './storyChapters.mjs';

/** How long one shot's slow move lasts; after that the shot holds still. */
export const SHOT_SECONDS = 7;
/** Story speakers who are also people in the world (speaker id → resident id in npcConversations). */
export const SPEAKER_RESIDENTS = Object.freeze({
  maya: 'student-a', jordan: 'student-b', rivera: 'teacher', okafor: 'neighbor-east',
  tess: 'jogger-west', marcus: 'walker-east', ruth: 'crosser',
});
/** Someone this close (metres) is "in the scene" and gets their own shots. */
export const NEAR_METRES = 9;
export const SHOT_KINDS = Object.freeze(['establish', 'crane', 'narration', 'phone', 'speaker', 'reverse', 'close', 'listen', 'detail', 'push']);

const clamp01 = value => Math.max(0, Math.min(1, value));
const ease = t => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * What kind of scene this step's is: a chapter 'opening' (first step), an
 * 'ending' (the decision's aftermath and the epilogue) or an ordinary 'scene'.
 */
export function sceneMood(state) {
  const chapter = CHAPTERS[state?.chapter] ?? CHAPTERS[0];
  const index = Number.isInteger(state?.step) ? state.step : 0;
  const step = chapter.steps[index];
  if (!step) return 'scene';
  if (step.final || chapter.steps[index - 1]?.decide) return 'ending';
  return index === 0 ? 'opening' : 'scene';
}

/**
 * The title card shown over the first shot: the chapter's name when a chapter
 * opens, and the ending you chose on the epilogue. Null for other scenes.
 */
export function sceneCard(state) {
  const chapter = CHAPTERS[state?.chapter] ?? CHAPTERS[0];
  const step = chapter.steps[Number.isInteger(state?.step) ? state.step : 0];
  if (!step) return null;
  if (step.final) {
    const ending = Object.values(DECISIONS).find(decision => decision.id === state?.decision);
    return { kicker: 'Ending', title: ending ? ending.title : 'The Last Decision Day' };
  }
  if (sceneMood(state) !== 'opening') return null;
  const [number, ...name] = chapter.title.split(' · ');
  return { kicker: name.length ? number : 'Chapter', title: name.length ? name.join(' · ') : chapter.title };
}

/**
 * One shot per line. `near(speaker)` says whether that speaker stands close
 * by in the world right now. A shot that carries straight on from the last one
 * (same kind, same subject) is marked `hold`, so its slow move keeps going
 * instead of restarting.
 */
export function planShots(lines, { mood = 'scene', near = () => false } = {}) {
  const shots = [];
  let partner = null;
  for (let index = 0; index < (lines?.length ?? 0); index++) {
    const { speaker, beat } = lines[index];
    const tone = CAST[speaker]?.tone;
    const present = speaker in SPEAKER_RESIDENTS && near(speaker);
    if (present) partner = speaker;
    let kind;
    if (index === 0 && (mood === 'opening' || mood === 'ending')) kind = mood === 'ending' ? 'crane' : 'establish';
    // Staged beats (19b): over your shoulder at what you're reaching for, or a slow push-in as it dawns on you.
    else if (beat === 'photo') kind = 'detail';
    else if (beat === 'reveal') kind = 'push';
    else if (tone === 'phone' || tone === 'mystery') kind = 'phone';
    else if (speaker === 'narrator') kind = mood === 'ending' ? 'crane' : 'narration';
    else if (speaker === 'you') kind = partner ? 'reverse' : 'close';
    else kind = present ? 'speaker' : 'listen';
    const subject = kind === 'speaker' ? speaker : kind === 'reverse' ? partner : null;
    const previous = shots[index - 1];
    shots.push({ kind, speaker, subject, hold: Boolean(previous && previous.kind === kind && previous.subject === subject) });
  }
  return shots;
}

/** Converts a camera position and the point it looks at into ArcRotateCamera angles. */
export function orbitFrom(camera, target) {
  const dx = camera.x - target.x, dy = camera.y - target.y, dz = camera.z - target.z;
  const radius = Math.max(0.5, Math.hypot(dx, dy, dz));
  return { target: { ...target }, alpha: Math.atan2(dz, dx), beta: Math.acos(Math.max(-1, Math.min(1, dy / radius))), radius };
}

/**
 * The camera for `shot` after `seconds` in it. `ctx` holds where the player
 * stands, the subject's position (for two-person shots), the orbit angle the
 * player's camera had when the scene began (so the first shot keeps their
 * bearings), whether we're indoors (tighter, higher shots under the cutaway
 * ceiling) and reduced motion (every shot holds still).
 */
export function shotPose(shot, ctx, seconds) {
  const { player, other = null, baseAlpha = Math.PI / 2, indoor = false, reduced = false } = ctx;
  const t = reduced ? 0.5 : ease(seconds / SHOT_SECONDS);
  const head = (at, y) => ({ x: at.x, y, z: at.z });
  const orbit = (target, alpha, beta, radius) => ({ target, alpha, beta, radius });
  const kind = shot?.kind ?? 'narration';
  // Two-person shots: over the listener's shoulder at the speaker, pushing in slowly.
  if ((kind === 'speaker' || kind === 'reverse') && other) {
    const listener = kind === 'speaker' ? player : other;
    const talker = kind === 'speaker' ? other : player;
    let dx = talker.x - listener.x, dz = talker.z - listener.z;
    const gap = Math.hypot(dx, dz);
    if (gap > 0.3) {
      dx /= gap; dz /= gap;
      const back = lerp(1.25, 0.95, t), side = 0.6;
      // The shoulder the camera looks over: right for the player's shots, left for the reverse, so the eyelines meet.
      const hand = kind === 'speaker' ? 1 : -1;
      const camera = { x: listener.x - dx * back - dz * side * hand, y: indoor ? 1.85 : 1.72, z: listener.z - dz * back + dx * side * hand };
      const look = { x: lerp(talker.x, listener.x, 0.12), y: 1.5, z: lerp(talker.z, listener.z, 0.12) };
      return orbitFrom(camera, look);
    }
  }
  // Which way the player's camera was looking when the scene began: "ahead" for staged shots.
  const ahead = { x: -Math.cos(baseAlpha), z: -Math.sin(baseAlpha) };
  switch (kind) {
    case 'detail': {
      // Low over the right shoulder, looking past you at something on the wall ahead (the old team photo),
      // creeping closer.
      const back = lerp(1.35, 0.85, t), side = 0.45;
      const camera = { x: player.x - ahead.x * back - ahead.z * side, y: lerp(1.3, 1.42, t), z: player.z - ahead.z * back + ahead.x * side };
      const reach = indoor ? 1.6 : 2.2;
      return orbitFrom(camera, { x: player.x + ahead.x * reach, y: 1.72, z: player.z + ahead.z * reach });
    }
    case 'push':
      // The penny drops: a slow push from a close-up into an extreme close-up, almost straight on.
      return orbit(head(player, 1.6), baseAlpha + Math.PI - lerp(0.32, 0.18, t), indoor ? 1.32 : 1.45, lerp(3.1, 1.45, t));
    case 'establish':
      return indoor ? orbit(head(player, 1.2), baseAlpha + lerp(0.45, 0.15, t), lerp(0.7, 0.82, t), lerp(10, 8, t))
        : orbit(head(player, lerp(1.6, 1.3, t)), baseAlpha + lerp(0.5, 0.15, t), lerp(0.86, 1.08, t), lerp(17, 10, t));
    case 'crane':
      return indoor ? orbit(head(player, 1.2), baseAlpha + lerp(0, 0.4, t), lerp(0.95, 0.62, t), lerp(5, 9, t))
        : orbit(head(player, lerp(1.4, 2.6, t)), baseAlpha + lerp(-0.2, 0.35, t), lerp(1.25, 0.72, t), lerp(6, 21, t));
    case 'phone':
      // Close over the shoulder, looking down at the phone in their hands.
      return orbit(head(player, 1.22), baseAlpha + lerp(0.55, 0.65, t), indoor ? 0.86 : 0.95, lerp(2.7, 2.35, t));
    case 'close':
    case 'reverse':
      // The player alone, three-quarters front.
      return orbit(head(player, 1.52), baseAlpha + Math.PI - lerp(0.62, 0.52, t), indoor ? 1.2 : 1.38, lerp(3.3, 2.8, t));
    case 'listen':
      // Someone not in the scene is speaking (a voice, a memory): hold on the player, listening.
      return orbit(head(player, 1.45), baseAlpha + Math.PI + lerp(0.75, 0.6, t), indoor ? 1.05 : 1.3, lerp(4.8, 4.3, t));
    case 'speaker':
    case 'narration':
    default:
      return indoor ? orbit(head(player, 1.2), baseAlpha + lerp(-0.2, -0.35, t), 0.8, lerp(8.5, 7.8, t))
        : orbit(head(player, 1.35), baseAlpha + lerp(-0.25, -0.42, t), 1.12, lerp(8.8, 7.6, t));
  }
}
