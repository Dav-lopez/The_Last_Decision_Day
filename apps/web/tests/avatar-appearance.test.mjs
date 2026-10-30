import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS, STYLES, DEFAULT_LOOK, ZONES, ZONE_MATERIALS, normalizeLook, colorFor, dressZones, modelFor, readLook, withBody, writeLook } from '../src/world/appearance.mjs';

test('all appearance choices have unique IDs; colours are valid hex', () => {
  for (const choices of [...Object.values(LOOKS), ...Object.values(STYLES)]) {
    assert.equal(new Set(choices.map(choice => choice.id)).size, choices.length);
  }
  for (const choices of Object.values(LOOKS)) for (const choice of choices) assert.match(choice.hex, /^#[0-9a-fA-F]{6}$/);
  assert.ok(STYLES.body.some(b => b.id === 'female'), 'female characters');
  assert.ok(STYLES.hairStyle.length >= 5 && STYLES.top.length >= 4 && STYLES.bottom.length >= 4 && STYLES.shoes.length >= 5);
});

test('unrecognized or malformed input falls back to known, safe choices; old saves keep their colours', () => {
  assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
  const old = normalizeLook({ skin: 'unknown', outfit: 'red', hair: false });
  assert.deepEqual(old, { ...DEFAULT_LOOK, outfit: 'red' });
  assert.deepEqual(normalizeLook({ skin: 'deep', outfit: 'green', hair: 'blonde' }), { ...DEFAULT_LOOK, skin: 'deep', outfit: 'green', hair: 'blonde' });
  assert.equal(normalizeLook({ body: 'robot' }).body, 'male');
  assert.equal(colorFor('outfit', 'red'), '#b75165');
});

test('local appearance preview persists per character without spilling over accounts', () => {
  const data = new Map();
  const store = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
  const look = { ...DEFAULT_LOOK, body: 'female', hairStyle: 'buns', bottom: 'skirt', shoes: 'boots' };
  assert.equal(writeLook('character-1', look, store), true);
  assert.deepEqual(readLook('character-1', store), look);
  assert.deepEqual(readLook('character-2', store), DEFAULT_LOOK);
});

test('storage failure or invalid JSON never prevents the game from rendering', () => {
  const broken = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.deepEqual(readLook('c1', broken), DEFAULT_LOOK);
  assert.equal(writeLook('c1', DEFAULT_LOOK, broken), false);
  assert.deepEqual(readLook('c1', { getItem: () => '{bad json' }), DEFAULT_LOOK);
});

test('each body has its own model; switching body picks a matching hairstyle but keeps the clothes', () => {
  assert.equal(modelFor({ body: 'female' }), 'human-female.glb');
  assert.equal(modelFor({ body: 'male' }), 'human.glb');
  assert.equal(modelFor(null), 'human.glb');
  const her = withBody({ ...DEFAULT_LOOK, outfit: 'pink', facialHair: 'beard' }, 'female');
  assert.equal(her.hairStyle, 'long');
  assert.equal(her.facialHair, 'none');
  assert.equal(her.outfit, 'pink');
  assert.deepEqual(withBody(her, 'female'), her);
});

const skinZones = look => Object.entries(dressZones(look).zones).filter(([, z]) => z.skin).map(([name]) => name).sort();

test('clothes decide which zones show skin', () => {
  const base = { ...DEFAULT_LOOK, shoes: 'sneakers' };
  assert.deepEqual(skinZones({ ...base, top: 'longsleeve', bottom: 'jeans' }), []);
  assert.deepEqual(skinZones({ ...base, top: 'tshirt', bottom: 'jeans' }), ['forearm']);
  assert.deepEqual(skinZones({ ...base, top: 'tank', bottom: 'shorts' }), ['forearm', 'knee', 'lower-shin', 'shin', 'upper-arm']);
  assert.deepEqual(skinZones({ ...base, top: 'crop', bottom: 'jeans' }), ['forearm', 'midriff', 'upper-arm'], 'crop top shows the midriff, not the hips');
  const skirt = dressZones({ ...base, bottom: 'skirt', bottomColor: 'red' });
  assert.equal(skirt.skirt.colour, colorFor('bottomColor', 'red'));
  assert.equal(dressZones({ ...base, bottom: 'jeans' }).skirt, null);
});

test('shoes: boots climb the shin, sandals and bare feet show the foot, soles differ', () => {
  const base = { ...DEFAULT_LOOK, bottom: 'shorts', shoeColor: 'brown' };
  const boots = dressZones({ ...base, shoes: 'boots' }).zones;
  assert.equal(boots['lower-shin'].colour, colorFor('shoeColor', 'brown'));
  assert.equal(boots.ankle.colour, colorFor('shoeColor', 'brown'));
  const hightops = dressZones({ ...base, shoes: 'hightops' }).zones;
  assert.equal(hightops.ankle.colour, colorFor('shoeColor', 'brown'));
  assert.equal(hightops['lower-shin'].skin, true);
  assert.equal(dressZones({ ...base, shoes: 'sandals' }).zones.foot.skin, true);
  assert.equal(dressZones({ ...base, shoes: 'sandals' }).zones.sole.skin, false);
  assert.equal(dressZones({ ...base, shoes: 'barefoot' }).zones.sole.skin, true);
  assert.ok(dressZones({ ...base, shoes: 'dress' }).zones.foot.roughness < dressZones({ ...base, shoes: 'sneakers' }).zones.foot.roughness, 'polished leather');
  assert.equal(dressZones({ ...base, shoes: 'sneakers' }).zones.sole.colour, '#f2f0ea');
});

test('hair: one style (or none) plus an optional beard; every zone is painted', () => {
  assert.deepEqual(dressZones({ hairStyle: 'buns' }).hair, ['buns']);
  assert.deepEqual(dressZones({ hairStyle: 'bald', facialHair: 'beard' }).hair, ['beard']);
  for (const top of STYLES.top) for (const bottom of STYLES.bottom) for (const shoes of STYLES.shoes) {
    const { zones } = dressZones({ top: top.id, bottom: bottom.id, shoes: shoes.id });
    assert.deepEqual(Object.keys(zones).sort(), [...ZONES].sort());
    for (const zone of Object.values(zones)) assert.match(zone.colour, /^#[0-9a-f]{6}$/);
  }
});

test('both character models carry every outfit zone, hairstyle and the skirt', () => {
  for (const file of ['human.glb', 'human-female.glb']) {
    const bytes = readFileSync(new URL(`../public/models/${file}`, import.meta.url));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const materials = new Set(gltf.materials.map(m => m.name));
    for (const name of Object.values(ZONE_MATERIALS)) assert.ok(materials.has(name), `${file}: ${name}`);
    assert.ok(materials.has('Student skirt'));
    const nodes = new Set(gltf.nodes.map(n => n.name));
    for (const style of STYLES.hairStyle.filter(s => s.id !== 'bald')) assert.ok(nodes.has(`Student hair ${style.id}`), `${file}: ${style.id}`);
    assert.ok(nodes.has('Student hair beard') && nodes.has('Student skirt'));
    assert.ok(bytes.length < 2_000_000);
  }
});
