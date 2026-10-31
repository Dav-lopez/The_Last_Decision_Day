import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CHAPTERS, DECISIONS, currentStep, storyComplete, type StoryState } from './storyChapters.mjs';
import { GRAPHICS_MODES, type GraphicsMode } from './gameSettings.mjs';
import './gameMenu.css';

export type MenuTab = 'controls' | 'settings' | 'story' | 'credits';

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['W A S D / arrow keys', 'Walk (the camera decides which way is forward)'],
  ['Shift', 'Run (or switch RUN on below the game)'],
  ['Space', 'Jump'],
  ['Drag · scroll · pinch', 'Orbit and zoom the camera'],
  ['E', 'Interact: doors, desks, bed, stove, cars, signs, talk to people'],
  ['1 – 3', 'Pick an answer in a conversation'],
  ['N', 'Map and quick travel'],
  ['W / S · A / D', 'In a car: accelerate, brake, reverse · steer'],
  ['H', 'Police siren and lights (police officers, in a car)'],
  ['F', 'Kick the ball (Shift + F chips it)'],
  ['M', 'Start a five-a-side match on the pitch'],
  ['Q', 'Pass to a teammate in a match'],
  ['T', 'Training range at your workplace'],
  ['G', 'Dance'],
  ['C', 'Change the camera'],
  ['Esc', 'Open or close this menu, or close a panel'],
];

type Props = {
  open: boolean;
  tab: MenuTab;
  setTab: (tab: MenuTab) => void;
  onClose: () => void;
  story: StoryState;
  graphics: GraphicsMode;
  setGraphics: (mode: GraphicsMode) => void;
  onReset: () => void;
  /** The sound settings (kept mounted so audio keeps working while the menu is closed). */
  audio: ReactNode;
};

/** The in-game menu: pauses the world while open. */
export function GameMenu({ open, tab, setTab, onClose, story, graphics, setGraphics, onReset, audio }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const resumeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (open) resumeRef.current?.focus(); else setConfirmReset(false); }, [open]);
  const { chapter, step } = currentStep(story);
  const done = storyComplete(story);
  const chapterIndex = CHAPTERS.indexOf(chapter);
  const decision = story.decision ? Object.values(DECISIONS).find(d => d.id === story.decision) : null;
  const tabs: ReadonlyArray<readonly [MenuTab, string]> = [['controls', 'Controls'], ['settings', 'Settings'], ['story', 'Story'], ['credits', 'Credits']];
  return <div className="game-menu-backdrop" hidden={!open} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="game-menu" role="dialog" aria-modal="true" aria-label="Game menu">
      <header className="game-menu-head">
        <div><p className="game-menu-kicker">Paused</p><h2>The Last Decision Day</h2></div>
        <button ref={resumeRef} type="button" className="game-menu-resume" onClick={onClose}>Resume (Esc)</button>
      </header>
      <nav className="game-menu-tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="game-menu-body">
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
