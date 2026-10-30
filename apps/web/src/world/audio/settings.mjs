export const AUDIO_DEFAULTS = Object.freeze({ master: .65, music: .35, effects: .65, ambience: .3, muted: false });
const KEY = 'tld-audio-v1';
export function normalizeAudioSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  return { ...Object.fromEntries(['master','music','effects','ambience'].map(key => [key,
    typeof input[key] === 'number' && Number.isFinite(input[key]) ? Math.max(0, Math.min(1,input[key])) : AUDIO_DEFAULTS[key]])),
    muted: input.muted === true };
}
export function readAudioSettings(storage) {
  try { return normalizeAudioSettings(JSON.parse((storage ?? globalThis.localStorage)?.getItem(KEY) ?? 'null')); }
  catch { return { ...AUDIO_DEFAULTS }; }
}
export function writeAudioSettings(value, storage) {
  try { (storage ?? globalThis.localStorage)?.setItem(KEY, JSON.stringify(normalizeAudioSettings(value))); return true; } catch { return false; }
}
