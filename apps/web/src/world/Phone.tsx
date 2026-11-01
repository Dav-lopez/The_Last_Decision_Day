import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PHONE_APPS, arrivedLabel, careerSummary, contacts, threads, type PhoneAppId, type PhoneMessage, type PhoneState } from './phone.mjs';
import type { NpcRelations } from './npcConversations.mjs';
import type { CareerState } from './careers.mjs';
import './phone.css';

type Props = {
  open: boolean;
  onClose: () => void;
  phone: PhoneState;
  messages: ReadonlyArray<PhoneMessage>;
  onRead: (ids: string[]) => void;
  relations: NpcRelations;
  career: CareerState;
  clock: string;
  day: number;
  energy: number;
  objective: string;
  onOpenMap: () => void;
};

const FOCUSABLE = 'button:not([disabled]),[tabindex]:not([tabindex="-1"])';
const initial = (name: string) => name.replace(/^(Mr\.|Ms\.|Coach|Captain)\s+/, '').charAt(0).toUpperCase();

/** The in-game phone (P): messages, contacts, career and a shortcut to the map. The world keeps running. */
export function Phone({ open, onClose, phone, messages, onRead, relations, career, clock, day, energy, objective, onOpenMap }: Props) {
  const [app, setApp] = useState<PhoneAppId>('messages');
  const [thread, setThread] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<PhoneAppId, HTMLButtonElement>());
  useEffect(() => {
    if (!open) { setThread(null); return; }
    tabRefs.current.get(app)?.focus({ preventScroll: true });
    // Only when the phone opens; switching apps moves focus itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const list = threads(phone, messages);
  const current = thread ? list.find(t => t.from === thread) ?? null : null;
  // A conversation opens at its newest message, like a real phone.
  const threadLength = current?.messages.length ?? 0;
  useEffect(() => {
    const screen = screenRef.current;
    if (screen) screen.scrollTop = thread ? screen.scrollHeight : 0;
  }, [thread, threadLength, app]);
  // Reading a thread marks it read (also when a new text lands while it is open).
  useEffect(() => {
    if (open && current?.unread) onRead(current.messages.filter(m => m.unread).map(m => m.id));
  }, [open, current, onRead]);
  if (!open) return null;
  const unread = list.reduce((sum, t) => sum + t.unread, 0);
  const people = contacts(relations);
  const job = careerSummary(career);
  const trap = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !rootRef.current) return;
    const items = Array.from(rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const tabKeys = (event: KeyboardEvent, index: number) => {
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? PHONE_APPS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const id = PHONE_APPS[(next + PHONE_APPS.length) % PHONE_APPS.length].id;
    setApp(id); setThread(null);
    tabRefs.current.get(id)?.focus();
  };
  return <section ref={rootRef} className="world-phone" role="dialog" aria-label="Phone" onKeyDown={trap}>
    <header className="world-phone-status" aria-label={`Day ${day}, ${clock}, energy ${Math.round(energy)} percent`}>
      <span>{clock}</span><span>Day {day}</span>
      <span className="world-phone-battery" aria-hidden="true"><span style={{ width: `${Math.max(4, Math.round(energy))}%` }} /></span>
    </header>
    <p className="world-phone-objective"><small>Objective</small>{objective}</p>
    <div className="world-phone-tabs" role="tablist" aria-label="Phone apps">
      {PHONE_APPS.map((item, index) => <button key={item.id} type="button" role="tab" id={`phone-tab-${item.id}`}
        aria-selected={app === item.id} aria-controls="phone-app" tabIndex={app === item.id ? 0 : -1}
        ref={el => { if (el) tabRefs.current.set(item.id, el); else tabRefs.current.delete(item.id); }}
        onKeyDown={event => tabKeys(event, index)}
        onClick={() => { setApp(item.id); setThread(null); }}>
        {item.title}{item.id === 'messages' && unread > 0 && <span className="world-phone-badge" aria-label={`${unread} unread`}>{unread}</span>}
      </button>)}
    </div>
    <div ref={screenRef} className="world-phone-screen" id="phone-app" role="tabpanel" aria-labelledby={`phone-tab-${app}`}>
      {app === 'messages' && !current && (list.length ? <ul className="world-phone-list">
        {list.map(t => <li key={t.from}>
          <button type="button" className="world-phone-row" data-unread={t.unread > 0 ? 'true' : undefined} onClick={() => setThread(t.from)}
            aria-label={`${t.name}${t.unread ? `, ${t.unread} unread` : ''}: ${t.latest.text}`}>
            <span className="world-phone-avatar" data-from={t.from} aria-hidden="true">{initial(t.name)}</span>
            <span className="world-phone-row-text"><strong>{t.name}</strong><span>{t.latest.text}</span></span>
            <small>{arrivedLabel(t.latest.at, day)}{t.unread > 0 && <span className="world-phone-dot" aria-hidden="true" />}</small>
          </button>
        </li>)}
      </ul> : <p className="world-phone-empty">No messages yet.</p>)}
      {app === 'messages' && current && <div className="world-phone-thread">
        <div className="world-phone-thread-head">
          <button type="button" onClick={() => setThread(null)} aria-label="Back to all messages">‹ Back</button>
          <strong>{current.name}</strong>
        </div>
        <ol aria-label={`Messages from ${current.name}`}>
          {current.messages.map(m => <li key={m.id}><p>{m.text}</p><small>{arrivedLabel(m.at, day)}</small></li>)}
        </ol>
      </div>}
      {app === 'contacts' && <ul className="world-phone-list" aria-label="Contacts">
        {people.map(person => <li key={person.id} className="world-phone-contact">
          <span className="world-phone-avatar" data-from={person.id} aria-hidden="true">{initial(person.name)}</span>
          <span className="world-phone-row-text"><strong>{person.name}</strong><span>{person.label} · {person.where}</span></span>
          {person.id !== 'mom' && <span className="world-phone-trust" aria-label={`Trust ${person.trust} of 5`}>
            {Array.from({ length: 5 }, (_, i) => <i key={i} data-on={person.trust > i ? 'true' : undefined} />)}</span>}
        </li>)}
        {people.length === 1 && <li className="world-phone-empty">Talk to people (E) to add them here.</li>}
      </ul>}
      {app === 'career' && <div className="world-phone-career">
        <strong>{job.title}</strong>
        <ul>{job.lines.map(line => <li key={line}>{line}</li>)}</ul>
      </div>}
      {app === 'map' && <div className="world-phone-career">
        <p>See Maple Street and downtown, set a GPS waypoint, or call a taxi.</p>
        <button type="button" className="world-phone-wide" onClick={onOpenMap}>Open the map (N)</button>
      </div>}
    </div>
    <footer className="world-phone-foot">
      <button type="button" onClick={onClose}>Put away (P)</button>
    </footer>
  </section>;
}
