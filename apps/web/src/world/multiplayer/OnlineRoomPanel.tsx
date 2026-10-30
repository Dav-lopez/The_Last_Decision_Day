import { useEffect, useRef, useState, type MutableRefObject, type FormEvent } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { createRoomClient, emptyRoom, type RoomClient } from './roomClient.mjs';
import './online.css';
import { VoiceAndEmotes } from './VoiceAndEmotes';

export default function OnlineRoomPanel({ clientRef }: { clientRef: MutableRefObject<RoomClient | null> }) {
  const [room, setRoom] = useState(emptyRoom);
  const [code, setCode] = useState(''), [draft, setDraft] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false), attempt = useRef<{ text: string; id: string } | null>(null);
  useEffect(() => {
    const client = createRoomClient({ changed: setRoom, connect: async () => {
      const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Sign in again to connect online.');
      const { token } = await response.json();
      return new HubConnectionBuilder().withUrl('/hubs/world', { withCredentials: true, headers: { 'X-CSRF-TOKEN': token } })
        .withAutomaticReconnect([0, 2000, 5000, 10000]).configureLogging(LogLevel.Warning).build();
    } });
    clientRef.current = client;
    return () => { if (clientRef.current === client) clientRef.current = null; client.dispose(); };
  }, [clientRef]);
  async function act(action: () => Promise<void>) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try { await action(); } catch (problem) { setError(problem instanceof Error ? problem.message : 'Connection failed. Try again.'); }
    finally { sending.current = false; setBusy(false); }
  }
  function send(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      if (!attempt.current || attempt.current.text !== draft) attempt.current = { text: draft, id: crypto.randomUUID() };
      await clientRef.current!.send(draft, attempt.current.id);
      setDraft(''); attempt.current = null;
    });
  }
  const connected = room.status === 'connected';
  return <section className="panel online-room" aria-label="Two-player online room">
    <h2>Play together</h2>
    <p>Two players, two accounts, on separate devices. Create a room and share its code with your friend.</p>
    <p role="status">{connected ? `${room.players.length}/2 players connected` : room.status === 'reconnecting' ? 'Reconnecting…' : room.status === 'connecting' ? 'Connecting…' : 'Offline'}</p>
    {!room.code ? <div className="online-actions">
      <button disabled={busy} onClick={() => void act(() => clientRef.current!.create())}>Create room</button>
      <form onSubmit={event => { event.preventDefault(); void act(() => clientRef.current!.join(code)); }}>
        <label>Room code<input value={code} maxLength={24} autoCapitalize="characters" autoComplete="off" onChange={event => setCode(event.target.value)} required /></label>
        <button disabled={busy}>Join room</button>
      </form>
    </div> : <>
      <p>Room code: <strong className="room-code">{room.code}</strong></p>
      <button disabled={busy} onClick={() => void act(async () => { await navigator.clipboard.writeText(room.code); })}>Copy code</button>
      <button disabled={busy} onClick={() => void act(async () => { await clientRef.current!.leave(); setDraft(''); attempt.current = null; })}>Leave room</button>
      <ul>{room.players.map(player => <li key={player.characterId}>{player.name}{player.characterId === room.selfId ? ' (you)' : ''} · {player.pose?.location ?? 'joining'}</li>)}</ul>
      <VoiceAndEmotes clientRef={clientRef} room={room} />
      <ol className="room-messages" aria-label="Room messages" aria-live="polite" aria-relevant="additions">{room.messages.map(message => <li key={message.id}><strong>{message.senderName}: </strong><span>{message.text}</span></li>)}</ol>
      <form onSubmit={send}>
        <label>Message your friend<textarea maxLength={280} value={draft} onChange={event => setDraft(event.target.value)} disabled={!connected} /></label>
        <button disabled={!connected || busy || !draft.trim()}>Send</button><small>{draft.length}/280</small>
      </form>
      <p className="online-hint">Walk in the same area to see each other. Your friend’s name marker follows them while driving. Decisions, cars and saved progress remain individual. Rooms and chat reset when the server restarts.</p>
    </>}
    {(error || room.error) && <p role="alert" className="error">{error || room.error}</p>}
  </section>;
}
