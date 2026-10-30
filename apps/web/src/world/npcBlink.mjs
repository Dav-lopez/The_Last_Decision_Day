import { stepBlink } from './blinkCycle.mjs';

/** Give each resident a stable, different starting point in the natural blink cycle. */
export function initialNpcBlink(index) {
  const resident = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  return stepBlink({ elapsed: (0.35 + resident * 0.41) % 2.4, count: 0 }, 0);
}

/** Resolve morphs from each resident's cloned meshes, never the source container. */
export function collectNpcEyelids(meshes) {
  const left = [];
  const right = [];
  for (const mesh of meshes) {
    const manager = mesh.morphTargetManager;
    if (!manager) continue;
    for (let i = 0; i < manager.numTargets; i++) {
      const morph = manager.getTarget(i);
      if (morph.name === 'eyeBlinkLeft') left.push(morph);
      else if (morph.name === 'eyeBlinkRight') right.push(morph);
    }
  }
  return { left, right };
}

/** Animate only eyelids; preserve mouth, cheek and brow poses. */
export function advanceNpcBlink(state, seconds, eyelids) {
  const next = stepBlink(state, seconds);
  for (const morph of eyelids.left) morph.influence = next.left;
  for (const morph of eyelids.right) morph.influence = next.right;
  return next;
}
