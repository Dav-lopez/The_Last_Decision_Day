/**
 * Two-player voice chat: browser-to-browser audio (WebRTC). The game server
 * only relays the handshake (offer, answer, ICE candidates, hang-up) between
 * the two players in a room; the audio itself goes directly between them.
 * The microphone is opened only when you start or accept a call.
 */
export const VOICE_ICE = Object.freeze([{ urls: 'stun:stun.l.google.com:19302' }]);

/** Louder the closer you stand; in different places it sounds like a phone call. */
export function proximityVolume(distance, sameLocation) {
  if (!sameLocation) return 0.4;
  if (!Number.isFinite(distance)) return 0.4;
  return Math.max(0.15, Math.min(1, 1 - (distance - 3) / 37));
}

function parse(payload, kind) {
  try {
    const value = JSON.parse(payload);
    if (kind === 'ice') return value && typeof value.candidate === 'string' ? { candidate: value.candidate, sdpMid: value.sdpMid ?? null, sdpMLineIndex: Number.isInteger(value.sdpMLineIndex) ? value.sdpMLineIndex : null } : null;
    return value && (value.type === 'offer' || value.type === 'answer') && typeof value.sdp === 'string' ? { type: value.type, sdp: value.sdp } : null;
  } catch { return null; }
}

export function createVoiceChat({ selfId, signal, createPeer, getMicrophone, onRemoteStream = () => {}, onState = () => {} }) {
  let state = 'idle'; let peer = null; let mic = null; let pendingOffer = null; let pendingFrom = null; let muted = false;
  let remoteSet = false; const queuedIce = [];
  const set = next => { state = next; onState(state); };

  function close(notify) {
    peer?.close?.(); peer = null;
    for (const track of mic?.getTracks?.() ?? []) track.stop();
    mic = null; remoteSet = false; queuedIce.length = 0; pendingOffer = null; pendingFrom = null;
    if (notify) void signal('hangup', '{}').catch(() => {});
    set('idle');
  }
  async function open() {
    mic = await getMicrophone();
    for (const track of mic.getAudioTracks?.() ?? mic.getTracks?.() ?? []) track.enabled = !muted;
    peer = createPeer({ iceServers: VOICE_ICE });
    for (const track of mic.getTracks?.() ?? []) peer.addTrack(track, mic);
    peer.onicecandidate = event => { if (event.candidate) void signal('ice', JSON.stringify(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate)).catch(() => {}); };
    peer.ontrack = event => { onRemoteStream(event.streams?.[0] ?? null); };
    peer.onconnectionstatechange = () => {
      if (peer?.connectionState === 'connected') set('connected');
      else if (peer && ['failed', 'closed'].includes(peer.connectionState)) close(false);
    };
  }
  async function flushIce() {
    remoteSet = true;
    while (queuedIce.length) { try { await peer.addIceCandidate(queuedIce.shift()); } catch {} }
  }
  async function answer(offer) {
    await open();
    await peer.setRemoteDescription(offer);
    await flushIce();
    const description = await peer.createAnswer();
    await peer.setLocalDescription(description);
    await signal('answer', JSON.stringify({ type: 'answer', sdp: description.sdp }));
    set('connecting');
  }

  return {
    get state() { return state; },
    get muted() { return muted; },
    /** Call your friend. */
    async start() {
      if (state !== 'idle') return;
      set('calling');
      try {
        await open();
        const description = await peer.createOffer();
        await peer.setLocalDescription(description);
        await signal('offer', JSON.stringify({ type: 'offer', sdp: description.sdp }));
      } catch (error) { close(false); throw error; }
    },
    /** Pick up an incoming call. */
    async accept() {
      if (state !== 'ringing' || !pendingOffer) return;
      const offer = pendingOffer; pendingOffer = null;
      try { await answer(offer); } catch (error) { close(true); throw error; }
    },
    decline() { if (state === 'ringing') close(true); },
    hangup() { if (state !== 'idle') close(true); },
    setMuted(value) {
      muted = Boolean(value);
      for (const track of mic?.getTracks?.() ?? []) track.enabled = !muted;
    },
    /** Feed a relayed signal from the other player. */
    async handle({ from, kind, payload }) {
      if (kind === 'hangup') { if (state !== 'idle') close(false); return; }
      const message = parse(payload, kind);
      if (!message) return;
      if (kind === 'offer') {
        if (state === 'idle') { pendingOffer = message; pendingFrom = from; set('ringing'); return; }
        // Both called at once: the player with the smaller id gives way and answers.
        if (state === 'calling' && String(selfId) < String(from)) {
          peer?.close?.(); peer = null; for (const track of mic?.getTracks?.() ?? []) track.stop(); mic = null; remoteSet = false;
          try { await answer(message); } catch { close(true); }
        }
        return;
      }
      if (kind === 'answer' && state === 'calling' && peer) {
        await peer.setRemoteDescription(message);
        await flushIce();
        set('connecting');
        return;
      }
      if (kind === 'ice') {
        if (peer && remoteSet) { try { await peer.addIceCandidate(message); } catch {} }
        else if (queuedIce.length < 64) queuedIce.push(message);
      }
    },
    dispose() { close(state !== 'idle'); },
  };
}
