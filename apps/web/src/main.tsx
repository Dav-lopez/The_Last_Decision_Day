import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import OnlineRoomPanel from './world/multiplayer/OnlineRoomPanel';
import type { RoomClient } from './world/multiplayer/roomClient.mjs';
import { canStartSchoolActivity, millisecondsUntilReset, type SchoolTimeBalance } from './schoolTime';
import { createSchoolActionGate } from './schoolActionGate.mjs';
import { GameErrorBoundary, PlaytestCrash, PrivacyNote, WhatsNew } from './ReleaseInfo';
import { GAME_TAGLINE, GAME_TITLE, LATEST_RELEASE, markSeen, readLastSeen, unseenNotes } from './releaseInfo.mjs';

type Profile = { id: string; displayName: string; gameAge: number; attributes: Record<string, number>; coins: number };
type SchoolActivity = { id: string; title: string; description: string; timeCost: number; changes: { attribute: string; delta: number }[] };
type ActivityPreview = { activityId: string; timeCost: number; before: Record<string, number>; after: Record<string, number> };
type SchoolExecutionResult = ActivityPreview & { correlationId: string };
type SchoolHistoryEntry = SchoolExecutionResult & { completedAt: string };
type Session = { userId: string; email: string };
type Mode = 'login' | 'register';

const WorldScene = lazy(() => import('./world/WorldScene'));
const LandingWorld = lazy(() => import('./LandingWorld'));

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string; title?: string };
    const explanation = body.error ?? body.message ?? body.title;
    if (response.status === 404 && path.startsWith('/api/')) throw new Error('Game API is unavailable at this address. Check the frontend API proxy and backend deployment.');
    if (response.status === 401) throw new Error(explanation ?? 'Incorrect credentials or your session has expired.');
    if (response.status === 403) throw new Error(explanation ?? 'Access denied. Registration may require a valid invitation.');
    if (response.status === 409) throw new Error(explanation ?? 'This account already exists. Try signing in.');
    if (response.status === 429) throw new Error('Too many attempts. Wait a moment before trying again.');
    throw new Error(explanation ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

async function csrf(): Promise<string> {
  const result = await request<{ token: string }>('/api/v1/auth/csrf');
  return result.token;
}

const LIFE_PATH = '/api/v1/characters/me/life';
type SavedLife = { day: number; minute: number; energy: number; location: 'street' | 'home'; saved?: boolean };

/** The signed-in player's day, saved to their account (see LifeEndpoints on the API). */
const accountLifeSync = {
  load: () => request<SavedLife>(LIFE_PATH),
  async save(life: SavedLife): Promise<{ status: 'saved' | 'rejected'; life: SavedLife }> {
    const token = await csrf();
    const response = await fetch(LIFE_PATH, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify(life),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; current?: SavedLife } & Partial<SavedLife>;
    if (response.ok) return { status: 'saved', life: body as SavedLife };
    // 409: another device saved a later day. 422: this save isn't possible from the last one.
    if ((response.status === 409 || response.status === 422) && body.current) return { status: 'rejected', life: body.current };
    throw new Error(body.error ?? `Saving your day failed (${response.status})`);
  },
};

const PROGRESS_PATH = '/api/v1/characters/me/progress';
type SavedProgress = { saved?: boolean; savedAt: number; data: unknown };

/** The signed-in player's story, career and relationships (see ProgressEndpoints on the API). Newest save wins. */
const accountProgressSync = {
  load: () => request<SavedProgress>(PROGRESS_PATH),
  async save(progress: { savedAt: number; data: unknown }): Promise<{ status: 'saved' | 'rejected'; progress: SavedProgress }> {
    const token = await csrf();
    const response = await fetch(PROGRESS_PATH, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify(progress),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; current?: SavedProgress } & Partial<SavedProgress>;
    if (response.ok) return { status: 'saved', progress: body as SavedProgress };
    // 409: another device saved newer progress; the game adopts it.
    if (response.status === 409 && body.current) return { status: 'rejected', progress: body.current };
    throw new Error(body.error ?? `Saving your progress failed (${response.status})`);
  },
};

async function post<T>(path: string, payload?: unknown): Promise<T> {
  const token = await csrf();
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

/** While the game code itself downloads (before the world's own loading screen can show). */
function GameDownloading() {
  return <div className="hero hero-placeholder hero-loading" role="status" aria-label="Downloading the game">
    <p>Downloading the game…</p>
    <div className="hero-loading-bar" aria-hidden="true"><span /></div>
  </div>;
}

/** localStorage, or null where the browser blocks it (some private windows). */
function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** `?playtest&crash`: the playtest checks the error screen by making the game throw on purpose. */
const PLAYTEST_CRASH = (() => {
  try { const params = new URLSearchParams(window.location.search); return params.has('playtest') && params.has('crash'); }
  catch { return false; }
})();

/** Below the sign-in panel: the latest changes and the privacy note, so players can read both before starting. */
function SiteFooter() {
  const [fresh] = useState(() => new Set(unseenNotes(readLastSeen(safeStorage())).map(note => note.id)));
  const returning = readLastSeen(safeStorage()) !== null;
  return <footer className="site-footer">
    <details onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open) markSeen(safeStorage(), LATEST_RELEASE); }}>
      <summary>What's new{returning && fresh.size > 0 && <span className="whats-new-tag">{fresh.size} new</span>}</summary>
      <WhatsNew fresh={returning ? fresh : undefined} limit={2} />
      <p><small>The full list is in the game menu (Esc → What's new).</small></p>
    </details>
    <details>
      <summary>Privacy</summary>
      <PrivacyNote />
    </details>
    <small>{GAME_TITLE} · an original game · map data © OpenStreetMap contributors</small>
  </footer>;
}

function App() {
  const onlineRef = useRef<RoomClient | null>(null);
  const schoolSection = useRef<HTMLHeadingElement>(null);
  const pendingAction = useRef<{ activityId: string; key: string } | null>(null);
  const actionGate = useRef(createSchoolActionGate());
  const [session, setSession] = useState<Session | null>(null);
  const [guestDemo, setGuestDemo] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activities, setActivities] = useState<SchoolActivity[]>([]);
  const [history, setHistory] = useState<SchoolHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [timeBalance, setTimeBalance] = useState<SchoolTimeBalance | null>(null);
  const [timeError, setTimeError] = useState('');
  const [preview, setPreview] = useState<ActivityPreview | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gameAge, setGameAge] = useState(18);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!profile) return;
    let active = true;
    request<SchoolActivity[]>('/api/v1/school/activities')
      .then(items => { if (active) setActivities(items); })
      .catch(() => { if (active) setMessage('Unable to load school activities.'); });
    return () => { active = false; };
  }, [profile]);

  useEffect(() => {
    if (!profile?.id) {
      setHistory([]);
      setHistoryError('');
      return;
    }
    let active = true;
    setHistoryLoading(true);
    request<SchoolHistoryEntry[]>('/api/v1/school/history')
      .then(items => { if (active) { setHistory(items); setHistoryError(''); } })
      .catch(() => { if (active) setHistoryError('Unable to load saved school activities.'); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [profile?.id, historyVersion]);

  useEffect(() => {
    if (!profile?.id) { setTimeBalance(null); setTimeError(''); return; }
    let active = true;
    setTimeBalance(null);
    setTimeError('');
    request<SchoolTimeBalance>('/api/v1/school/time')
      .then(balance => { if (active) { setTimeBalance(balance); setTimeError(''); } })
      .catch(() => { if (active) setTimeError('Unable to load school time. Refresh to retry.'); });
    return () => { active = false; };
  }, [profile?.id, historyVersion]);

  // Refresh server-authoritative school time after UTC midnight, including when a
  // background tab sleeps through the timer. Never use yesterday's budget to
  // enable new activity buttons while a fresh balance is loading.
  useEffect(() => {
    if (!profile?.id || !timeBalance) return;
    const delay = millisecondsUntilReset(timeBalance);
    if (delay === null) return;

    const refreshIfExpired = () => {
      if (millisecondsUntilReset(timeBalance) === 0)
        setHistoryVersion(version => version + 1);
    };
    const timer = window.setTimeout(refreshIfExpired, Math.min(delay + 100, 2_147_483_647));
    const onVisible = () => { if (!document.hidden) refreshIfExpired(); };
    window.addEventListener('focus', refreshIfExpired);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refreshIfExpired);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [profile?.id, timeBalance?.resetsAt]);

  async function previewActivity(activityId: string) {
    const ticket = actionGate.current.beginPreview();
    if (ticket === null) return;
    setMessage(''); setPreview(null);
    try {
      const result = await request<ActivityPreview>(`/api/v1/school/activities/${encodeURIComponent(activityId)}/preview`);
      if (actionGate.current.isCurrentPreview(ticket)) setPreview(result);
    } catch (error) {
      if (actionGate.current.isCurrentPreview(ticket))
        setMessage(error instanceof Error ? error.message : 'Preview unavailable.');
    }
  }

  async function executeActivity(activityId: string) {
    // Guard synchronously: a second tap can arrive before React renders busy=true.
    const ticket = actionGate.current.beginExecution();
    if (ticket === null) return;
    setBusy(true); setMessage(''); setPreview(null);
    try {
      const key = pendingAction.current?.activityId === activityId
        ? pendingAction.current.key : crypto.randomUUID();
      pendingAction.current = { activityId, key };
      const token = await csrf();
      const outcome = await request<SchoolExecutionResult>(
        `/api/v1/school/activities/${encodeURIComponent(activityId)}/execute`, {
          method: 'POST',
          headers: { 'X-CSRF-TOKEN': token, 'Idempotency-Key': key },
        });
      if (!actionGate.current.isCurrentSession(ticket)) return;
      setProfile(current => current ? { ...current, attributes: outcome.after } : current);
      pendingAction.current = null;
      // Disable further execution until the server confirms the new daily budget.
      setTimeBalance(null);
      setHistoryVersion(version => version + 1);
      setMessage('Activity completed. Your updated attributes were saved.');
    } catch (error) {
      if (actionGate.current.isCurrentSession(ticket))
        setMessage((error instanceof Error ? error.message : 'Unable to complete activity.') +
          ' You can retry the same activity safely.');
    } finally {
      actionGate.current.endExecution(ticket);
      if (actionGate.current.isCurrentSession(ticket)) setBusy(false);
    }
  }

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const data = mode === 'login' ? { email, password } :
        { email, password, dateOfBirth: birthDate };
      const result = await post<Session>(`/api/v1/auth/${mode}`, data);
      actionGate.current.resetSession();
      pendingAction.current = null;
      setPreview(null); setActivities([]); setHistory([]); setTimeBalance(null);
      setSession(result);
      setGuestDemo(false);
      setProfile(null);
      if (mode === 'login') {
        const response = await fetch('/api/v1/characters/me', { credentials: 'same-origin' });
        if (response.ok) setProfile(await response.json() as Profile);
        else if (response.status !== 404)
          setMessage('Signed in, but the character profile could not be loaded. Refresh to retry.');
      }
      setPassword(''); setConfirmPassword('');
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
    try {
      await post<void>('/api/v1/auth/logout');
      actionGate.current.resetSession();
      setSession(null); setProfile(null); setTimeBalance(null);
      setPreview(null); setActivities([]); setHistory([]);
      pendingAction.current = null;
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Logout failed.'); }
    finally { setBusy(false); }
  }

  return <main className="page">
    <header><h1>{GAME_TITLE}</h1><p>{GAME_TAGLINE}</p></header>
    {(profile || guestDemo) ? <GameErrorBoundary onBack={profile ? undefined : () => setGuestDemo(false)}><Suspense fallback={<GameDownloading />}>
      {PLAYTEST_CRASH && <PlaytestCrash />}
      <WorldScene online={profile ? onlineRef : undefined} key={profile?.id ?? 'guest-demo'} characterId={profile?.id ?? 'guest-demo'}
        displayName={profile?.displayName ?? 'Guest explorer'} demoMode={!profile}
        onSchoolEnter={() => schoolSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        activities={activities} timeRemaining={timeBalance?.remaining ?? null} busy={busy}
        canExecuteActivity={cost => !busy && canStartSchoolActivity(timeBalance, cost)}
        onPreviewActivity={id => void previewActivity(id)}
        onExecuteActivity={id => void executeActivity(id)}
        preview={preview} lifeSync={profile ? accountLifeSync : undefined}
        progressSync={profile ? accountProgressSync : undefined} />
    </Suspense></GameErrorBoundary> :
      <GameErrorBoundary><Suspense fallback={<div className="hero hero-placeholder" role="status">Preparing your neighborhood…</div>}><LandingWorld /></Suspense></GameErrorBoundary>}
    {profile && <OnlineRoomPanel key={profile.id} clientRef={onlineRef} />}
    <section className="panel" aria-live="polite">
      {loading ? <p>Loading your account…</p> : guestDemo && !session ? <>
        <h2>Explore the neighborhood</h2>
        <p>This is a free, local 3D preview. Walk to the school, rotate the camera, and customize your avatar. Online two-player rooms, school activities, accounts, and progress saving require a connected server and an invitation.</p>
        <button type="button" onClick={() => setGuestDemo(false)}>Exit demo and sign in</button>
      </> : !session ? <>
        <div className="tabs">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setMessage(''); }}>Sign in</button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setMessage(''); }}>Create account</button>
        </div>
        <button type="button" onClick={() => { setGuestDemo(true); setMessage(''); }}>Try the 3D demo without signing in</button>
        <form onSubmit={authenticate}>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p>{mode === 'login' ? 'Sign in to continue your saved life.' : 'Registration is currently invite-only for adults aged 18 or older. Your date of birth stays private.'}</p>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {mode === 'register' && <>
            <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></label>
            <label>Date of birth<input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} required /></label>
          </>}
          <button disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <p>{mode === 'login' ? 'New here? Choose Create account above. An invitation is required.' : 'Already have an account? Choose Sign in above.'}</p>
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
          <h3 ref={schoolSection}>School activities</h3>
          <p>Preview an outcome or complete an activity to save attribute changes. School time resets at midnight UTC.</p>
          <div className="school-time" aria-live="polite">
            {timeBalance ? <p><strong>{timeBalance.remaining} / {timeBalance.dailyLimit} time units remaining today.</strong> Resets {new Date(timeBalance.resetsAt).toLocaleString()}.</p> :
              <p>{timeError || 'Loading school time…'}</p>}
            <button type="button" disabled={busy} onClick={() => setHistoryVersion(version => version + 1)}>Refresh school time</button>
          </div>
          <div className="activity-list">{activities.map(activity => <article key={activity.id}>
            <h4>{activity.title}</h4><p>{activity.description} · {activity.timeCost} time units</p>
            <button type="button" disabled={busy} onClick={() => void previewActivity(activity.id)}>Preview outcome</button>
            <button type="button" disabled={busy || !canStartSchoolActivity(timeBalance, activity.timeCost)} onClick={() => void executeActivity(activity.id)}>Do activity ({activity.timeCost} time)</button>
          </article>)}</div>
          {preview && <div className="preview" aria-live="polite">
            <h4>Projected outcome</h4>
            {Object.entries(preview.after).map(([name, value]) =>
              <p key={name}>{name}: {preview.before[name]} → {value}</p>)}
            <p>No changes have been saved.</p>
          </div>}
          <h3>Recent decisions</h3>
          <p>Your last 20 completed school activities, saved across sessions.</p>
          {historyLoading && <p>Loading activity history…</p>}
          {historyError && <p className="error" role="alert">{historyError}</p>}
          {!historyLoading && !historyError && history.length === 0 && <p>No completed activities yet.</p>}
          <ol className="history-list">
            {history.map(item => <li key={item.correlationId}>
              <strong>{activities.find(activity => activity.id === item.activityId)?.title ?? item.activityId}</strong>
              <time dateTime={item.completedAt}>{new Date(item.completedAt).toLocaleString()}</time>
              <span>{item.timeCost} time units spent</span>
              <ul>{Object.entries(item.after)
                .filter(([name, value]) => item.before[name] !== value)
                .map(([name, value]) => <li key={name}>{name}: {item.before[name]} → {value}</li>)}</ul>
              {Object.entries(item.after).every(([name, value]) => item.before[name] === value) &&
                <small>No attribute change (already at limit).</small>}
            </li>)}
          </ol>
        </>}
      </>}
      {message && <p className="error" role="alert">{message}</p>}
    </section>
    <SiteFooter />
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
