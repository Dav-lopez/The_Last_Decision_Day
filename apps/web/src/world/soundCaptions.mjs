/**
 * Captions for game sounds: when captions are on, each sound cue the game
 * plays is also described in a short line of text, so a player who can't hear
 * (or has the sound off) still knows the school bell rang or a message arrived.
 * Frequent, purely visual sounds (footsteps, jumps, kicks) are left out.
 */
export const SOUND_CAPTIONS = Object.freeze({
  notice: 'Alert chime',
  message: 'Phone buzzes: new message',
  talk: 'Someone speaks',
  door: 'Door opens',
  car: 'Car door, engine starts',
  bus: 'Bus arrives',
  bell: 'School bell rings',
  food: 'Cooking sounds',
  wake: 'Alarm: good morning',
  achievement: 'Success fanfare',
  whistle: "Referee's whistle",
  goal: 'Crowd cheers: goal!',
  save: 'Crowd groans: saved',
  shift: 'Shift complete',
  promotion: 'Fanfare: promotion',
  horn: 'Car horn',
  crunch: 'Metal crunch: the car is dented',
  scrape: 'Paint scrapes',
  checkpoint: 'Checkpoint reached',
  dispatch: 'Radio: duty call',
  map: 'Map unfolds',
  chat: 'Chat message',
  emote: 'Emote',
  shot: 'Pistol shot on the range',
  rifle: 'Rifle shot on the range',
  spray: 'Hose spraying',
  ding: 'Steel plate rings: hit',
  reload: 'Reloading',
  skid: 'Tyres screech',
});

export const CAPTION_SECONDS = 3.5;
export const MAX_CAPTIONS = 3;

export function captionFor(cue) {
  return Object.hasOwn(SOUND_CAPTIONS, cue) ? SOUND_CAPTIONS[cue] : null;
}

/**
 * Adds a caption for `cue` at time `now` (seconds); `override` replaces the
 * generic text when the game knows more (who is speaking in a story scene). Repeats of a caption that
 * is still showing refresh it and count up ("×3") instead of stacking.
 * Returns a new list, newest last, never longer than MAX_CAPTIONS.
 */
export function pushCaption(list, cue, now, override = null) {
  const text = override || captionFor(cue);
  const live = activeCaptions(list, now);
  if (!text) return live;
  const same = live.find(caption => caption.text === text);
  if (same) return [...live.filter(caption => caption !== same), { ...same, count: same.count + 1, at: now }];
  const id = (list.reduce((max, caption) => Math.max(max, caption.id), 0) || 0) + 1;
  return [...live, { id, text, count: 1, at: now }].slice(-MAX_CAPTIONS);
}

/** Captions still on screen at `now`. */
export function activeCaptions(list, now) {
  return (Array.isArray(list) ? list : []).filter(caption => now - caption.at < CAPTION_SECONDS && now >= caption.at);
}

export function captionLabel(caption) {
  return caption.count > 1 ? `[${caption.text}] ×${caption.count}` : `[${caption.text}]`;
}

/**
 * Story scenes play the same short cues as the rest of the game (a chime for a
 * line of dialogue, a buzz for a text message), but the generic captions would
 * say "Someone speaks" or "Phone buzzes" for every line. These name the
 * speaker instead, and say when a line is a text rather than a voice.
 * `cast` is the story's CAST entry for the speaker ({ name, tone }).
 */
export function storyLineCue(cast) {
  return cast?.tone === 'phone' ? 'message' : 'talk';
}

export function storyLineCaption(cast) {
  if (!cast) return null;
  const name = String(cast.name ?? '').replace(/\s*\(text message\)\s*$/i, '').trim();
  if (cast.tone === 'phone') return name ? `Phone buzzes: text from ${name}` : 'Phone buzzes: new text';
  if (cast.tone === 'narration' || !name) return 'Story chime';
  if (cast.tone === 'player') return 'You speak';
  if (cast.tone === 'mystery') return 'An unknown voice speaks';
  return `${name} speaks`;
}

/** The fanfare when a chapter ends; the last chapter's fanfare closes the story. */
export function chapterCaption(title, last = false) {
  const name = String(title ?? '').replace(/^Chapter\s+\d+\s*·\s*/i, '').trim();
  if (last) return name ? `Fanfare: the story ends (${name})` : 'Fanfare: the story ends';
  return name ? `Fanfare: chapter complete (${name})` : 'Fanfare: chapter complete';
}
