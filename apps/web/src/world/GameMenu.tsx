import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CHAPTERS, DECISIONS, currentStep, storyComplete, type StoryState } from './storyChapters.mjs';
import { GRAPHICS_MODES, MOTION_MODES, TEXT_SIZES, type GraphicsMode, type PlayerSettings } from './gameSettings.mjs';
import './gameMenu.css';

export type MenuTab = 'controls' | 'settings' | 'story' | 'credits';

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['W A S D / arrow keys', 'Walk (the camera decides which way is forward)'],
  ['Shift', 'Run (or switch RUN on below the game)'],
  ['Space', 'Jump (on foot)'],
  ['Drag · scroll · pinch', 'Orbit and zoom the camera'],
  ['E', 'Interact: doors, desks, bed, stove, cars, signs, talk to people'],
  ['1 – 3 · ↑ ↓ and Enter', 'Pick an answer in a conversation'],
  ['N', 'Map and quick travel'],
  ['W / S · A / D', 'In a car: accelerate, brake, reverse · steer'],
  ['Space · H', 'In a car: handbrake (slide round corners) · horn'],
  ['L', 'Police siren and lights (police officers, in a car)'],
  ['F', 'Kick the ball (Shift + F chips it)'],
  ['M', 'Start a five-a-side match on the pitch'],
  ['Q', 'Pass to a teammate in a match'],
  ['T', 'Training range at your workplace'],
  ['G', 'Dance'],
  ['C', 'Change the camera'],
  ['Esc', 'Open or close this menu, or close a panel'],
  ['Tab · Shift + Tab', 'Move between buttons in menus and panels; ← → switch menu tabs'],
];

type Props = {
  open: boolean;
  tab: MenuTab;
  setTab: (tab: MenuTab) => void;
  onClose: () => void;
  story: StoryState;
  graphics: GraphicsMode;
  setGraphics: (mode: GraphicsMode) => void;
  /** Accessibility options: motion, captions for sounds, text size. */
  access: Pick<PlayerSettings, 'motion' | 'captions' | 'textSize'>;
  setAccess: (next: Partial<Pick<PlayerSettings, 'motion' | 'captions' | 'textSize'>>) => void;
  onReset: () => void;
  /** The sound settings (kept mounted so audio keeps working while the menu is closed). */
  audio: ReactNode;
};

/** The in-game menu: pauses the world while open. */
const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function GameMenu({ open, tab, setTab, onClose, story, graphics, setGraphics, access, setAccess, onReset, audio }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const resumeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef(new Map<MenuTab, HTMLButtonElement>());
  useEffect(() => { if (open) resumeRef.current?.focus(); else setConfirmReset(false); }, [open]);
  // Keyboard: Tab stays inside the menu while it is open.
  const trapFocus = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const { chapter, step } = currentStep(story);
  const done = storyComplete(story);
  const chapterIndex = CHAPTERS.indexOf(chapter);
  const decision = story.decision ? Object.values(DECISIONS).find(d => d.id === story.decision) : null;
  const tabs: ReadonlyArray<readonly [MenuTab, string]> = [['controls', 'Controls'], ['settings', 'Settings'], ['story', 'Story'], ['credits', 'Credits']];
  // Arrow keys, Home and End move between tabs (the usual tab-list pattern).
  const tabKeys = (event: KeyboardEvent, index: number) => {
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const id = tabs[(next + tabs.length) % tabs.length][0];
    setTab(id);
    tabRefs.current.get(id)?.focus();
  };
  return <div className="game-menu-backdrop" hidden={!open} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="game-menu" role="dialog" aria-modal="true" aria-label="Game menu" onKeyDown={trapFocus}>
      <header className="game-menu-head">
        <div><p className="game-menu-kicker">Paused</p><h2>The Last Decision Day</h2></div>
        <button ref={resumeRef} type="button" className="game-menu-resume" onClick={onClose}>Resume (Esc)</button>
      </header>
      <nav className="game-menu-tabs" role="tablist" aria-label="Menu sections">
        {tabs.map(([id, label], index) => <button key={id} ref={el => { if (el) tabRefs.current.set(id, el); else tabRefs.current.delete(id); }}
          type="button" role="tab" id={`game-menu-tab-${id}`} aria-selected={tab === id} aria-controls="game-menu-panel" tabIndex={tab === id ? 0 : -1}
          onClick={() => setTab(id)} onKeyDown={event => tabKeys(event, index)}>{label}</button>)}
      </nav>
      <div className="game-menu-body" id="game-menu-panel" role="tabpanel" aria-labelledby={`game-menu-tab-${tab}`}>
        {tab === 'controls' && <>
          <table className="game-menu-keys"><tbody>
            {CONTROLS.map(([keys, action]) => <tr key={keys}><th scope="row"><kbd>{keys}</kbd></th><td>{action}</td></tr>)}
          </tbody></table>
          <p className="game-menu-note">On a touch screen: use the arrow pad and RUN button below the game, drag to look around, and tap the
            on-screen action buttons (talk, get in, start a match, training) when they appear.</p>
        </>}
        <div hidden={tab !== 'settings'}>
          <h3>Graphics</h3>
          <div className="game-menu-choice" role="radiogroup" aria-label="Graphics quality">
            {GRAPHICS_MODES.map(mode => <label key={mode.id}>
              <input type="radio" name="graphics" value={mode.id} checked={graphics === mode.id} onChange={() => setGraphics(mode.id)} />
              <span><strong>{mode.title}</strong> · {mode.description}</span>
            </label>)}
          </div>
          <h3>Accessibility</h3>
          <div className="game-menu-choice" role="radiogroup" aria-label="Motion">
            {MOTION_MODES.map(mode => <label key={mode.id}>
              <input type="radio" name="motion" value={mode.id} checked={access.motion === mode.id} onChange={() => setAccess({ motion: mode.id })} />
              <span><strong>Motion: {mode.title}</strong> · {mode.description}</span>
            </label>)}
          </div>
          <div className="game-menu-choice game-menu-toggles">
            <label><input type="checkbox" name="captions" checked={access.captions} onChange={event => setAccess({ captions: event.target.checked })} />
              <span><strong>Sound captions</strong> · describe sounds in text: the school bell, messages, doors, the referee's whistle</span></label>
            <label><input type="checkbox" name="large-text" checked={access.textSize === TEXT_SIZES[1].id}
              onChange={event => setAccess({ textSize: event.target.checked ? TEXT_SIZES[1].id : TEXT_SIZES[0].id })} />
              <span><strong>Large text</strong> · bigger menus, captions and on-screen labels</span></label>
          </div>
          {audio}
          <h3>Progress</h3>
          <p className="game-menu-note">Starts the story, career, relationships and clock again for this character. Your look stays.</p>
          {confirmReset
            ? <div className="game-menu-row"><button type="button" className="danger" onClick={onReset}>Yes, start over</button>
              <button type="button" onClick={() => setConfirmReset(false)}>Keep my progress</button></div>
            : <button type="button" onClick={() => setConfirmReset(true)}>Reset progress…</button>}
        </div>
        {tab === 'story' && <>
          <p className="game-menu-kicker">{chapter.title}</p>
          <h3>{done ? 'Story complete' : step.objective}</h3>
          {decision && <p>Your last decision: <strong>{decision.title}</strong>.</p>}
          <ol className="game-menu-chapters">
            {CHAPTERS.map((c, i) => <li key={c.id} className={i < chapterIndex || done ? 'done' : i === chapterIndex ? 'current' : ''}>
              {c.title}{i < chapterIndex || done ? ' ✓' : i === chapterIndex ? ' · now' : ''}
            </li>)}
          </ol>
        </>}
        {tab === 'credits' && <div className="game-menu-credits">
          <p>An original game. Built with <a href="https://www.babylonjs.com" target="_blank" rel="noreferrer">Babylon.js</a> (Apache 2.0)
            and <a href="https://react.dev" target="_blank" rel="noreferrer">React</a> (MIT).</p>
          <ul>
            <li>Characters and animations: <a href="https://quaternius.com" target="_blank" rel="noreferrer">Quaternius</a>, Universal Base Characters and Universal Animation Library (CC0).</li>
            <li>Furniture and props: <a href="https://polyhaven.com" target="_blank" rel="noreferrer">Poly Haven</a> artists, including Rico Cilliers and Kirill Sannikov (CC0).</li>
            <li>Downtown map data: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, available under the ODbL.</li>
            <li>Houses, trees, cars, music and sound: original to this game (CC0).</li>
          </ul>
          <p className="game-menu-note">Boulder is a real place; every resident, business and event in the game is fictional.</p>
        </div>}
      </div>
    </section>
  </div>;
}
