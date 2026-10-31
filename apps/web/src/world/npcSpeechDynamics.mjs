import { npcSpeechCueWeight } from './npcSpeechCues.mjs';

/**
 * Lightweight NPC dialogue articulation. This is a deterministic approximation
 * of syllables and consonant closures, not audio-driven phoneme lip sync.
 * Short phrase breaks prevent residents from chattering continuously.
 */
const MORPHS = new Set(['jawOpen', 'mouthOpen', 'mouthPressLeft', 'mouthPressRight']);
const smoothstep = t => t * t * (3 - 2 * t);

/** Returns a bounded mouth morph influence without changing the character's emotion. */
export function npcSpeechWeight(name, elapsed, cues = undefined) {
  if (!MORPHS.has(name) || !Number.isFinite(elapsed) || elapsed < 0) return 0;
  // Displayed dialogue uses its cached text cues. Unselected ambient Talk
  // retains the original deterministic rhythm for backward compatibility.
  if (Array.isArray(cues)) return npcSpeechCueWeight(name, elapsed, cues);
  const phase = elapsed % 2.8;
  const phrase = phase <= 1.95 ? 1 : phase >= 2.2 ? 0 :
    1 - smoothstep((phase - 1.95) / 0.25);
  if (phrase <= 0) return 0;
  const pulse = Math.max(0, Math.sin(elapsed * 10.7) * 0.7 + Math.sin(elapsed * 17.3) * 0.3);
  const vowel = pulse * pulse;
  const opening = phrase * (0.06 + vowel * 0.24);
  const closure = phrase * (1 - vowel) * (1 - vowel);
  if (name === 'jawOpen') return opening;
  if (name === 'mouthOpen') return opening * 0.78;
  return closure * (name === 'mouthPressLeft' ? 0.09 : 0.07);
}
