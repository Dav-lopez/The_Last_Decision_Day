import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS_MODES, graphicsMode, progressKeys, readSettings, resetProgress, writeSettings } from '../src/world/gameSettings.mjs';
import { readStory, writeStory } from '../src/world/storyChapters.mjs';
import { readCareer, writeCareer, joinCareer, normalizeCareer } from '../src/world/careers.mjs';
import { readNpcRelations, writeNpcRelations, chooseNpcReply, newNpcRelations } from '../src/world/npcConversations.mjs';

const memory = () => {
  const store = new Map();
  return { store, getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
};

test('graphics presets: automatic by default, unknown values fall back to it', () => {
  assert.deepEqual(GRAPHICS_MODES.map(mode => mode.id), ['auto', 'performance', 'quality']);
  assert.equal(graphicsMode('nope').id, 'auto');
  assert.ok(graphicsMode('performance').scale > 1 && !graphicsMode('performance').ambientOcclusion);
  assert.equal(graphicsMode('quality').adaptive, false);
});

test('settings save and load, and survive junk or blocked storage', () => {
  const storage = memory();
  assert.deepEqual(readSettings(storage), { graphics: 'auto', hintDismissed: false });
  writeSettings({ graphics: 'performance', hintDismissed: true }, storage);
  assert.deepEqual(readSettings(storage), { graphics: 'performance', hintDismissed: true });
  storage.setItem('tld-settings-v1', '{oops');
  assert.deepEqual(readSettings(storage), { graphics: 'auto', hintDismissed: false });
  assert.deepEqual(readSettings({ getItem() { throw new Error('blocked'); } }), { graphics: 'auto', hintDismissed: false });
  assert.equal(writeSettings({ graphics: 'quality' }, { setItem() { throw new Error('blocked'); } }), false);
});

test('reset clears exactly the progress the game saves, for that character only', () => {
  const storage = memory();
  writeStory('me', { chapter: 3, step: 2, seen: true }, storage);
  writeCareer('me', joinCareer(normalizeCareer(null), 'police'), storage);
  writeNpcRelations('me', chooseNpcReply(newNpcRelations(), 'maya', 'friend').state, storage);
  storage.setItem('tld-life-v1:me', '{"day":4}');
  storage.setItem('tld-story-v1:someone-else', '{"chapter":2}');
  storage.setItem('tld-settings-v1', '{"graphics":"quality"}');
  // Every key the systems write is one reset knows about.
  for (const key of storage.store.keys()) if (key.endsWith(':me')) assert.ok(progressKeys('me').includes(key), key);
  assert.equal(resetProgress('me', storage), 4);
  assert.deepEqual(readStory('me', storage), { chapter: 0, step: 0, seen: false });
  assert.equal(readCareer('me', storage).career, null);
  assert.equal(readNpcRelations('me', storage).people.maya.trust, 0);
  assert.equal(storage.getItem('tld-story-v1:someone-else'), '{"chapter":2}', 'other characters untouched');
  assert.equal(readSettings(storage).graphics, 'quality', 'settings untouched');
  assert.equal(resetProgress('me', storage), 0);
});
