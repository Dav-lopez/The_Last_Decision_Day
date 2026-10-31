/**
 * Player settings that live outside any one system: graphics quality, the
 * first-run controls hint, and which saved keys "Reset progress" clears.
 * Browser-local, like the rest of the guest save.
 */
export const GRAPHICS_MODES = Object.freeze([
  Object.freeze({ id: 'auto', title: 'Automatic', description: 'adjusts sharpness to keep the game smooth', scale: 1, adaptive: true, ambientOcclusion: true }),
  Object.freeze({ id: 'performance', title: 'Performance', description: 'lower resolution, no soft shadows; best for older laptops and phones', scale: 1.6, adaptive: false, ambientOcclusion: false }),
  Object.freeze({ id: 'quality', title: 'Quality', description: 'full resolution and every effect, even if it gets slower', scale: 1, adaptive: false, ambientOcclusion: true }),
]);

export function graphicsMode(id) {
  return GRAPHICS_MODES.find(mode => mode.id === id) ?? GRAPHICS_MODES[0];
}

const SETTINGS_KEY = 'tld-settings-v1';
export function readSettings(storage = globalThis.localStorage) {
  let raw = null;
  try { raw = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null'); } catch { raw = null; }
  const safe = raw && typeof raw === 'object' ? raw : {};
  return { graphics: graphicsMode(safe.graphics).id, hintDismissed: safe.hintDismissed === true };
}
export function writeSettings(settings, storage = globalThis.localStorage) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify({ graphics: graphicsMode(settings?.graphics).id, hintDismissed: settings?.hintDismissed === true })); return true; }
  catch { return false; }
}

/** Saved progress for one character: story, career and training, relationships and the life clock. Looks and settings stay. */
export function progressKeys(characterId) {
  return [`tld-story-v1:${characterId}`, `tld-career-v1:${characterId}`, `tld-npc-relations-v1:${characterId}`, `tld-life-v1:${characterId}`];
}
export function resetProgress(characterId, storage = globalThis.localStorage) {
  let cleared = 0;
  for (const key of progressKeys(characterId)) {
    try { if (storage?.getItem(key) !== null) { storage.removeItem(key); cleared++; } } catch { /* storage blocked */ }
  }
  return cleared;
}
