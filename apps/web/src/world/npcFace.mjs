import { advanceFacialMorph } from './faceDynamics.mjs';
import { composeEyeExpression } from './eyeExpression.mjs';
import { idleGazeTarget } from './gazeDynamics.mjs';

const FACIAL_MORPH = /^(?:eye(?:Look(?:Up|Down)|Wide|Squint)(?:Left|Right)|brow(?:InnerUp|DownLeft|DownRight)|cheekSquint(?:Left|Right)|jawOpen|mouth(?:Open|SmileLeft|SmileRight|PressLeft|PressRight))$/;

/** Collect only the cloned resident's expression morphs. Blink and droplet tracks have separate owners. */
export function collectNpcFaceTargets(meshes) {
  const targets = [];
  for (const mesh of meshes) {
    const manager = mesh.morphTargetManager;
    if (!manager) continue;
    for (let i = 0; i < manager.numTargets; i++) {
      const target = manager.getTarget(i);
      if (target && FACIAL_MORPH.test(target.name)) targets.push(target);
    }
  }
  return targets;
}

/** Stable offset keeps residents from speaking and glancing in synchrony. */
export function initialNpcFace(index) {
  const id = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  return { elapsed: (id * 0.83) % 14.4, motions: new Map() };
}

/** Small, bounded poses layered over each resident's existing locomotion/action clips. */
export function npcFaceTarget(name, elapsed, { talking = false, nearby = false, moving = false, flinch = 0, emotion = 'neutral' } = {}) {
  if (!FACIAL_MORPH.test(name)) return 0;
  const startled = Number.isFinite(flinch) ? Math.min(1, Math.max(0, flinch)) : 0;
  const speaking = talking && !moving ? 1 - startled : 0;
  const greeting = nearby && !moving ? 1 - startled : 0;
  // Two non-commensurate rhythms suggest syllables without claiming lip-sync.
  const syllables = Math.pow(Math.max(0, Math.sin(elapsed * 10.7) * 0.7 + Math.sin(elapsed * 17.3) * 0.3), 2);
  let pose = 0;
  if (name === 'jawOpen') pose = speaking * (0.06 + syllables * 0.24);
  else if (name === 'mouthOpen') pose = speaking * (0.04 + syllables * 0.19) + startled * 0.28;
  else if (name.startsWith('mouthSmile')) pose = (speaking * 0.16 + greeting * 0.08 + (emotion === 'happy' ? 0.28 : 0)) * (name.endsWith('Left') ? 0.94 : 1);
  else if (name.startsWith('mouthPress')) pose = emotion === 'sad' ? 0.20 : 0;
  else if (name.startsWith('cheekSquint')) pose = speaking * 0.06 + greeting * 0.03;
  else if (name === 'browInnerUp') pose = speaking * 0.06 + greeting * 0.09 + startled * 0.38 + (emotion === 'sad' ? 0.24 : 0);
  else if (name.startsWith('eyeWide')) pose = startled * 0.46;
  else if (name.startsWith('eyeLook')) {
    pose = idleGazeTarget(name, elapsed, 'neutral', moving || talking || startled > 0.1 ? 1 : 0);
  }
  return Math.min(1, Math.max(0, pose));
}

/**
 * Advance a resident's facial pose; do not touch blink, tears, sweat, or player morphs.
 * Long/invalid frames are bounded, and a new pose inherits existing morph velocity.
 */
export function advanceNpcFace(state, seconds, targets, context = {}) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  const elapsed = (Number.isFinite(state?.elapsed) ? Math.max(0, state.elapsed) : 0) + dt;
  const motions = state?.motions instanceof Map ? state.motions : new Map();
  for (const morph of targets) {
    const prior = motions.get(morph.name) ?? { value: Number.isFinite(morph.influence) ? morph.influence : 0, velocity: 0 };
    const next = advanceFacialMorph(prior, npcFaceTarget(morph.name, elapsed, context), dt, morph.name);
    motions.set(morph.name, next);
    morph.influence = composeEyeExpression(morph.name, next.value, context.blink);
  }
  return { elapsed, motions };
}

/** Reset invisible residents so a previous surprise does not reappear hours later. */
export function resetNpcFace(state, targets) {
  for (const morph of targets) morph.influence = 0;
  return { elapsed: Number.isFinite(state?.elapsed) ? state.elapsed : 0, motions: new Map() };
}
