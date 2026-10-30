import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_DIALOGUES, newNpcRelations, normalizeNpcRelations, readNpcRelations, writeNpcRelations,
  nearbyNpc, beginNpcConversation, chooseNpcReply } from '../src/world/npcConversations.mjs';

test('curated NPC conversations have safe, unique choices and playable replies', () => {
  for (const [id, npc] of Object.entries(NPC_DIALOGUES)) {
    assert.ok(npc.persona && npc.name && npc.resident, id);
    assert.equal(npc.choices.length, 3);
    assert.equal(new Set(npc.choices.map(choice => choice.id)).size, 3);
    const started = beginNpcConversation(id, newNpcRelations());
    assert.equal(started.name, npc.name);
    assert.equal(started.choices.length, 3);
    assert.ok(started.greeting.length > 5);
    for (const choice of npc.choices) assert.ok(choice.label && choice.reply && choice.reply.length <= 260);
  }
});

test('only accessible, present classmates can be spoken with', () => {
  assert.equal(nearbyNpc({ x: -2.3, z: -5.05 }, 'street', 9 * 60), 'maya');
  assert.equal(nearbyNpc({ x: -1.8, z: -4.6 }, 'street', 9 * 60), 'jordan');
  assert.equal(nearbyNpc({ x: -2.3, z: -5.05 }, 'school', 9 * 60), null);
  assert.equal(nearbyNpc({ x: -2.3, z: -5.05 }, 'street', 22 * 60), null);
  assert.equal(nearbyNpc({ x: 100, z: 100 }, 'street', 9 * 60), null);
  assert.equal(nearbyNpc({ x: Number.NaN, z: 0 }, 'street', 9 * 60), null);
});

test('choices advance relationship independently and cannot forge gameplay events', () => {
  const starting = newNpcRelations();
  const first = chooseNpcReply(starting, 'maya', 'friend');
  assert.equal(first.state.people.maya.trust, 2);
  assert.equal(first.state.people.jordan.trust, 0);
  assert.equal(first.event, 'talked-maya');
  assert.equal(first.mood, 'happy');
  assert.equal(starting.people.maya.trust, 0, 'state is immutable');
  let next = first.state;
  for (let i = 0; i < 15; i++) next = chooseNpcReply(next, 'maya', 'dismiss').state;
  assert.equal(next.people.maya.trust, -5);
  assert.equal(beginNpcConversation('maya', next).greeting, NPC_DIALOGUES.maya.wary);
  assert.equal(chooseNpcReply(next, 'rivera', 'advice').event, 'talked-teacher');
  assert.equal(chooseNpcReply(next, 'jordan', 'invalid'), null);
  assert.equal(chooseNpcReply(next, 'unknown', 'note'), null);
});

test('relationship state saves separately per character and rejects corruption', () => {
  const items = new Map();
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  const after = chooseNpcReply(newNpcRelations(), 'jordan', 'school').state;
  assert.equal(writeNpcRelations('person-a', after, storage), true);
  assert.deepEqual(readNpcRelations('person-a', storage), after);
  assert.deepEqual(readNpcRelations('person-b', storage), newNpcRelations());
  items.set('tld-npc-relations-v1:person-a', '{broken');
  assert.deepEqual(readNpcRelations('person-a', storage), newNpcRelations());
  const corrupted = normalizeNpcRelations({ version: 1, people: { maya: { trust: 900, conversations: 900, lastChoice: 'evil' } } });
  assert.deepEqual(corrupted.people.maya, { trust: 5, conversations: 99, lastChoice: null });
  assert.equal(writeNpcRelations('x', after, { setItem: () => { throw Error('quota'); } }), false);
});

test('neighbours out walking can be stopped for a chat where they actually are', async () => {
  const { NEIGHBORS, isOut } = await import('../src/world/npcLayout.mjs');
  const minute = 9 * 60;
  for (const id of ['okafor', 'tess', 'marcus', 'elena', 'ruth']) {
    const resident = NEIGHBORS.find(person => person.id === NPC_DIALOGUES[id].resident);
    assert.ok(resident && resident.route.kind === 'segment' && isOut(resident, minute), id);
    const at = { x: 2.45, z: 3 };
    // Only the live position counts: nobody is "there" without the scene's report.
    assert.equal(nearbyNpc({ x: 2.45, z: 4.5 }, 'street', minute, null), null);
    assert.equal(nearbyNpc({ x: 2.45, z: 4.5 }, 'street', minute, { [resident.id]: at }), id);
    assert.equal(nearbyNpc({ x: 2.45, z: 6 }, 'street', minute, { [resident.id]: at }), null, 'out of reach');
    assert.equal(nearbyNpc({ x: 2.45, z: 4.5 }, 'street', 23 * 60, { [resident.id]: at }), null, 'gone home');
    assert.equal(chooseNpcReply(newNpcRelations(), id, NPC_DIALOGUES[id].choices[0].id).event, `talked-${id}`);
  }
  // The nearest of two is chosen; a standing classmate still wins when closer.
  const live = { 'jogger-west': { x: -2.4, z: -3 }, crosser: { x: -2.4, z: -2 } };
  assert.equal(nearbyNpc({ x: -2.4, z: -1.6 }, 'street', minute, live), 'ruth');
  assert.equal(nearbyNpc({ x: -2.3, z: -5.05 }, 'street', minute, { 'jogger-west': { x: -2.3, z: -4 } }), 'maya');
  // Relationships for the new neighbours save and reload.
  const state = normalizeNpcRelations(chooseNpcReply(newNpcRelations(), 'okafor', 'street').state);
  assert.equal(state.people.okafor.trust, 2);
  assert.equal(state.people.tess.trust, 0);
});
