/**
 * Deterministic, lightweight mouth motion for the playable character's Talk and
 * SitTalk body actions. This is timed articulation, not audio-driven lip sync.
 * The action mixer supplies the fade weight so the face releases smoothly when
 * dialogue ends. Unknown morphs/legacy GLBs safely receive zero influence.
 */
const SPEAKING_ACTIONS = new Set(['Talk', 'SitTalk']);
const SPEECH_MORPHS = new Set(['jawOpen', 'mouthOpen', 'mouthPressLeft', 'mouthPressRight',
  'mouthSmileLeft', 'mouthSmileRight']);
const clamp01 = value => Math.max(0, Math.min(1, value));
const smoothstep = t => t * t * (3 - 2 * t);

/** @param {string} name @param {{name:string,elapsed:number}|null} action @param {number} weight */
export function actionFacialWeight(name, action, weight) {
  if (!SPEECH_MORPHS.has(name) || !SPEAKING_ACTIONS.has(action?.name) ||
      !Number.isFinite(action.elapsed) || action.elapsed < 0 ||
      !Number.isFinite(weight) || weight <= 0) return 0;
  const t = action.elapsed;
  // A short pause every 2.6 seconds keeps the mouth from cycling continuously.
  // Ease into silence instead of snapping shut at the phrase boundary.
  const phase = t % 2.6;
  const phrase = phase <= 1.95 ? 1 : phase >= 2.15 ? 0 :
    1 - smoothstep((phase - 1.95) / 0.2);
  const syllable = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 3.2)), 0.8);
  const inflection = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.75 + 0.8);
  const opening = phrase * (0.14 + 0.65 * syllable) * (0.8 + 0.2 * inflection);
  const closure = phrase * (1 - syllable);
  // Avoid allocating an object for each of the ~27 morph targets per frame.
  let influence;
  switch (name) {
    case 'jawOpen': influence = opening * 0.48; break;
    case 'mouthOpen': influence = opening * 0.69; break;
    case 'mouthPressLeft': influence = closure * 0.13; break;
    case 'mouthPressRight': influence = closure * 0.10; break;
    case 'mouthSmileLeft': influence = phrase * (0.04 + inflection * 0.07); break;
    case 'mouthSmileRight': influence = phrase * (0.03 + inflection * 0.06); break;
    default: return 0;
  }
  return clamp01(influence * clamp01(weight));
}
