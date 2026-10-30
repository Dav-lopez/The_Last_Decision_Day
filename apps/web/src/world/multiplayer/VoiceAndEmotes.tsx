import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { EMOTES, EMOTE_LABELS, type RoomClient, type RoomState } from './roomClient.mjs';
import { createVoiceChat, proximityVolume, type VoiceChat, type VoiceState } from './voiceChat.mjs';

const LABEL: Record<VoiceState, string> = {
  idle: 'Voice off', calling: 'Calling your friend…', ringing: 'Your friend is calling', connecting: 'Connecting voice…', connected: 'Voice on',
};

/** Voice chat (browser to browser) and quick emotes for a two-player room. */
export function VoiceAndEmotes({ clientRef, room }: { clientRef: MutableRefObject<RoomClient | null>; room: RoomState }) {
  const [voice, setVoice] = useState<VoiceState>('idle');
  const [muted, setMuted] = useState(false);
  const [problem, setProblem] = useState('');
  const chat = useRef<VoiceChat | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const peer = room.players.find(player => player.characterId !== room.selfId);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || room.status !== 'connected' || !room.selfId) return;
    const voiceChat = createVoiceChat({
      selfId: room.selfId,
      signal: (kind, payload) => client.signal(kind, payload),
      createPeer: config => new RTCPeerConnection(config),
      getMicrophone: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
      onRemoteStream: stream => { if (audio.current) { audio.current.srcObject = stream; void audio.current.play().catch(() => {}); } },
      onState: setVoice,
    });
    chat.current = voiceChat;
    const unsubscribe = client.onSignal(signal => { void voiceChat.handle(signal).catch(() => {}); });
    return () => { unsubscribe(); voiceChat.dispose(); if (chat.current === voiceChat) chat.current = null; };
  }, [clientRef, room.status, room.selfId]);

  // Closer in the world means louder; in different places it's like a phone call.
  useEffect(() => {
    if (voice !== 'connected') return;
    const timer = window.setInterval(() => {
      const client = clientRef.current; const element = audio.current;
      if (!client || !element) return;
      const state = client.read(); const mine = client.selfPose();
      const theirs = state.players.find(player => player.characterId !== state.selfId)?.pose;
      const same = Boolean(mine && theirs && mine.location === theirs.location);
      element.volume = proximityVolume(mine && theirs ? Math.hypot(mine.x - theirs.x, mine.z - theirs.z) : NaN, same);
    }, 300);
    return () => window.clearInterval(timer);
  }, [voice, clientRef]);

  const run = (action: () => Promise<void> | void) => {
    setProblem('');
    Promise.resolve().then(action).catch(error => setProblem(error instanceof Error && /Permission|NotAllowed/i.test(error.name + error.message)
      ? 'Microphone permission was blocked. Allow it in the browser to talk.' : error instanceof Error ? error.message : 'Voice failed.'));
  };

  return <div className="online-voice" aria-label="Voice and emotes">
    <audio ref={audio} autoPlay />
    <p role="status"><strong>{LABEL[voice]}</strong>{voice === 'connected' ? ' · louder when you stand close' : ''}</p>
    <div className="online-actions">
      {voice === 'idle' && <button disabled={!peer} onClick={() => run(() => chat.current?.start())}>🎙️ Start voice chat</button>}
      {voice === 'ringing' && <>
        <button onClick={() => run(() => chat.current?.accept())}>📞 Answer</button>
        <button onClick={() => chat.current?.decline()}>Decline</button>
      </>}
      {voice !== 'idle' && voice !== 'ringing' && <>
        <button aria-pressed={muted} onClick={() => { const next = !muted; chat.current?.setMuted(next); setMuted(next); }}>{muted ? '🔇 Unmute' : '🎙️ Mute'}</button>
        <button onClick={() => chat.current?.hangup()}>Hang up</button>
      </>}
    </div>
    <div className="online-emotes" role="group" aria-label="Quick emotes">
      {EMOTES.map(name => <button key={name} type="button" disabled={room.status !== 'connected'}
        onClick={() => run(() => clientRef.current?.emote(name))}>{EMOTE_LABELS[name]}</button>)}
    </div>
    {problem && <p role="alert" className="error">{problem}</p>}
  </div>;
}
