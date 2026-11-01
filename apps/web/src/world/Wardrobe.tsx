import { useState, type CSSProperties } from 'react';
import './wardrobe.css';
import { tabListKeys } from './dialogFocus';
import { LOOKS, STYLES, withBody, type ColourPart, type Look, type StylePart } from './appearance.mjs';

type Tab = 'you' | 'top' | 'bottom' | 'shoes';
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'you', label: 'Body & hair' }, { id: 'top', label: 'Tops' }, { id: 'bottom', label: 'Bottoms' }, { id: 'shoes', label: 'Shoes' },
];

/** The wardrobe: body, skin, hairstyles and colours, tops, bottoms and shoes. */
export function Wardrobe({ look, setLook, note }: { look: Look; setLook: (update: (current: Look) => Look) => void; note: string }) {
  const [tab, setTab] = useState<Tab>('you');
  const set = (part: keyof Look, id: string) => setLook(current => part === 'body' ? withBody(current, id) : { ...current, [part]: id });

  const styles = (part: StylePart, legend: string, hide: (id: string) => boolean = () => false) =>
    <fieldset key={part}>
      <legend>{legend}</legend>
      <div className="wardrobe-options">
        {STYLES[part].filter(choice => !hide(choice.id)).map(choice =>
          <button key={choice.id} type="button" className="wardrobe-option" aria-pressed={look[part] === choice.id}
            onClick={() => set(part, choice.id)}>{choice.label}</button>)}
      </div>
    </fieldset>;
  const colours = (part: ColourPart, legend: string) =>
    <fieldset key={part}>
      <legend>{legend}</legend>
      <div className="world-swatch-list wardrobe-swatches">
        {LOOKS[part].map(choice =>
          <button key={choice.id} type="button" className="world-swatch wardrobe-swatch"
            aria-label={`${choice.label} ${legend.toLowerCase()}`} aria-pressed={look[part] === choice.id} title={choice.label}
            style={{ '--swatch': choice.hex } as CSSProperties}
            onClick={() => set(part, choice.id)}>
            <span className="world-swatch-dot" aria-hidden="true" />
          </button>)}
      </div>
    </fieldset>;

  return <section className="world-customize wardrobe" aria-label="Customize character appearance">
    <h3>Wardrobe</h3>
    <div className="wardrobe-tabs" role="tablist" aria-label="Wardrobe sections" onKeyDown={event => tabListKeys(event)}>
      {TABS.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id}
        id={`wardrobe-tab-${item.id}`} aria-controls="wardrobe-panel" tabIndex={tab === item.id ? 0 : -1}
        className="wardrobe-tab" onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>
    <div className="wardrobe-panel" role="tabpanel" id="wardrobe-panel" aria-labelledby={`wardrobe-tab-${tab}`}>
      {tab === 'you' && <>
        {styles('body', 'Body')}
        {colours('skin', 'Skin tone')}
        {styles('hairStyle', 'Hairstyle')}
        {colours('hair', 'Hair colour')}
        {styles('facialHair', 'Facial hair', id => id === 'beard' && look.body === 'female')}
      </>}
      {tab === 'top' && <>{styles('top', 'Style')}{colours('outfit', 'Colour')}</>}
      {tab === 'bottom' && <>{styles('bottom', 'Style')}{colours('bottomColor', 'Colour')}</>}
      {tab === 'shoes' && <>{styles('shoes', 'Style')}{colours('shoeColor', 'Colour')}</>}
    </div>
    <p>{note}</p>
  </section>;
}
