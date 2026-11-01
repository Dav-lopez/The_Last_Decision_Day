import { useEffect, useState } from 'react';
import { programAt, stationById, tuneInStep, type RadioProgram } from './radio.mjs';
import './radio.css';

/** The car radio display: station, what's on, and dial buttons (R / Shift+R on a keyboard). */
/** Drawn over the 3D view on larger screens ("overlay") and in the touch-controls panel on phones ("panel"), so it never covers the view's HUD. */
export function RadioHud({ station, onTune, onFocusWorld, placement = 'overlay' }: { placement?: 'overlay' | 'panel'; station: string | null; onTune: (dir: 1 | -1) => void; onFocusWorld?: () => void }) {
  const info = stationById(station);
  const [now, setNow] = useState<RadioProgram | null>(() => info ? programAt(info.id, tuneInStep(info.id, Date.now())) : null);
  useEffect(() => {
    if (!info) { setNow(null); return; }
    const tick = () => setNow(programAt(info.id, tuneInStep(info.id, Date.now())));
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [info?.id]);
  // A tap returns focus to the game so driving keys keep working; keyboard users keep focus on the dial.
  const tune = (dir: 1 | -1, detail: number) => { onTune(dir); if (detail > 0) onFocusWorld?.(); };
  const label = now?.kind === 'song' ? `${now.title} · ${now.artist}` : now?.kind === 'ident' ? `“${now.line}”` : '';
  return <div className={`world-radio world-radio-${placement}${info ? '' : ' is-off'}`} aria-label="Car radio">
    <button type="button" aria-label="Previous station" title="Previous station (Shift+R)" onClick={event => tune(-1, event.detail)}>‹</button>
    <div className="world-radio-display" aria-live="polite">
      <strong>{info ? info.name : 'Radio off'}</strong>
      <span className="world-radio-now">{info ? <>{now?.kind === 'ident' ? '' : '♪ '}{label}</> : 'R to switch on'}</span>
    </div>
    <button type="button" aria-label="Next station" title="Next station (R)" onClick={event => tune(1, event.detail)}>›</button>
  </div>;
}
