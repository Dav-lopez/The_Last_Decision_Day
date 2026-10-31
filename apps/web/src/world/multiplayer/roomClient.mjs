import { readLook } from '../appearance.mjs';

export const emptyRoom = () => ({ status: 'offline', code: '', selfId: '', players: [], messages: [], emotes: [], error: '' });
export const EMOTES = Object.freeze(['wave', 'cheer', 'dance', 'thumbs-up', 'laugh', 'follow-me', 'over-here', 'nice']);
export const EMOTE_LABELS = Object.freeze({ wave: '👋 Wave', cheer: '🎉 Cheer', dance: '💃 Dance', 'thumbs-up': '👍 Thumbs up', laugh: '😂 Laugh', 'follow-me': '➡️ Follow me', 'over-here': '📍 Over here', nice: '✨ Nice!' });
/** Keep the last few emotes (each shown for a few seconds over the sender). */
export function mergeEmote(emotes, emote, at) {
  if (!emote || typeof emote.characterId !== 'string' || !EMOTES.includes(emote.emote)) return emotes;
  return [...emotes, { ...emote, at }].slice(-8);
}
export function normalizeCode(value) {
  const code = String(value).replace(/[\s-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{16}$/.test(code)) throw new Error('Enter the 16-character room code.');
  return code;
}
export function mergeMessage(messages, message) {
  if (!message || typeof message.id !== 'string' || typeof message.text !== 'string' || message.text.length > 280 || !Number.isSafeInteger(message.sequence)) return messages;
  return [...messages.filter(item => item.id !== message.id), message].sort((a, b) => a.sequence - b.sequence).slice(-64);
}
/** Transport-independent lifecycle; account changes dispose this instance. */
export function createRoomClient({ connect, changed = () => {}, now = () => performance.now(), uuid = () => crypto.randomUUID(), onSignal = () => {}, bodyFor = id => readLook(id).body }) {
  const signalListeners = new Set(onSignal ? [onSignal] : []);
  let selfPose = null, state = emptyRoom(), hub = null, generation = 0, disposed = false, starting = null, action = false, posePending = false, lastPose = -Infinity;
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; changed(state); } };
  const current = (connection, ticket) => !disposed && hub === connection && generation === ticket;
  async function ensure() {
    if (disposed) throw new Error('This room session has ended.');
    if (hub?.state === 'Connected') return hub;
    if (starting) return starting;
    const ticket = generation;
    starting = (async () => {
      emit({ status: 'connecting', error: '' });
      const connection = await connect();
      if (disposed || ticket !== generation) { await connection.stop(); throw new Error('Session ended.'); }
      hub = connection;
      connection.on('RoomRoster', roster => { if (current(connection, ticket) && roster.code === state.code && state.status === 'connected') emit({ players: roster.players.slice(0, 2) }); });
      connection.on('RoomMessage', message => { if (current(connection, ticket) && state.status === 'connected') emit({ messages: mergeMessage(state.messages, message) }); });
      connection.on('PlayerPose', player => {
        if (current(connection, ticket) && state.status === 'connected') emit({ players: state.players.map(item => item.characterId === player.characterId ? player : item) });
      });
      connection.on('PlayerEmote', emote => { if (current(connection, ticket) && state.status === 'connected') emit({ emotes: mergeEmote(state.emotes, emote, now()) }); });
      connection.on('VoiceSignal', signal => {
        if (!current(connection, ticket) || state.status !== 'connected' || !signal || typeof signal.kind !== 'string') return;
        for (const listener of signalListeners) listener(signal);
      });
      connection.on('SessionReplaced', () => {
        if (!current(connection, ticket)) return;
        emit({ ...emptyRoom(), error: 'This character joined from another device. Use separate accounts for two players.' });
        generation++; hub = null; void connection.stop();
      });
      connection.onreconnecting(() => { if (current(connection, ticket)) emit({ status: 'reconnecting', players: [], error: 'Connection interrupted. Rejoining…' }); });
      connection.onreconnected(async () => {
        if (!current(connection, ticket) || !state.code) return;
        try {
          const snapshot = await connection.invoke('JoinRoom', state.code);
          if (current(connection, ticket)) emit({ ...snapshot, status: 'connected', error: '' });
        } catch (error) {
          if (current(connection, ticket)) emit({ ...emptyRoom(), error: error.message });
        }
      });
      connection.onclose(() => { if (current(connection, ticket)) emit({ ...emptyRoom(), error: 'Disconnected. Create or join a room again.' }); });
      await connection.start();
      if (!current(connection, ticket)) { await connection.stop(); throw new Error('Session ended.'); }
      return connection;
    })();
    try { return await starting; } finally { starting = null; }
  }
  async function enter(method, code) {
    if (action) throw new Error('Please wait for the current room action.');
    action = true;
    try {
      const normalized = method === 'JoinRoom' ? normalizeCode(code) : null;
      const connection = await ensure(); const ticket = generation;
      const snapshot = await connection.invoke(method, ...(normalized ? [normalized] : []));
      if (current(connection, ticket)) emit({ ...snapshot, status: 'connected', error: '' });
    } catch (error) { emit({ status: state.code ? state.status : 'offline', error: error.message }); throw error; }
    finally { action = false; }
  }
  return {
    read: () => state,
    create: () => enter('CreateRoom'), join: code => enter('JoinRoom', code),
    async send(text, clientMessageId = uuid()) {
      if (state.status !== 'connected' || !hub) throw new Error('Connect to a room before sending.');
      const safe = text.trim();
      if (!safe || safe.length > 280) throw new Error('Write 1–280 characters.');
      const connection = hub, ticket = generation;
      const message = await connection.invoke('SendMessage', clientMessageId, safe);
      if (current(connection, ticket)) emit({ messages: mergeMessage(state.messages, message) });
    },
    /** A quick emote: shown over your avatar on your friend's screen (and yours). */
    async emote(name) {
      if (state.status !== 'connected' || !hub) throw new Error('Connect to a room first.');
      if (!EMOTES.includes(name)) throw new Error('Unknown emote.');
      const connection = hub, ticket = generation;
      await connection.invoke('SendEmote', name);
      if (current(connection, ticket)) emit({ emotes: mergeEmote(state.emotes, { characterId: state.selfId, name: 'You', emote: name }, now()) });
    },
    /** Voice chat signaling (offer/answer/ice/hangup), relayed by the server to your friend. */
    async signal(kind, payload) {
      if (state.status !== 'connected' || !hub) throw new Error('Connect to a room first.');
      await hub.invoke('SendSignal', kind, payload);
    },
    onSignal(listener) { signalListeners.add(listener); return () => signalListeners.delete(listener); },
    /** Your last published position (for voice volume by distance). */
    selfPose: () => selfPose,
    publish(pose) {
      selfPose = pose;
      if (!hub || state.status !== 'connected' || posePending || now() - lastPose < 200) return;
      posePending = true; lastPose = now();
      // Only send the two supported body variants; never accept model paths
      // from local storage or the network. The server validates this too.
      const body = bodyFor(state.selfId) === 'female' ? 'female' : 'male';
      void hub.invoke('PublishPose', { ...pose, body }).catch(() => {}).finally(() => { posePending = false; });
    },
    async leave() {
      generation++; const old = hub; hub = null;
      emit(emptyRoom());
      if (old) await old.stop();
    },
    dispose() { disposed = true; generation++; const old = hub; hub = null; state = emptyRoom(); if (old) void old.stop(); },
  };
}
