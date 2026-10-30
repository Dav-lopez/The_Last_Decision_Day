import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceChat, proximityVolume } from '../src/world/multiplayer/voiceChat.mjs';
import { EMOTES, mergeEmote } from '../src/world/multiplayer/roomClient.mjs';

/** Two fake peers wired through a fake relay: checks the handshake, not real audio. */
function fakeWorld() {
  const peers = [];
  const track = () => ({ enabled: true, stopped: false, stop() { this.stopped = true; } });
  const mic = () => { const t = track(); return { t, getTracks: () => [t], getAudioTracks: () => [t] }; };
  const createPeer = () => {
    const p = { local: null, remote: null, ice: [], tracks: [], closed: false, connectionState: 'new',
      addTrack(t) { this.tracks.push(t); },
      async createOffer() { return { type: 'offer', sdp: 'offer-sdp' }; }, async createAnswer() { return { type: 'answer', sdp: 'answer-sdp' }; },
      async setLocalDescription(d) { this.local = d; }, async setRemoteDescription(d) { this.remote = d; },
      async addIceCandidate(c) { this.ice.push(c); }, close() { this.closed = true; } };
    peers.push(p); return p;
  };
  return { peers, mic, createPeer };
}
function pair() {
  const world = fakeWorld();
  const inbox = { a: [], b: [] };
  const states = { a: [], b: [] };
  const make = (id, other) => createVoiceChat({ selfId: id, createPeer: world.createPeer, getMicrophone: async () => world.mic(),
    signal: async (kind, payload) => { inbox[other].push({ from: id, kind, payload }); }, onState: s => states[id].push(s) });
  const a = make('a', 'b'); const b = make('b', 'a');
  const deliver = async (to, chat) => { while (inbox[to].length) await chat.handle(inbox[to].shift()); };
  return { world, a, b, inbox, states, deliver };
}

test('a call rings, is accepted, and both sides exchange offer, answer and ICE', async () => {
  const { a, b, world, deliver, states } = pair();
  await a.start();
  assert.equal(a.state, 'calling');
  await deliver('b', b);
  assert.equal(b.state, 'ringing', 'no microphone until you pick up');
  assert.equal(world.peers.length, 1);
  await b.accept();
  await deliver('a', a);
  assert.equal(world.peers[0].remote.sdp, 'answer-sdp');
  assert.equal(world.peers[1].remote.sdp, 'offer-sdp');
  await a.handle({ from: 'b', kind: 'ice', payload: JSON.stringify({ candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 }) });
  assert.equal(world.peers[0].ice[0].candidate, 'candidate:1');
  assert.ok(states.b.includes('connecting'));
});

test('mute, hang-up and declines stop the microphone; junk signals are ignored', async () => {
  const { a, b, world, deliver } = pair();
  await a.start(); await deliver('b', b); await b.accept(); await deliver('a', a);
  a.setMuted(true);
  assert.equal(world.peers[0].tracks[0].enabled, false);
  a.hangup();
  assert.equal(a.state, 'idle'); assert.ok(world.peers[0].closed); assert.ok(world.peers[0].tracks[0].stopped);
  await deliver('b', b);
  assert.equal(b.state, 'idle', 'the other side hangs up too');
  await b.handle({ from: 'a', kind: 'offer', payload: '{"type":"evil"}' });
  await b.handle({ from: 'a', kind: 'offer', payload: 'not json' });
  assert.equal(b.state, 'idle');
  await a.start(); await deliver('b', b); b.decline();
  assert.equal(b.state, 'idle');
});

test('when both call at once, the player with the smaller id answers instead', async () => {
  const { a, b, inbox } = pair();
  await a.start(); await b.start();
  const toA = inbox.a.shift(); const toB = inbox.b.shift();
  await a.handle(toA); // a < b: a gives way and answers
  await b.handle(toB); // b ignores a's offer
  assert.equal(a.state, 'connecting');
  assert.equal(b.state, 'calling');
  assert.equal(inbox.b.at(-1).kind, 'answer');
});

test('voice is louder up close, phone-like apart; emotes are a fixed list', () => {
  assert.equal(proximityVolume(2, true), 1);
  assert.ok(proximityVolume(20, true) < 1 && proximityVolume(100, true) >= 0.15);
  assert.equal(proximityVolume(5, false), 0.4);
  let emotes = [];
  emotes = mergeEmote(emotes, { characterId: 'x', name: 'X', emote: 'wave' }, 1);
  emotes = mergeEmote(emotes, { characterId: 'x', name: 'X', emote: '<img>' }, 2);
  assert.equal(emotes.length, 1);
  assert.ok(EMOTES.includes('thumbs-up'));
  for (let i = 0; i < 20; i++) emotes = mergeEmote(emotes, { characterId: 'x', name: 'X', emote: 'cheer' }, i);
  assert.equal(emotes.length, 8);
});
