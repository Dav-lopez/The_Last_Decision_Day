/**
 * Approximate visible lip movements from displayed dialogue text, not audio.
 * Build a bounded cue track once per line; the renderer only samples it.
 * Labial consonants close the lips, vowels open the jaw, and punctuation rests.
 */
const MAX_CUES = 96;
const WORD_OR_PAUSE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[,.!?;:]+/gu;
const VOWELS = /[aeiouy]+/gi;
const isPause = token => /^[,.!?;:]+$/.test(token);
const vowelOpening = syllable => {
  const vowel = /[aeiouy]/i.exec(syllable)?.[0]?.toLowerCase();
  return vowel === 'a' ? 0.34 : vowel === 'o' ? 0.30 : vowel === 'e' ? 0.27
    : vowel === 'i' || vowel === 'y' ? 0.22 : vowel === 'u' ? 0.25 : 0.10;
};

/** @returns {Array<{start:number,end:number,open:number,press:number}>} */
export function buildNpcSpeechCues(line, duration) {
  if (typeof line !== 'string' || !Number.isFinite(duration) || duration <= 0) return [];
  const tokens = line.slice(0, 2000).match(WORD_OR_PAUSE) ?? [];
  const units = [];
  const add = (weight, open = 0, press = 0) => {
    if (units.length < MAX_CUES) units.push({ weight, open, press });
  };
  for (const token of tokens) {
    if (units.length >= MAX_CUES) break;
    if (isPause(token)) {
      add(/[.!?]/.test(token) ? 0.8 : 0.5);
      continue;
    }
    const matches = [...token.matchAll(VOWELS)];
    const syllables = [];
    if (!matches.length) syllables.push(token);
    else {
      let start = 0;
      for (const match of matches) {
        const end = match.index + match[0].length;
        syllables.push(token.slice(start, end));
        start = end;
      }
      if (start < token.length) syllables[syllables.length - 1] += token.slice(start);
    }
    for (const syllable of syllables) {
      if (units.length >= MAX_CUES - 1) break;
      if (/^[pbm]/i.test(syllable)) add(0.28, 0, 0.20);
      add(1, vowelOpening(syllable), 0);
    }
    add(0.14); // visible separation between words
  }
  if (!units.some(unit => unit.open > 0)) return [];
  const total = units.reduce((sum, unit) => sum + unit.weight, 0);
  let cursor = 0;
  return units.map((unit, index) => {
    const start = cursor;
    cursor = index === units.length - 1 ? duration : cursor + duration * unit.weight / total;
    return { start, end: cursor, open: unit.open, press: unit.press };
  });
}

const smoothstep = x => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** Sample the text-driven cue track without allocations or modifying the rig. */
export function npcSpeechCueWeight(name, elapsed, cues) {
  if ((name !== 'jawOpen' && name !== 'mouthOpen' &&
       name !== 'mouthPressLeft' && name !== 'mouthPressRight') ||
      !Array.isArray(cues) || !Number.isFinite(elapsed) || elapsed < 0 || !cues.length) return 0;
  let low = 0, high = cues.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const cue = cues[mid];
    if (elapsed < cue.start) high = mid - 1;
    else if (elapsed >= cue.end) low = mid + 1;
    else {
      const span = cue.end - cue.start;
      if (!Number.isFinite(span) || span <= 0) return 0;
      const phase = (elapsed - cue.start) / span;
      const envelope = smoothstep(phase / 0.2) * smoothstep((1 - phase) / 0.22);
      const open = Number.isFinite(cue.open) ? Math.max(0, Math.min(1, cue.open)) : 0;
      const press = Number.isFinite(cue.press) ? Math.max(0, Math.min(1, cue.press)) : 0;
      if (name === 'jawOpen') return open * envelope;
      if (name === 'mouthOpen') return open * envelope * 0.82;
      return press * envelope * (name === 'mouthPressLeft' ? 1 : 0.88);
    }
  }
  return 0;
}
