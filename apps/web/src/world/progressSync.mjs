/**
 * Account progress: the story, career (with its training-range record) and neighbour relationships,
 * bundled into one document so a signed-in player continues on any device.
 *
 * Guests keep using the per-feature browser saves. Signed-in players also keep those (they are the
 * offline copy); this module adds a "last changed" timestamp and picks the newest copy, browser or
 * account, when the two differ. The API (ProgressEndpoints) refuses a save older than the one it has.
 */
import { normalizeCareer, readCareer, writeCareer } from './careers.mjs';
import { normalizeStory, readStory, writeStory } from './storyChapters.mjs';
import { normalizeNpcRelations, readNpcRelations, writeNpcRelations } from './npcConversations.mjs';

export const PROGRESS_VERSION = 1;
const changedKey = characterId => `tld-progress-changed-v1:${characterId}`;

/** Every field cleaned up; `savedAt` is milliseconds since 1970 (0 = never changed). */
export function normalizeProgress(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const savedAt = Number.isSafeInteger(safe.savedAt) && safe.savedAt > 0 ? safe.savedAt : 0;
  return {
    version: PROGRESS_VERSION,
    savedAt,
    story: normalizeStory(safe.story),
    career: normalizeCareer(safe.career),
    relations: normalizeNpcRelations(safe.relations),
  };
}

/** When this browser's progress last changed (0 if it never has). */
export function readProgressChangedAt(characterId, storage = globalThis.localStorage) {
  try {
    const value = Number(storage?.getItem(changedKey(characterId)));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

/** Record that story, career or relationships just changed in this browser. */
export function markProgressChanged(characterId, now = Date.now(), storage = globalThis.localStorage) {
  try { storage?.setItem(changedKey(characterId), String(Math.floor(now))); return true; } catch { return false; }
}

/** The browser's copy as one document. */
export function collectProgress(characterId, storage = globalThis.localStorage) {
  return normalizeProgress({
    savedAt: readProgressChangedAt(characterId, storage),
    story: readStory(characterId, storage),
    career: readCareer(characterId, storage),
    relations: readNpcRelations(characterId, storage),
  });
}

/** Overwrite the browser's copy with `progress` (e.g. the newer account copy). */
export function applyProgress(characterId, progress, storage = globalThis.localStorage) {
  const clean = normalizeProgress(progress);
  writeStory(characterId, clean.story, storage);
  writeCareer(characterId, clean.career, storage);
  writeNpcRelations(characterId, clean.relations, storage);
  if (clean.savedAt) storage?.setItem?.(changedKey(characterId), String(clean.savedAt));
  return clean;
}

/**
 * Newest wins. `account` is the server copy (or null if nothing is saved there yet).
 * - nothing on the account → keep the browser copy and upload it if it has ever changed;
 * - account newer (or equal) → adopt the account copy;
 * - browser newer → keep it and upload it.
 */
export function chooseNewestProgress(browser, account) {
  const local = normalizeProgress(browser);
  if (!account) return { source: 'browser', progress: local, upload: local.savedAt > 0 };
  const remote = normalizeProgress(account);
  if (remote.savedAt >= local.savedAt) return { source: 'account', progress: remote, upload: false };
  return { source: 'browser', progress: local, upload: true };
}

/** The body sent to PUT /api/v1/characters/me/progress. */
export function toServerProgress(progress) {
  const clean = normalizeProgress(progress);
  return { savedAt: clean.savedAt, data: { version: clean.version, story: clean.story, career: clean.career, relations: clean.relations } };
}

/** Reads GET/409 responses: `{ saved, savedAt, data }` → a progress document, or null when nothing is saved. */
export function fromServerProgress(response) {
  if (!response || typeof response !== 'object' || response.saved === false || !response.data) return null;
  return normalizeProgress({ ...response.data, savedAt: response.savedAt });
}
