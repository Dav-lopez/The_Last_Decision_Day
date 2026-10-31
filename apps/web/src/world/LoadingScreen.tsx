import { useEffect, useRef, useState } from 'react';
import { easeProgress, tipAt, type LoadingSnapshot, type LoadingTracker } from './loadingProgress.mjs';

type View = { snapshot: LoadingSnapshot; shown: number; leaving: boolean; gone: boolean };

const FADE_MS = 450;

/**
 * Covers the world while Maple Street, your character and the neighbours download,
 * then fades out. Downtown keeps loading afterwards and shows as a small chip.
 * Polls the tracker ten times a second so the 3D scene itself never re-renders for it.
 */
export default function LoadingScreen({ tracker, onReady }: { tracker: LoadingTracker; onReady?: () => void }) {
  const [view, setView] = useState<View>(() => ({ snapshot: tracker.snapshot(performance.now()), shown: 0, leaving: false, gone: false }));
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const doneRef = useRef(false);

  useEffect(() => {
    let last = performance.now();
    let shown = 0;
    let leaveAt = 0;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const snapshot = tracker.snapshot(now);
      // A skipped or timed-out screen jumps straight to fading out; a finished one fills the bar first.
      shown = snapshot.ready && snapshot.fraction < 1 ? shown : easeProgress(shown, snapshot.fraction, (now - last) / 1000);
      last = now;
      const leaving = snapshot.ready && (shown >= 1 || snapshot.fraction < 1);
      if (leaving && !leaveAt) {
        leaveAt = now;
        if (!doneRef.current) { doneRef.current = true; readyRef.current?.(); }
      }
      const gone = leaveAt > 0 && now - leaveAt >= FADE_MS;
      setView(previous => {
        if (gone && previous.gone && previous.snapshot.background.length === snapshot.background.length
          && Math.round((previous.snapshot.background[0]?.fraction ?? 0) * 20) === Math.round((snapshot.background[0]?.fraction ?? 0) * 20)) return previous;
        return { snapshot, shown, leaving, gone };
      });
      if (gone && snapshot.background.length === 0) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [tracker]);

  const { snapshot, shown, leaving, gone } = view;
  const percent = Math.round(shown * 100);
  const chip = gone && snapshot.background[0];
  return <>
    {!gone && <div className="world-loading" data-leaving={leaving ? 'true' : undefined} role="status" aria-live="polite"
      aria-label={leaving ? 'Ready' : `Loading the world, ${percent} percent`}>
      <div className="world-loading-card">
        <h2>The Last Decision Day</h2>
        <p className="world-loading-step">{leaving ? 'Ready' : `${snapshot.label}…`}</p>
        <div className="world-loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ transform: `scaleX(${shown})` }} />
        </div>
        <ul className="world-loading-tasks" aria-hidden="true">
          {snapshot.tasks.map(task => <li key={task.id} data-state={task.state}>{task.label}</li>)}
        </ul>
        <p className="world-loading-tip">{tipAt(snapshot.elapsed)}</p>
        {snapshot.canSkip && !leaving && <button type="button" onClick={() => tracker.skip()}>Start now · the rest loads as you play</button>}
      </div>
    </div>}
    {chip && <div className="world-loading-chip" role="status">{chip.label} · {Math.round(chip.fraction * 100)}%</div>}
  </>;
}
