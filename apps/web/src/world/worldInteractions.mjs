/** Shared proximity and interaction rules for cars, houses and furniture. No renderer dependency. */
export const INTERACTION_RANGE = 2.25;
export const INTERACTION_TYPES = Object.freeze(['vehicle', 'door', 'bed', 'seat']);
export function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function closestInteraction(player, targets, maxDistance = INTERACTION_RANGE) {
  if (!Number.isFinite(player?.x) || !Number.isFinite(player?.z)) return null;
  let best = null;
  let bestDistance = maxDistance;
  for (const target of targets) {
    if (!INTERACTION_TYPES.includes(target.type) || !Number.isFinite(target.x) || !Number.isFinite(target.z)) continue;
    const distance = distance2D(player, target);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}
export function transitionInteraction(state, action) {
  if (action === 'exit') return { mode: 'walking', targetId: null };
  if (!state || state.mode !== 'walking') return state;
  if (!action || !INTERACTION_TYPES.includes(action.type)) return state;
  const mode = { vehicle: 'driving', door: 'indoors', bed: 'sleeping', seat: 'sitting' }[action.type];
  return { mode, targetId: action.id };
}
