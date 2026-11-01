// Player-facing release information: the game's name, the "What's new" list, the privacy note and the
// friendly text of the error screen. Pure data and small helpers so they can be tested with node:test.

export const GAME_TITLE = 'The Last Decision Day';
export const GAME_TAGLINE = 'Your life. Your choices. Your consequences.';

/**
 * Newest first. `id` is a sortable date string (yyyy-mm-dd, with a letter suffix for a second update on the
 * same day); the newest id a player has seen is remembered so the menu can flag what is new since their last visit.
 */
export const RELEASE_NOTES = Object.freeze([
  Object.freeze({
    id: '2026-11-01', title: 'Polish and a proper front door',
    items: Object.freeze([
      'The game has a name in your browser tab, an icon for your home screen and a picture when you share a link.',
      'If something goes wrong, an error screen explains it and offers a one-tap reload instead of a blank page.',
      'This "What\'s new" list and a plain-language privacy note in the menu and on the start page.',
    ]),
  }),
  Object.freeze({
    id: '2026-10-31b', title: 'A living downtown',
    items: Object.freeze([
      'Traffic drives the real Boulder street grid, keeps right, follows other cars and gives way to you.',
      'Twenty-two junctions with traffic lights: cars stop on red, and on yellow when they can.',
      'A minimap that turns with you and a GPS route to any waypoint you set on the big map (N).',
      'Faster start: downtown is built on your first trip there and the training range loads when you need it.',
    ]),
  }),
  Object.freeze({
    id: '2026-10-31', title: 'Play anywhere, your way',
    items: Object.freeze([
      'An in-game menu (Esc) with every control, graphics and sound settings, the story so far and credits.',
      'Signed-in players keep their story, career and neighbours across devices.',
      'Phone and touch support: an on-screen pad, talk, drive, train and play football by tapping.',
      'Accessibility: reduced motion, sound captions and large text.',
      'Football: a season league table, diving keepers and smarter opponents.',
      'A loading screen that shows real progress, and lighter animation files.',
    ]),
  }),
]);

/** The newest release note id. */
export const LATEST_RELEASE = RELEASE_NOTES[0].id;

/** Release notes newer than the one the player last saw (all of them on a first visit). */
export function unseenNotes(lastSeen, notes = RELEASE_NOTES) {
  if (typeof lastSeen !== 'string' || !lastSeen) return notes.slice();
  return notes.filter(note => note.id > lastSeen);
}

const SEEN_KEY = 'tld-whats-new-v1';

/** The newest note id this browser has shown, or null. Never throws (private windows may block storage). */
export function readLastSeen(storage) {
  try { const value = storage?.getItem(SEEN_KEY); return typeof value === 'string' && value ? value : null; }
  catch { return null; }
}

/** Remember that the player has seen every note up to `id` (the newest by default). */
export function markSeen(storage, id = LATEST_RELEASE) {
  try { storage?.setItem(SEEN_KEY, id); return true; }
  catch { return false; }
}

/**
 * What the game keeps and where, in plain words. Kept in one place so the start page and the in-game menu say
 * the same thing; update it whenever the game starts storing or sending something new.
 */
export const PRIVACY_POINTS = Object.freeze([
  'Guests: everything (your look, story, career, neighbours, settings) is saved only in this browser. Nothing is sent to us.',
  'Accounts: we keep your email address, a securely hashed password and your date of birth (used only to check you are 18 or over, and never shown to other players), plus your character and game progress so you can continue on another device.',
  'Online rooms: your character name, position, chat and emotes pass through our server to the other player in the room while you play. Room chat is not saved.',
  'Voice chat only starts when you press the button. Your voice goes directly to the other player; to connect, your browsers use a public STUN server (Google), which sees your IP address.',
  'Photo house paint and 3D scan imports are processed on your device; your photos and scans are never uploaded.',
  'No ads, no tracking cookies, no analytics. The server keeps short technical logs so the game keeps running.',
  'Reset progress in the menu, or clear this site\'s data in your browser, to remove the local saves.',
]);

/** Errors caused by a stale page after an update: a code file the page asks for no longer exists. */
export function isStaleBuildError(error) {
  const text = String(error?.message ?? error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(text);
}

/** What the error screen says. Short, friendly, and without the raw stack trace. */
export function describeCrash(error) {
  if (isStaleBuildError(error)) return {
    title: 'The game has been updated',
    body: 'A newer version came out while this page was open. Reload to get it; your progress is saved.',
  };
  const message = String(error?.message ?? error ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    title: 'Something went wrong',
    body: 'The game hit a problem it could not recover from. Reload to carry on; your progress up to the last save is kept.',
    detail: message || undefined,
  };
}
