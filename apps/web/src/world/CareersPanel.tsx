import { CAREERS, rankOf, type CareerId, type CareerState } from './careers.mjs';
import { RANGE_DRILLS, gradeFor } from './trainingRange.mjs';
import { TASKS } from './careerTasks.mjs';

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`;

/** Jobs board and your career: rank, progress to promotion, savings, uniform. */
export function CareersPanel({ career, onWearUniform, onQuit }: { career: CareerState; onWearUniform: () => void; onQuit: () => void }) {
  const job = career.career ? CAREERS[career.career] : null;
  const rank = rankOf(career);
  return <section className="world-customize careers" aria-label="Careers">
    <h3>Career</h3>
    {job && rank ? <>
      <p><strong>{rank.title}</strong> · {job.title} · {career.shifts} shift{career.shifts === 1 ? '' : 's'} worked · savings ${career.money}</p>
      <p>{rank.nextTitle ? `${rank.shiftsToNext} more shift${rank.shiftsToNext === 1 ? '' : 's'} to ${rank.nextTitle}.` : 'Top rank reached.'} Work shifts at the {job.workplace} downtown ({clock(job.hours[0])}–{clock(job.hours[1])}): take the bus from Maple Street and press E at the sign. Each shift is a {TASKS[job.id].title.toLowerCase()}: {TASKS[job.id].brief} Beat par time for a bonus.</p>
      <p>{RANGE_DRILLS[job.id].title}: {(() => {
        const best = career.training?.best[job.id];
        return best ? `best ${Math.round(best * 100)}% (${gradeFor(best, 1).title}).` : 'not taken yet.';
      })()} Press T at the {job.workplace} sign to train at the {RANGE_DRILLS[job.id].place.toLowerCase()}.</p>
      <div className="wardrobe-options">
        <button type="button" className="wardrobe-option" onClick={onWearUniform}>Wear uniform</button>
        <button type="button" className="wardrobe-option" onClick={onQuit}>Quit job</button>
      </div>
    </> : <p>No job yet{career.money ? ` · savings $${career.money}` : ''}. Apply in person downtown: press E at the workplace sign.</p>}
    <div className="wardrobe-panel">
      {(Object.keys(CAREERS) as CareerId[]).map(id => {
        const c = CAREERS[id];
        return <fieldset key={id}>
          <legend>{c.title}{career.career === id ? ' · your job' : ''}</legend>
          <p style={{ margin: 0 }}>{c.workplace} · {c.ranks[0]} → {c.ranks[c.ranks.length - 1]} · ${c.pay[0]}–${c.pay[c.pay.length - 1]} a shift</p>
        </fieldset>;
      })}
    </div>
  </section>;
}
