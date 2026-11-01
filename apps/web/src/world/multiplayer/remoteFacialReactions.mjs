/** Transient facial cues for the remote 3D avatar, not synchronized gameplay state. */
import { buildNpcSpeechCues } from '../npcSpeechCues.mjs';
const HAPPY_EMOTES = new Set(['wave', 'cheer', 'dance', 'thumbs-up', 'laugh', 'nice']);
const VALID_EMOTES = new Set([...HAPPY_EMOTES, 'follow-me', 'over-here']);
const EMPTY_CUES = Object.freeze([]);
const EMPTY_TRACK = Object.freeze({ elapsed: 0, cues: EMPTY_CUES });
const neutral = Object.freeze({ emotion: 'neutral', speakingUntil: 0, expiresAt: 0, startedAt: 0, speechCues: EMPTY_CUES });

export function initialRemoteFacialReaction() { return { ...neutral }; }

/** Chat text drives timed mouth articulation without pretending to have audio phonemes. */
export function remoteMessageReaction(previous, text, now) {
  if (!Number.isFinite(now) || typeof text !== 'string' || !text.trim()) return previous;
  const duration = Math.min(5, Math.max(1.1, text.length * 0.055));
  if (!Number.isFinite(now + duration) || now + duration <= now) return previous;
  // Parse once per received message; sampling the cue track is allocation-free.
  return { emotion: 'neutral', speakingUntil: now + duration, expiresAt: now + duration,
    startedAt: now, speechCues: buildNpcSpeechCues(text, duration) };
}

/** Emotes have a short expressive pose, never a permanent facial state. */
export function remoteEmoteReaction(previous, emote, now) {
  if (!Number.isFinite(now) || !VALID_EMOTES.has(emote)) return previous;
  if (!Number.isFinite(now + 2.8) || now + 2.8 <= now) return previous;
  return { emotion: HAPPY_EMOTES.has(emote) ? 'happy' : 'neutral', speakingUntil: 0,
    expiresAt: now + 2.8, startedAt: 0, speechCues: EMPTY_CUES };
}

/** Hide facial cues outside the peer's active walking/standing scene. */
export function remoteFacialPose(reaction, now, visible) {
  if (!visible || !Number.isFinite(now) || !reaction) return { emotion: 'neutral', speaking: false };
  return {
    emotion: now < reaction.expiresAt ? reaction.emotion : 'neutral',
    speaking: now >= reaction.startedAt && now < reaction.speakingUntil &&
      Array.isArray(reaction.speechCues) && reaction.speechCues.length > 0,
  };
}

/** Text-derived, not audio-driven. Keep the track after expiry for a closed-mouth fade. */
export function remoteSpeechTrack(reaction, now, visible) {
  if (!visible || !Number.isFinite(now) || !reaction ||
      !Number.isFinite(reaction.startedAt) || !Number.isFinite(reaction.speakingUntil) ||
      !Array.isArray(reaction.speechCues) || !reaction.speechCues.length ||
      now < reaction.startedAt) return EMPTY_TRACK;
  const duration = Math.max(0, Math.min(5, reaction.speakingUntil - reaction.startedAt));
  return { elapsed: Math.max(0, Math.min(duration, now - reaction.startedAt)), cues: reaction.speechCues };
}
