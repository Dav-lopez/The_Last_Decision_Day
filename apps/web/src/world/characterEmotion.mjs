import { classifyHumanMotion } from './humanMotion.mjs';

/** A manually selected expression takes priority over gameplay reactions. */
export function resolveCharacterEmotion(previewEmotion, speed) {
  if (previewEmotion !== 'neutral') return previewEmotion;
  return classifyHumanMotion(speed) === 'run' ? 'exerted' : 'neutral';
}
