import { useEffect, useRef, useState } from 'react';
import {
  aimSway, fire, gradeFor, maxScore, rangeSchedule, reload, startSession, stepSession,
  type Grade, type RangeDrill, type RangeSession, type RangeTarget,
} from './trainingRange.mjs';
import type { AudioCue } from './audio/director.mjs';
import { drawRange, type Splash } from './rangeDraw';
import './trainingRange.css';
import { trapTab } from './dialogFocus';

export type RangeOutcome = { grade: Grade; pay: number; practice: boolean; personalBest: boolean } | null;

type Props = {
  drill: RangeDrill;
  energy: number;
  /** Record a finished attempt (time, energy, reward); returns what was earned. */
  onFinish: (score: number) => RangeOutcome;
  /** Whether another attempt is allowed right now (energy, hours). */
  canRetry: () => boolean;
  onLeave: () => void;
  cue: (name: AudioCue) => void;
};


/**
 * First-person qualification range. Pointer aims (the reticle wanders with
 * your breathing; hold Shift or the button to steady it), click / Space
 * fires, R reloads or refills, Esc stops. Targets are bullseyes, steel
 * plates or flame boards only.
 */
export function TrainingRange({ drill, energy, onFinish, canRetry, onLeave, cue }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<'brief' | 'live' | 'done'>('brief');
  const [attempt, setAttempt] = useState(1);
  const [summary, setSummary] = useState<{ score: number; shots: number; scored: number; outcome: RangeOutcome } | null>(null);
  const live = useRef({ session: null as RangeSession | null, schedule: [] as readonly RangeTarget[], pointer: { x: 0.5, y: 0.45 }, breath: false, firing: false, splashes: [] as Splash[], flash: 0 });
  const callbacks = useRef({ onFinish, cue, energy });
  callbacks.current = { onFinish, cue, energy };

  useEffect(() => {
    if (phase !== 'live') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const seed = (attempt * 7919 + drill.id.length * 31) >>> 0;
    const state = live.current;
    state.schedule = rangeSchedule(drill, seed);
    state.session = startSession(drill, seed);
    state.splashes = [];
    let raf = 0;
    let last = performance.now();
    let finished = false;

    const size = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      return { w: canvas.width, h: canvas.height };
    };
    // Shared projection: angles (radians, +y down) to canvas pixels.
    const view = () => {
      const { w, h } = size();
      const focal = h * 1.15 * drill.zoom;
      return { w, h, focal, cx: w / 2, cy: h * 0.45 };
    };
    const aimAngles = (v: ReturnType<typeof view>) => {
      const s = state.session!;
      const sway = aimSway(drill, s.time, { steady: Boolean(s.breath.steady), gasping: s.breath.gasping, energy: callbacks.current.energy });
      return { x: (state.pointer.x * v.w - v.cx) / v.focal + sway.x, y: (state.pointer.y * v.h - v.cy) / v.focal + sway.y - s.recoil };
    };

    const shoot = () => {
      const s = state.session;
      if (!s || s.done) return;
      const v = view();
      const aim = aimAngles(v);
      const result = fire(drill, s, state.schedule, aim);
      if (!result.shot) {
        if (result.session.reloading > 0 && s.reloading === 0) callbacks.current.cue('reload');
        state.session = result.session;
        return;
      }
      state.session = result.session;
      state.flash = 1;
      callbacks.current.cue(drill.cue);
      if (result.shot.ring && drill.theme === 'steel') window.setTimeout(() => callbacks.current.cue('ding'), 90);
      state.splashes.push({ x: aim.x, y: aim.y, age: 0, ring: result.shot.ring, targetId: result.shot.targetId });
      if (result.session.reloading > 0) callbacks.current.cue('reload');
    };

    const onKey = (event: KeyboardEvent, down: boolean) => {
      if (event.key === 'Shift') { state.breath = down; return; }
      if (!down || event.repeat) return;
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); shoot(); }
      else if (event.key === 'r' || event.key === 'R') {
        const before = state.session!;
        state.session = reload(drill, before);
        if (state.session !== before) callbacks.current.cue('reload');
      }
    };
    const keyDown = (event: KeyboardEvent) => onKey(event, true);
    const keyUp = (event: KeyboardEvent) => onKey(event, false);
    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      state.pointer = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    };
    const press = (event: PointerEvent) => {
      if (event.button !== 0) return;
      move(event);
      shoot();
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', press);

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      state.session = stepSession(drill, state.session!, dt, state.breath);
      state.flash = Math.max(0, state.flash - dt * 9);
      for (const splash of state.splashes) splash.age += dt;
      state.splashes = state.splashes.filter(splash => splash.age < 0.6);
      drawRange(ctx, view(), drill, state.session, state.schedule, aimAngles(view()), state.splashes, state.flash, state.breath);
      if (state.session.done && !finished) {
        finished = true;
        const s = state.session;
        const outcome = callbacks.current.onFinish(s.score);
        callbacks.current.cue(outcome && outcome.grade.bonus > 0 ? 'achievement' : 'notice');
        setSummary({ score: s.score, shots: s.shots, scored: s.scored, outcome });
        setPhase('done');
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', press);
    };
  }, [phase, attempt, drill]);

  // Escape always leaves; an unfinished attempt costs nothing.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onLeave(); } };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [onLeave]);

  const max = maxScore(drill);
  const grade = summary ? (summary.outcome?.grade ?? gradeFor(summary.score, max)) : null;
  return <div ref={dialogRef} className={`training-range training-range-${drill.theme}`} role="dialog" aria-modal="true" aria-label={`${drill.title} at the ${drill.place}`}
    onKeyDown={event => trapTab(event, dialogRef.current)}>
    <canvas ref={canvasRef} className="training-range-canvas" aria-hidden="true" />
    {phase === 'live' && <div className="training-range-touch">
      <button type="button" onPointerDown={() => { live.current.breath = true; }} onPointerUp={() => { live.current.breath = false; }}
        onPointerLeave={() => { live.current.breath = false; }}>Hold breath</button>
      <button type="button" onClick={() => {
        const s = live.current.session;
        if (s) { const next = reload(drill, s); if (next !== s) cue('reload'); live.current.session = next; }
      }}>{drill.reloadWord} (R)</button>
      <button type="button" onClick={onLeave}>Stop (Esc)</button>
    </div>}
    {phase === 'brief' && <div className="training-range-card">
      <p className="training-range-kicker">{drill.place}</p>
      <h2>{drill.title}</h2>
      <p>{drill.brief}</p>
      <ul>
        <li><strong>{drill.tool}</strong> · {drill.rounds} {drill.theme === 'flame' ? 'bursts' : 'rounds'} · {drill.seconds} seconds</li>
        <li>Aim with the mouse or your finger. Click, tap or press Space to {drill.theme === 'flame' ? 'spray' : 'fire'}.</li>
        <li>The aim drifts with your breathing. Hold <kbd>Shift</kbd> to steady it for a few seconds.</li>
        <li><kbd>R</kbd> to {drill.reloadWord.toLowerCase()}. Being tired makes the aim shakier.</li>
        <li>Grades: Marksman 55% · Sharpshooter 70% · Expert 85%.</li>
      </ul>
      <p className="training-range-safety">{drill.theme === 'flame' ? 'Helmet on, gloves on. Drill yard is live.' : 'Eyes and ears on. The range is closed and supervised; targets only.'}</p>
      <div className="training-range-actions">
        <button type="button" className="primary" autoFocus onClick={() => setPhase('live')}>Start</button>
        <button type="button" onClick={onLeave}>Not now</button>
      </div>
    </div>}
    {phase === 'done' && summary && grade && <div className="training-range-card" role="status">
      <p className="training-range-kicker">{drill.title} · attempt {attempt}</p>
      <h2>{grade.title}</h2>
      <p className="training-range-score"><strong>{summary.score}</strong> / {max} · {summary.scored} hits from {summary.shots} {drill.theme === 'flame' ? 'bursts' : 'shots'}
        {summary.shots ? ` · ${Math.round(summary.scored / summary.shots * 100)}% on target` : ''}</p>
      {summary.outcome && <p>
        {summary.outcome.pay > 0 ? `Qualification bonus: +$${summary.outcome.pay}.` : summary.outcome.practice ? 'Practice round: the bonus is paid again after a three-hour break.' : 'Keep practising to qualify.'}
        {summary.outcome.personalBest ? ' New personal best!' : ''}
      </p>}
      <div className="training-range-actions">
        <button type="button" className="primary" autoFocus onClick={onLeave}>Leave the range</button>
        {canRetry() && <button type="button" onClick={() => { setSummary(null); setAttempt(a => a + 1); setPhase('live'); }}>Go again</button>}
      </div>
    </div>}
  </div>;
}
