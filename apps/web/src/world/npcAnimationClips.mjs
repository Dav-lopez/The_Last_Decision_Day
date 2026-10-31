/**
 * Each body variant may order its glTF animation groups differently. The cloned
 * animation groups retain the source's order, but their names may be prefixed
 * by Babylon during instantiation. Resolve the indices from the *selected*
 * source body, never from a different body's animation list.
 */
export function resolveNpcClips(sourceGroups, clonedGroups) {
  if (!Array.isArray(sourceGroups) || !Array.isArray(clonedGroups)) return null;
  const cloneFor = name => {
    const index = sourceGroups.findIndex(group => group?.name === name);
    const group = index >= 0 ? clonedGroups[index] : null;
    return group && Array.isArray(group.targetedAnimations) && group.targetedAnimations.length > 0
      ? group : null;
  };
  const idle = cloneFor('Idle');
  const walk = cloneFor('Walk');
  return idle && walk && idle !== walk ? { idle, walk } : null;
}

/**
 * Select a playable model and report the actual model used. This matters for
 * loading compatible Talk/Hit clips when a requested body failed to download.
 * A source without Idle/Walk is not a valid fallback for neighborhood NPCs.
 */
export function resolveNpcBody(requestedModel, containers, fallbackModel = 'human.glb') {
  if (!containers || typeof containers.get !== 'function') return null;
  const usable = model => {
    const container = containers.get(model);
    const groups = container?.animationGroups;
    return Array.isArray(groups) && ['Idle', 'Walk'].every(name =>
      groups.some(group => group?.name === name &&
        Array.isArray(group.targetedAnimations) && group.targetedAnimations.length > 0))
      ? { model, container } : null;
  };
  return usable(requestedModel) ?? (requestedModel === fallbackModel ? null : usable(fallbackModel));
}
