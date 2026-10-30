import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomClient, normalizeCode, mergeMessage } from '../src/world/multiplayer/roomClient.mjs';
const code = '0123456789ABCDEF';
const snapshot = { code, selfId: 'alice', players: [{ characterId: 'alice', name: 'Alice', pose: null }, { characterId: 'bob', name: 'Bob', pose: null }], messages: [] };
function transport() {
  const handlers = {}, events = {}, calls = [];
  const hub = { state: 'Disconnected', calls, handlers, events,
    on(name, fn) { handlers[name] = fn; }, onreconnecting(fn) { events.reconnecting = fn; }, onreconnected(fn) { events.reconnected = fn; }, onclose(fn) { events.close = fn; },
    async start() { this.state = 'Connected'; }, async stop() { this.state = 'Disconnected'; events.close?.(); },
    async invoke(method, ...args) { calls.push([method, ...args]); if (method === 'CreateRoom' || method === 'JoinRoom') return structuredClone(snapshot); if (method === 'SendMessage') return { id: args[0], text: args[1], sequence: 1 }; },
  };
  return hub;
}
test('room codes accept copied separators and reject incomplete values', () => {
  assert.equal(normalizeCode('0123-4567 89ab-cdef'), code);
  for (const bad of ['', '12', 'G'.repeat(16), '<script>']) assert.throws(() => normalizeCode(bad));
});
test('joining uses the live transport and receives peer positions and chat', async () => {
  const hub = transport(), client = createRoomClient({ connect: async () => hub });
  await client.join(code.toLowerCase());
  assert.deepEqual(hub.calls[0], ['JoinRoom', code]);
  hub.handlers.PlayerPose({ characterId: 'bob', name: 'Bob', pose: { x: 4, z: 2 } });
  assert.equal(client.read().players[1].pose.x, 4);
  hub.handlers.RoomMessage({ id: 'm1', text: 'Meet at school', sequence: 1 });
  assert.equal(client.read().messages[0].text, 'Meet at school');
  client.dispose(); assert.equal(hub.state, 'Disconnected');
});
test('delivered retry and echo deduplicate without interpreting HTML', async () => {
  const hub = transport(), client = createRoomClient({ connect: async () => hub }); await client.create();
  await client.send('<b>hello</b>', 'id1'); hub.handlers.RoomMessage({ id: 'id1', text: '<b>hello</b>', sequence: 1 });
  assert.equal(client.read().messages.length, 1); assert.equal(client.read().messages[0].text, '<b>hello</b>');
  await assert.rejects(client.send('a'.repeat(281), 'id2')); client.dispose();
});
test('reconnect hides stale avatars, disables send and rejoins the same room', async () => {
  const hub = transport(), client = createRoomClient({ connect: async () => hub }); await client.create();
  hub.events.reconnecting(); assert.equal(client.read().players.length, 0);
  await assert.rejects(client.send('hello', 'id'));
  await hub.events.reconnected(); assert.equal(client.read().status, 'connected'); assert.deepEqual(hub.calls.at(-1), ['JoinRoom', code]); client.dispose();
});
test('lost rooms reset the code so the player can create a fresh session', async () => {
  const hub = transport(), client = createRoomClient({ connect: async () => hub }); await client.create();
  hub.events.reconnecting(); hub.invoke = async () => { throw new Error('Room expired'); }; await hub.events.reconnected();
  assert.equal(client.read().code, ''); assert.match(client.read().error, /expired/); client.dispose();
});
test('account disposal during connection creation cannot resurrect membership', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; }); const hub = transport();
  const client = createRoomClient({ connect: () => waiting }); const joined = client.create(); client.dispose(); finish(hub);
  await assert.rejects(joined); assert.equal(hub.calls.length, 0); assert.equal(client.read().status, 'offline');
});
test('a replaced same-account session stops instead of rejoining against the new device', async () => {
  const hub = transport(), client = createRoomClient({ connect: async () => hub }); await client.create(); hub.handlers.SessionReplaced();
  assert.equal(hub.state, 'Disconnected'); assert.equal(client.read().code, ''); assert.match(client.read().error, /separate accounts/);
});
test('pose publishing is bounded to five updates per second and one in-flight invocation', async () => {
  let clock = 0; const hub = transport(), client = createRoomClient({ connect: async () => hub, now: () => clock }); await client.create();
  client.publish({ x: 1 }); client.publish({ x: 2 }); await new Promise(resolve => setImmediate(resolve));
  clock = 100; client.publish({ x: 3 }); clock = 200; client.publish({ x: 4 });
  assert.equal(hub.calls.filter(call => call[0] === 'PublishPose').length, 2); client.dispose();
});
test('a failed join cannot pretend to connect or discard an existing room', async () => {
  const hub = transport(), client = createRoomClient({ connect: async () => hub }); await client.create();
  hub.invoke = async () => { throw new Error('Room full'); }; await assert.rejects(client.join('F'.repeat(16)));
  assert.equal(client.read().code, code); assert.match(client.read().error, /full/); await client.leave(); assert.equal(client.read().players.length, 0);
});
test('message history is ordered and bounded to the latest 64', () => {
  let history = []; for (let i = 100; i > 0; i--) history = mergeMessage(history, { id: `${i}`, text: `${i}`, sequence: i });
  assert.equal(history.length, 64); assert.equal(history[0].sequence, 37); assert.equal(history.at(-1).sequence, 100);
});
