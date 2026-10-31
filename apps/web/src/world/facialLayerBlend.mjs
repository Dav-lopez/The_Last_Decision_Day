/**
 * Blend the player's facial emotion with body-action and remote-chat speech.
 * Talking must not force a smile over sadness, anger or fear: the mouth may
 * articulate while the emotional mouth corners remain in their intended pose.
 * Facial morphs are independent per side; this only resolves target weights.
 */
const NEGATIVE_EMOTIONS = new Set(['sad', 'angry', 'fear']);
const unit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * @param {string} name Authored facial morph target name.
 * @param {string} emotion Current explicit/automatic player emotion.
 * @param {number} preset Emotional morph weight.
 * @param {number} action Body-action facial weight.
 * @param {number} speech Remote chat facial-only weight.
 * @param {number} idle Subtle gaze weight (neutral idle only).
 */
export function composeFacialLayer(name, emotion, preset, action, speech, idle = 0) {
  const emotional = unit(preset);
  // Talk/SitTalk have a subtle generic smile, but distressed players should
  // articulate their jaw and lips without fighting frown geometry.
  const suppressSpeechSmile = /^mouthSmile(?:Left|Right)$/.test(name) &&
    NEGATIVE_EMOTIONS.has(emotion);
  const overlay = suppressSpeechSmile ? 0 : Math.max(unit(action), unit(speech));
  // Idle eye movement must not add an incompatible gaze to an emotional pose.
  return Math.min(1, Math.max(emotional, overlay) + (emotion === 'neutral' ? unit(idle) : 0));
}
