/**
 * Each male/female GLB owns its animation ordering. Never use indices from a
 * different character container when cloning Idle/Walk groups for residents.
 */
export function findNpcLocomotionIndices(groups) {
  if (!Array.isArray(groups)) return null;
  const idleIndex = groups.findIndex(group => group?.name === 'Idle');
  const walkIndex = groups.findIndex(group => group?.name === 'Walk');
  return idleIndex >= 0 && walkIndex >= 0 && idleIndex !== walkIndex
    ? { idleIndex, walkIndex } : null;
}

/** Use a model only when it has both locomotion clips; otherwise fall back. */
export function selectNpcAnimationModel(preferred, usable) {
  if (typeof preferred === 'string' && usable?.has(preferred)) return preferred;
  return usable?.has('human.glb') ? 'human.glb' : null;
}
