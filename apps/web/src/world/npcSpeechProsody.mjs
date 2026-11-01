/**
 * Restrained sentence-ending eyebrow and eyelid reactions for displayed NPC
 * dialogue. This is punctuation-derived animation, not voice/audio analysis.
 * Classification happens once per reply; sampling performs no text parsing.
 */
export function classifyNpcSpeechProsody(line) {
  if (typeof line !== 'string') return 'none';
  const text = line.slice(0, 2000).trim().replace(/[\s"'”’)}\]]+$/gu, '');
  if (!/[\p{L}\p{N}]/u.test(text)) return 'none';
  const ending = /[?!]+$/u.exec(text)?.[0] ?? '';
  return ending.includes('?') ? 'question' : ending.includes('!') ? 'exclaim' : 'none';
}

const smoothstep = x => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/**
 * Sample an ending inflection on existing skinned brow/eyelid morphs.
 * @returns {number} Finite normalized weight; zero outside the active line.
 */
export function npcSpeechProsodyWeight(name, elapsed, duration, prosody) {
  if (prosody !== 'question' && prosody !== 'exclaim') return 0;
  if (name !== 'browInnerUp' && name !== 'eyeWideLeft' && name !== 'eyeWideRight') return 0;
  if (!Number.isFinite(elapsed) || !Number.isFinite(duration) ||
      elapsed < 0 || duration <= 0 || elapsed >= duration) return 0;
  const phase = elapsed / duration;
  const envelope = smoothstep((phase - 0.48) / 0.18) * smoothstep((1 - phase) / 0.12);
  const amplitude = name === 'browInnerUp'
    ? (prosody === 'question' ? 0.25 : 0.16)
    : (prosody === 'question' ? 0.06 : 0.20);
  return amplitude * envelope * (name.endsWith('Left') ? 0.94 : 1);
}
