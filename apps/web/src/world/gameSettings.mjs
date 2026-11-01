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
  return normalizeSettings(raw);
}
export function writeSettings(settings, storage = globalThis.localStorage) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings))); return true; }
  catch { return false; }
}

/**
 * Accessibility options. Motion follows the device's "reduce motion" setting
 * unless the player picks one; captions describe game sounds in text; large
 * text scales every panel and HUD label.
 */
export const MOTION_MODES = Object.freeze([
  Object.freeze({ id: 'system', title: 'Follow my device', description: 'calm motion when your device asks for reduced motion' }),
  Object.freeze({ id: 'reduce', title: 'Reduced', description: 'no sliding banners, fades or pulsing effects' }),
  Object.freeze({ id: 'full', title: 'Full', description: 'every animation and camera ease' }),
]);
export const TEXT_SIZES = Object.freeze([
  Object.freeze({ id: 'normal', title: 'Normal', scale: 1 }),
  Object.freeze({ id: 'large', title: 'Large', scale: 1.18 }),
]);
const pick = (list, id) => (list.find(item => item.id === id) ?? list[0]).id;
export function normalizeSettings(value) {
  const safe = value && typeof value === 'object' ? value : {};
  return {
    graphics: graphicsMode(safe.graphics).id,
    hintDismissed: safe.hintDismissed === true,
    motion: pick(MOTION_MODES, safe.motion),
    captions: safe.captions === true,
    textSize: pick(TEXT_SIZES, safe.textSize),
  };
}
/** Whether to calm motion right now, given the setting and the device preference. */
export function reducedMotion(settings, systemPrefersReduced = false) {
  const motion = pick(MOTION_MODES, settings?.motion);
  return motion === 'reduce' || (motion === 'system' && systemPrefersReduced === true);
}
export function textScale(settings) {
  return TEXT_SIZES.find(size => size.id === settings?.textSize)?.scale ?? 1;
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
