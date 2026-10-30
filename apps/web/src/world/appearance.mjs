/**
 * Character look: body, skin, hair (style and colour), facial hair, and a
 * wardrobe of tops, bottoms and shoes. Browser-local cosmetic choice only;
 * progression stays server-authoritative.
 *
 * Colour parts (`skin`, `hair`, `outfit` = top colour, `bottomColor`,
 * `shoeColor`) are swatches; style parts (`body`, `hairStyle`, `facialHair`,
 * `top`, `bottom`, `shoes`) are options. `dressZones` turns a look into paint
 * for each outfit zone of the 3D model (see scripts/build-character.py).
 */
const swatch = (id, label, hex) => Object.freeze({ id, label, hex });
const option = (id, label, extra = {}) => Object.freeze({ id, label, ...extra });

const CLOTH = [
  swatch('white', 'White', '#e9e7e1'), swatch('black', 'Black', '#24252a'), swatch('gray', 'Gray', '#7f8389'),
  swatch('navy', 'Navy', '#27375e'), swatch('blue', 'Blue', '#5f83d8'), swatch('sky', 'Sky', '#8fc1e3'),
  swatch('red', 'Red', '#b75165'), swatch('burgundy', 'Burgundy', '#6d2335'), swatch('pink', 'Pink', '#e59ab5'),
  swatch('purple', 'Purple', '#6f55a5'), swatch('green', 'Green', '#397f71'), swatch('olive', 'Olive', '#6b6f3a'),
  swatch('gold', 'Gold', '#d6ab5b'), swatch('orange', 'Orange', '#d9793d'), swatch('tan', 'Tan', '#b89a72'),
  swatch('brown', 'Brown', '#6a4a35'), swatch('denim', 'Denim', '#41618e'), swatch('charcoal', 'Charcoal', '#3b3e44'),
];

export const LOOKS = Object.freeze({
  skin: Object.freeze([
    swatch('porcelain', 'Porcelain', '#f1c7a8'), swatch('light', 'Light', '#e6b58f'), swatch('olive', 'Olive', '#ac906c'),
    swatch('warm', 'Warm', '#a56f50'), swatch('brown', 'Brown', '#7d5038'), swatch('deep', 'Deep', '#57382d'),
  ]),
  hair: Object.freeze([
    swatch('black', 'Black', '#141216'), swatch('dark', 'Dark', '#25202a'), swatch('brown', 'Brown', '#60422f'),
    swatch('auburn', 'Auburn', '#7a3420'), swatch('ginger', 'Ginger', '#b5592b'), swatch('blonde', 'Blonde', '#c5a36f'),
    swatch('platinum', 'Platinum', '#e3d8bd'), swatch('gray', 'Gray', '#9a9a9d'), swatch('pink', 'Pink', '#d9709e'),
    swatch('blue', 'Blue', '#3f6fc4'),
  ]),
  outfit: Object.freeze(CLOTH),
  bottomColor: Object.freeze(CLOTH),
  shoeColor: Object.freeze([
    swatch('white', 'White', '#ecebe6'), swatch('black', 'Black', '#1c1d21'), swatch('brown', 'Brown', '#5a3b27'),
    swatch('tan', 'Tan', '#a7825b'), swatch('red', 'Red', '#a8333f'), swatch('navy', 'Navy', '#25345a'),
    swatch('pink', 'Pink', '#e7a1bb'), swatch('gray', 'Gray', '#8a8d92'),
  ]),
});

export const STYLES = Object.freeze({
  body: Object.freeze([option('male', 'Male', { model: 'human.glb' }), option('female', 'Female', { model: 'human-female.glb' })]),
  hairStyle: Object.freeze([
    option('parted', 'Side part'), option('buzzed', 'Buzz cut'), option('pixie', 'Pixie'),
    option('long', 'Long'), option('buns', 'Space buns'), option('bald', 'Shaved'),
  ]),
  facialHair: Object.freeze([option('none', 'None'), option('beard', 'Beard')]),
  top: Object.freeze([
    option('longsleeve', 'Long-sleeve tee'), option('tshirt', 'T-shirt'), option('tank', 'Tank top'),
    option('hoodie', 'Hoodie'), option('crop', 'Crop top'),
  ]),
  bottom: Object.freeze([
    option('jeans', 'Jeans'), option('trousers', 'Trousers'), option('shorts', 'Shorts'),
    option('skirt', 'Skirt'), option('leggings', 'Leggings'),
  ]),
  shoes: Object.freeze([
    option('sneakers', 'Sneakers'), option('hightops', 'High-tops'), option('boots', 'Boots'),
    option('sandals', 'Sandals'), option('flats', 'Flats'), option('dress', 'Dress shoes'), option('barefoot', 'Barefoot'),
  ]),
});

export const DEFAULT_LOOK = Object.freeze({
  body: 'male', skin: 'warm', hair: 'dark', hairStyle: 'parted', facialHair: 'none',
  top: 'longsleeve', outfit: 'blue', bottom: 'trousers', bottomColor: 'navy', shoes: 'sneakers', shoeColor: 'black',
});
/** Defaults that suit each body when the player switches. */
export const BODY_DEFAULTS = Object.freeze({
  male: Object.freeze({ hairStyle: 'parted' }),
  female: Object.freeze({ hairStyle: 'long', facialHair: 'none' }),
});

const PARTS = { ...LOOKS, ...STYLES };
/** Unknown or missing parts fall back to the defaults (looks saved before the wardrobe keep skin, hair and top colour). */
export function normalizeLook(value) {
  const safe = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(PARTS).map(([part, choices]) =>
    [part, choices.some(choice => choice.id === safe[part]) ? safe[part] : DEFAULT_LOOK[part]]));
}
export function colorFor(part, id) {
  return LOOKS[part]?.find(item => item.id === id)?.hex ?? LOOKS[part]?.[0]?.hex ?? '#666666';
}
export function modelFor(look) {
  return STYLES.body.find(body => body.id === look?.body)?.model ?? 'human.glb';
}
/** Switching body keeps clothes and colours but picks a matching hairstyle. */
export function withBody(look, body) {
  const base = normalizeLook(look);
  if (base.body === body || !STYLES.body.some(b => b.id === body)) return base;
  return normalizeLook({ ...base, body, ...BODY_DEFAULTS[body] });
}

/** Outfit zones in the model, top to bottom. */
export const ZONES = Object.freeze(['top', 'upper-arm', 'forearm', 'midriff', 'waist', 'thigh', 'knee', 'shin', 'lower-shin', 'ankle', 'foot', 'sole']);
export const ZONE_MATERIALS = Object.freeze({
  top: 'Student jacket', 'upper-arm': 'Student sleeve upper', forearm: 'Student sleeve lower', midriff: 'Student midriff', waist: 'Student waistband',
  thigh: 'Student trousers', knee: 'Student trousers knee', shin: 'Student trousers shin', 'lower-shin': 'Student trousers ankle',
  ankle: 'Student socks', foot: 'Student shoes', sole: 'Student soles',
});

const shade = (hex, amount) => {
  const v = parseInt(hex.slice(1), 16);
  const mix = c => Math.round(Math.max(0, Math.min(255, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return '#' + [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(c => mix(c).toString(16).padStart(2, '0')).join('');
};

/**
 * What every outfit zone wears for a look: { colour, skin: boolean, roughness, sheen }.
 * `skirt` says whether the skirt mesh is shown; `hair` which hairstyle meshes are.
 */
export function dressZones(lookInput) {
  const look = normalizeLook(lookInput);
  const skin = colorFor('skin', look.skin);
  const top = colorFor('outfit', look.outfit);
  const bottom = colorFor('bottomColor', look.bottomColor);
  const shoe = colorFor('shoeColor', look.shoeColor);
  const zones = Object.fromEntries(ZONES.map(zone => [zone, { colour: skin, skin: true, roughness: 0.82 }]));
  const wear = (names, colour, roughness = 0.88) => { for (const z of names) zones[z] = { colour, skin: false, roughness }; };

  // Top (a crop top stops above the navel).
  wear(look.top === 'crop' ? ['top'] : ['top', 'midriff'], top, look.top === 'hoodie' ? 0.95 : 0.88);
  if (look.top === 'longsleeve' || look.top === 'hoodie') wear(['upper-arm', 'forearm'], top, look.top === 'hoodie' ? 0.95 : 0.88);
  if (look.top === 'tshirt') wear(['upper-arm'], top);
  if (look.top === 'hoodie') zones.waist = { colour: shade(top, -0.18), skin: false, roughness: 0.95 }; // ribbed hem
  // Bottoms.
  const fabric = { jeans: 0.9, trousers: 0.85, shorts: 0.88, skirt: 0.8, leggings: 0.55 }[look.bottom];
  const legs = { jeans: ['thigh', 'knee', 'shin', 'lower-shin'], trousers: ['thigh', 'knee', 'shin', 'lower-shin'],
    leggings: ['thigh', 'knee', 'shin', 'lower-shin'], shorts: ['thigh'], skirt: ['thigh'] }[look.bottom];
  if (look.top !== 'hoodie') wear(['waist'], shade(bottom, -0.12), fabric);
  wear(legs, bottom, fabric);
  // Socks and shoes.
  const sole = { sneakers: '#f2f0ea', hightops: '#f2f0ea', boots: '#2a2421', sandals: shade(shoe, -0.3), flats: '#1d1b1a', dress: '#18171a', barefoot: skin }[look.shoes];
  if (look.shoes === 'barefoot') {
    zones.foot = { colour: skin, skin: true, roughness: 0.82 };
    zones.sole = { colour: shade(skin, -0.15), skin: true, roughness: 0.85 };
  } else if (look.shoes === 'sandals') {
    zones.foot = { colour: skin, skin: true, roughness: 0.82 };
    zones.sole = { colour: sole, skin: false, roughness: 0.7 };
  } else {
    const gloss = look.shoes === 'dress' ? 0.28 : look.shoes === 'boots' ? 0.55 : 0.75;
    zones.foot = { colour: shoe, skin: false, roughness: gloss };
    zones.sole = { colour: sole, skin: false, roughness: 0.7 };
  }
  if (look.shoes === 'boots') wear(['ankle', 'lower-shin'], shoe, 0.55);
  else if (look.shoes === 'hightops') wear(['ankle'], shoe, 0.75);
  else if (look.shoes === 'sneakers' && legs.includes('lower-shin')) wear(['ankle'], bottom, fabric);
  else if (look.shoes === 'sneakers') wear(['ankle'], '#f1f0ec', 0.9); // white socks under shorts
  else if (legs.includes('lower-shin')) wear(['ankle'], bottom, fabric);

  const hair = look.hairStyle === 'bald' ? [] : [look.hairStyle];
  if (look.facialHair === 'beard') hair.push('beard');
  return { zones, skirt: look.bottom === 'skirt' ? { colour: bottom, roughness: fabric } : null, hair, skin, hairColour: colorFor('hair', look.hair) };
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
