/**
 * The car radio dial: station ids, tuning order and the remembered choice.
 * Kept tiny and separate from radio.mjs (the songs), which loads on the first drive.
 */
export const STATION_IDS = Object.freeze(['maple', 'lowtide', 'downtown', 'pulse']);
export const isStation = id => STATION_IDS.includes(id);

/** The next station on the dial, wrapping through "off" (null). dir is +1 or -1. */
export function nextStation(current, dir = 1) {
  const dial = [null, ...STATION_IDS];
  const at = Math.max(0, dial.indexOf(isStation(current) ? current : null));
  return dial[(at + (dir < 0 ? -1 : 1) + dial.length) % dial.length];
}

const KEY = 'tld-radio-v1';
/** The last station the player chose (default Maple 98.1; null means off). */
export function readRadioStation(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(KEY);
    if (raw === null || raw === undefined) return STATION_IDS[0];
    if (raw === 'off') return null;
    return isStation(raw) ? raw : STATION_IDS[0];
  } catch { return STATION_IDS[0]; }
}
export function writeRadioStation(id, storage) {
  try { (storage ?? globalThis.localStorage)?.setItem(KEY, isStation(id) ? id : 'off'); return true; } catch { return false; }
}
