import { Component, type ErrorInfo, type ReactNode } from 'react';
import { PRIVACY_POINTS, RELEASE_NOTES, describeCrash, type ReleaseNote } from './releaseInfo.mjs';

/** The "What's new" list. Notes newer than the player's last visit get a "New" tag. */
export function WhatsNew({ fresh, limit }: { fresh?: ReadonlySet<string>; limit?: number }) {
  const notes: readonly ReleaseNote[] = limit ? RELEASE_NOTES.slice(0, limit) : RELEASE_NOTES;
  return <div className="whats-new">
    {notes.map(note => <section key={note.id} aria-labelledby={`whats-new-${note.id}`}>
      <h3 id={`whats-new-${note.id}`}>{note.title}{fresh?.has(note.id) && <span className="whats-new-tag">New</span>}</h3>
      <ul>{note.items.map(item => <li key={item}>{item}</li>)}</ul>
    </section>)}
  </div>;
}

/** What the game keeps and where, in plain words (the same text on the start page and in the menu). */
export function PrivacyNote() {
  return <ul className="privacy-note">{PRIVACY_POINTS.map(point => <li key={point}>{point}</li>)}</ul>;
}

/** Full-page error screen with a reload button: shown instead of a blank page when the game crashes. */
export function ErrorScreen({ error, onBack }: { error: unknown; onBack?: () => void }) {
  const crash = describeCrash(error);
  return <div className="error-screen" role="alert" aria-labelledby="error-screen-title">
    <h2 id="error-screen-title">{crash.title}</h2>
    <p>{crash.body}</p>
    {crash.detail && <p className="error-screen-detail"><small>Details: {crash.detail}</small></p>}
    <div className="error-screen-actions">
      <button type="button" autoFocus onClick={() => window.location.reload()}>Reload the game</button>
      {onBack && <button type="button" className="secondary" onClick={onBack}>Back to the start page</button>}
    </div>
  </div>;
}

type BoundaryProps = { children: ReactNode; onBack?: () => void };

/** Catches a crash anywhere in the game (including a failed download of its code) and shows the error screen. */
export class GameErrorBoundary extends Component<BoundaryProps, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };
  static getDerivedStateFromError(error: unknown) { return { error, failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Kept as a warning, not an error: the player sees the error screen, and the log helps a bug report.
    console.warn('The game stopped:', error, info.componentStack?.split('\n').slice(0, 4).join('\n'));
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const back = this.props.onBack;
    return <ErrorScreen error={this.state.error} onBack={back ? () => { this.setState({ error: null, failed: false }); back(); } : undefined} />;
  }
}

/** Playtest only (`?playtest&crash`): throws while rendering, so the error screen can be checked. */
export function PlaytestCrash(): null {
  throw new Error('Playtest crash: checking the error screen');
}
