/** Browser-local cosmetic preview only; progression stays server-authoritative. */
export const LOOKS = Object.freeze({
  skin: Object.freeze([
    { id: 'warm', label: 'Warm', hex: '#a56f50' },
    { id: 'deep', label: 'Deep', hex: '#57382d' },
    { id: 'light', label: 'Light', hex: '#e6b58f' },
    { id: 'olive', label: 'Olive', hex: '#ac906c' },
  ]),
  outfit: Object.freeze([
    { id: 'blue', label: 'Blue', hex: '#5f83d8' },
    { id: 'red', label: 'Red', hex: '#b75165' },
    { id: 'green', label: 'Green', hex: '#397f71' },
    { id: 'gold', label: 'Gold', hex: '#d6ab5b' },
  ]),
  hair: Object.freeze([
    { id: 'dark', label: 'Dark', hex: '#25202a' },
    { id: 'brown', label: 'Brown', hex: '#60422f' },
    { id: 'blonde', label: 'Blonde', hex: '#c5a36f' },
  ]),
});
export const DEFAULT_LOOK = Object.freeze({ skin: 'warm', outfit: 'blue', hair: 'dark' });
export function normalizeLook(value) {
  const safe = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(LOOKS).map(([part, choices]) =>
    [part, choices.some(choice => choice.id === safe[part]) ? safe[part] : DEFAULT_LOOK[part]]));
}
export function colorFor(part, id) {
  return LOOKS[part]?.find(item => item.id === id)?.hex ?? LOOKS[part]?.[0]?.hex ?? '#666666';
}
function storageKey(characterId) {
  return `tld-avatar-v1:${characterId}`;
}
export function readLook(characterId, storage = globalThis.localStorage) {
  try {
    return normalizeLook(JSON.parse(storage?.getItem(storageKey(characterId)) ?? 'null'));
  } catch {
    return { ...DEFAULT_LOOK };
  }
}
export function writeLook(characterId, look, storage = globalThis.localStorage) {
  try {
    storage?.setItem(storageKey(characterId), JSON.stringify(normalizeLook(look)));
    return true;
  } catch {
    return false;
  }
}
