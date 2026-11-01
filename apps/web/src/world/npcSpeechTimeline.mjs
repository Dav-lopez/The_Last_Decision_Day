import { buildNpcSpeechCues } from './npcSpeechCues.mjs';
import { classifyNpcSpeechProsody } from './npcSpeechProsody.mjs';

/**
 * A dialogue line owns a finite mouth-animation window. The conversation can
 * remain open after the line finishes without leaving the resident talking
 * indefinitely. This is a reading-rate approximation, not audio lip-sync.
 */
export function npcSpeechDuration(line) {
  if (typeof line !== 'string') return 0;
  const text = line.slice(0, 2000).trim();
  if (!text) return 0;
  const words = (text.match(/\S+/gu) ?? []).length;
  const pauses = (text.match(/[,.!?;:]/g) ?? []).length;
  return Math.min(8, Math.max(0.8, 0.45 + words * 0.29 + pauses * 0.12));
}

export function beginNpcSpeech(id, mood = 'neutral', line = '') {
  const resident = typeof id === 'string' && id.length ? id : null;
  const duration = resident ? npcSpeechDuration(line) : 0;
  return {
    id: resident,
    mood: mood === 'happy' || mood === 'sad' || mood === 'angry' ? mood : 'neutral',
    elapsed: 0,
    duration,
    prosody: resident ? classifyNpcSpeechProsody(line) : 'none',
    cues: resident ? buildNpcSpeechCues(line, duration) : [],
  };
}

export function advanceNpcSpeech(state, seconds) {
  if (!state?.id || !Number.isFinite(state.duration) || state.duration <= 0) return state;
  const elapsed = Number.isFinite(state.elapsed) ? Math.max(0, state.elapsed) : 0;
  if (elapsed >= state.duration) return state; // No allocations after a line finishes.
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  if (dt === 0 && elapsed === state.elapsed) return state;
  return { ...state, elapsed: Math.min(state.duration, elapsed + dt) };
}

export function isNpcSpeaking(state) {
  return Boolean(state?.id && Number.isFinite(state.elapsed) &&
    Number.isFinite(state.duration) && state.duration > 0 &&
    state.elapsed >= 0 && state.elapsed < state.duration);
}

/** The selected resident must not fall back to ambient chatter after a line. */
export function npcShouldArticulate(state, residentId, ambientTalking = false) {
  return state?.id === residentId ? isNpcSpeaking(state) : Boolean(ambientTalking);
}
