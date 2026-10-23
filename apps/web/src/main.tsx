import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';
import './style.css';

type Profile = { id: string; displayName: string; gameAge: number; attributes: Record<string, number>; coins: number };
type Session = { userId: string; email: string };
type Mode = 'login' | 'register';

class IntroScene extends Phaser.Scene {
  constructor() { super('intro'); }
  create(): void {
    this.add.text(45, 55, 'THE LAST DECISION', { fontSize: '32px', color: '#ffffff' });
    this.add.text(45, 112, 'Your life. Your choices. Your consequences.', { fontSize: '18px', color: '#ffffff' });
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

async function csrf(): Promise<string> {
  const result = await request<{ token: string }>('/api/v1/auth/csrf');
  return result.token;
}

async function post<T>(path: string, payload?: unknown): Promise<T> {
  const token = await csrf();
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

function App() {
  const scene = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gameAge, setGameAge] = useState(18);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!scene.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: scene.current, width: 800, height: 450,
      backgroundColor: '#14213d', scene: IntroScene,
    });
    return () => game.destroy(true);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await request<Session>('/api/v1/auth/me');
        if (!active) return;
        setSession(me);
        try { setProfile(await request<Profile>('/api/v1/characters/me')); }
        catch { /* Character may not exist yet. */ }
      } catch { /* Anonymous visitors see the login form. */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const data = mode === 'login' ? { email, password } :
        { email, password, dateOfBirth: birthDate, inviteToken };
      const result = await post<Session>(`/api/v1/auth/${mode}`, data);
      setSession(result);
      setProfile(null);
      setPassword('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  }

  async function createCharacter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const result = await post<Profile>('/api/v1/characters', { displayName, gameAge });
      setProfile(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create character.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setMessage('');
    try { await post<void>('/api/v1/auth/logout'); setSession(null); setProfile(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Logout failed.'); }
    finally { setBusy(false); }
  }

  return <main className="page">
    <header><h1>The Last Decision</h1><p>Your life. Your choices. Your consequences.</p></header>
    <div className="hero" ref={scene} aria-label="The Last Decision game intro" />
    <section className="panel" aria-live="polite">
      {loading ? <p>Loading your account…</p> : !session ? <>
        <div className="tabs">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Sign in</button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => setMode('register')}>Use invitation</button>
        </div>
        <form onSubmit={authenticate}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {mode === 'register' && <>
            <label>Date of birth<input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} required /></label>
            <label>Invitation token<input value={inviteToken} onChange={e => setInviteToken(e.target.value)} required /></label>
          </>}
          <button disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      </> : <>
        <div className="account"><span>Signed in as {session.email}</span><button type="button" disabled={busy} onClick={logout}>Sign out</button></div>
        {!profile ? <>
          <h2>Create your character</h2>
          <p>Start your story with one character per account.</p>
          <form onSubmit={createCharacter}>
            <label>Character name<input minLength={2} maxLength={32} value={displayName} onChange={e => setDisplayName(e.target.value)} required /></label>
            <label>Character age<input type="number" min={18} max={100} value={gameAge} onChange={e => setGameAge(Number(e.target.value))} required /></label>
            <button disabled={busy}>{busy ? 'Creating…' : 'Begin your story'}</button>
          </form>
        </> : <>
          <h2>Welcome, {profile.displayName}</h2>
          <p>Age {profile.gameAge} · {profile.coins} COIN</p>
          <div className="stats">{Object.entries(profile.attributes).map(([name, value]) =>
            <div key={name}><strong>{name}</strong><span>{value}/100</span></div>)}</div>
          <p>School activities and the city experience are coming next.</p>
        </>}
      </>}
      {message && <p className="error" role="alert">{message}</p>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
