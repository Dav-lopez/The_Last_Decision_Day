/** Transient facial cues for the remote 3D avatar, not synchronized gameplay state. */
const HAPPY_EMOTES = new Set(['wave', 'cheer', 'dance', 'thumbs-up', 'laugh', 'nice']);
const VALID_EMOTES = new Set([...HAPPY_EMOTES, 'follow-me', 'over-here']);
const neutral = Object.freeze({ emotion: 'neutral', speakingUntil: 0, expiresAt: 0 });

export function initialRemoteFacialReaction() { return { ...neutral }; }

/** Chat text drives timed mouth articulation without pretending to have audio phonemes. */
export function remoteMessageReaction(previous, text, now) {
  if (!Number.isFinite(now) || typeof text !== 'string' || !text.trim()) return previous;
  const duration = Math.min(5, Math.max(1.1, text.length * 0.055));
  return { emotion: 'neutral', speakingUntil: now + duration, expiresAt: now + duration };
}

/** Emotes have a short expressive pose, never a permanent facial state. */
export function remoteEmoteReaction(previous, emote, now) {
  if (!Number.isFinite(now) || !VALID_EMOTES.has(emote)) return previous;
  return { emotion: HAPPY_EMOTES.has(emote) ? 'happy' : 'neutral', speakingUntil: 0, expiresAt: now + 2.8 };
}

/** Hide facial cues outside the peer's active walking/standing scene. */
export function remoteFacialPose(reaction, now, visible) {
  if (!visible || !Number.isFinite(now) || !reaction) return { emotion: 'neutral', speaking: false };
  return {
    emotion: now < reaction.expiresAt ? reaction.emotion : 'neutral',
    speaking: now < reaction.speakingUntil,
  };
}
