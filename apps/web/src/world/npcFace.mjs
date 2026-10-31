import { advanceSharedFacialMorph } from './facialMorphSync.mjs';
import { idleGazeTarget } from './gazeDynamics.mjs';

const FACIAL_MORPH = /^(?:eye(?:Look(?:Up|Down)|Wide|Squint)(?:Left|Right)|brow(?:InnerUp|DownLeft|DownRight)|cheekSquint(?:Left|Right)|jawOpen|mouth(?:Open|SmileLeft|SmileRight|FrownLeft|FrownRight|PressLeft|PressRight))$/;

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
  return { elapsed: (id * 0.83) % 14.4, motions: new Map(), frame: new Map() };
}

/** Small, bounded poses layered over each resident's existing locomotion/action clips. */
export function npcFaceTarget(name, elapsed, { talking = false, nearby = false, moving = false, flinch = 0, emotion = 'neutral' } = {}) {
  if (!FACIAL_MORPH.test(name)) return 0;
  const startled = Number.isFinite(flinch) ? Math.min(1, Math.max(0, flinch)) : 0;
  const composure = 1 - startled;
  const sad = emotion === 'sad' ? composure : 0;
  const happy = emotion === 'happy' ? composure : 0;
  const speaking = talking && !moving ? composure : 0;
  const greeting = nearby && !moving ? composure : 0;
  // Invalid timestamps must not propagate NaN to morphs or disrupt a resident.
  const time = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
  // Two non-commensurate rhythms suggest syllables without claiming lip-sync.
  const syllables = Math.pow(Math.max(0, Math.sin(time * 10.7) * 0.7 + Math.sin(time * 17.3) * 0.3), 2);
  let pose = 0;
  if (name === 'jawOpen') pose = speaking * (0.06 + syllables * 0.24) + startled * 0.13 + sad * 0.035;
  else if (name === 'mouthOpen') pose = speaking * (0.04 + syllables * 0.19) + startled * 0.28;
  else if (name.startsWith('mouthSmile')) {
    // A hurt resident must not grin simply because they are speaking or the
    // player is nearby. Positive conversation still lifts the mouth corners.
    const warmth = sad ? 0 : speaking * 0.16 + greeting * 0.08 + happy * 0.28;
    pose = warmth * (name.endsWith('Left') ? 0.94 : 1);
  } else if (name.startsWith('mouthFrown')) {
    pose = sad * (name.endsWith('Left') ? 0.46 : 0.40);
  } else if (name.startsWith('mouthPress')) pose = sad * 0.08;
  else if (name.startsWith('cheekSquint')) pose = speaking * 0.06 + greeting * 0.03 + happy * 0.16;
  else if (name === 'browInnerUp') pose = speaking * 0.06 + greeting * 0.09 + startled * 0.38 + sad * 0.30;
  else if (name.startsWith('eyeWide')) pose = startled * (name.endsWith('Left') ? 0.44 : 0.46);
  else if (name.startsWith('eyeSquint')) pose = sad * (name.endsWith('Left') ? 0.19 : 0.15);
  else if (name.startsWith('eyeLook')) {
    // Sadness lowers the gaze while neutral idle glances remain independent.
    // A Hit reaction interrupts both; eye blink masking is handled downstream.
    const down = name.startsWith('eyeLookDown') ? sad * (name.endsWith('Left') ? 0.24 : 0.21) : 0;
    pose = down + composure * idleGazeTarget(name, time, 'neutral',
      moving || talking || startled > 0.1 || emotion !== 'neutral' ? 1 : 0);
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
  const frame = state?.frame instanceof Map ? state.frame : new Map();
  frame.clear();
  for (const morph of targets) {
    morph.influence = advanceSharedFacialMorph(
      morph.name, morph.influence, npcFaceTarget(morph.name, elapsed, context),
      dt, context.blink, motions, frame,
    );
  }
  return { elapsed, motions, frame };
}

/** Reset invisible residents so a previous surprise does not reappear hours later. */
export function resetNpcFace(state, targets) {
  for (const morph of targets) morph.influence = 0;
  return { elapsed: Number.isFinite(state?.elapsed) ? state.elapsed : 0, motions: new Map(), frame: new Map() };
}
