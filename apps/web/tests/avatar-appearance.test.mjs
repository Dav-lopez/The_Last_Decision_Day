import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, DEFAULT_LOOK, normalizeLook, colorFor, readLook, writeLook } from '../src/world/appearance.mjs';

test('all appearance choices have unique IDs and valid hex colors', () => {
  for (const choices of Object.values(LOOKS)) {
    assert.equal(new Set(choices.map(choice => choice.id)).size, choices.length);
    for (const choice of choices) assert.match(choice.hex, /^#[0-9a-fA-F]{6}$/);
  }
});

test('unrecognized or malformed input falls back to known, safe choices', () => {
  assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ skin: 'unknown', outfit: 'red', hair: false }),
    { skin: 'warm', outfit: 'red', hair: 'dark' });
  assert.equal(colorFor('outfit', 'red'), '#b75165');
});

test('local appearance preview persists per character without spilling over accounts', () => {
  const data = new Map();
  const store = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
  assert.equal(writeLook('character-1', { skin: 'deep', outfit: 'green', hair: 'brown' }, store), true);
  assert.deepEqual(readLook('character-1', store), { skin: 'deep', outfit: 'green', hair: 'brown' });
  assert.deepEqual(readLook('character-2', store), DEFAULT_LOOK);
});

test('storage failure or invalid JSON never prevents the game from rendering', () => {
  const broken = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.deepEqual(readLook('c1', broken), DEFAULT_LOOK);
  assert.equal(writeLook('c1', DEFAULT_LOOK, broken), false);
  assert.deepEqual(readLook('c1', { getItem: () => '{bad json' }), DEFAULT_LOOK);
});
