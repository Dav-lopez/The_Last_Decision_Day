import { advanceFacialMorph } from './faceDynamics.mjs';
import { composeEyeExpression } from './eyeExpression.mjs';

/**
 * A generated face can have the same named morph on several skinned meshes
 * (eyelids, corneas, lips, cheeks). Advancing the spring separately for each
 * mesh accelerates its motion and leaves the surfaces at different positions.
 *
 * Cache the final influence by name for one frame, but retain the unmasked
 * spring state between frames so an eyelid reopens without losing its pose.
 * The caller owns both maps and clears frameWeights at the start of each tick.
 * Blink and droplet tracks have dedicated animators and must not use this.
 */
export function advanceSharedFacialMorph(name, fallback, target, seconds, blink, motions, frameWeights) {
  if (frameWeights.has(name)) return frameWeights.get(name);
  const next = advanceFacialMorph(
    motions.get(name) ?? { value: fallback, velocity: 0 },
    target, seconds, name,
  );
  motions.set(name, next);
  const influence = composeEyeExpression(name, next.value, blink);
  frameWeights.set(name, influence);
  return influence;
}
