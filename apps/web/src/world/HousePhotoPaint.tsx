import './housePaint.css';
import { useRef, useState, type ChangeEvent, type MutableRefObject } from 'react';
import { extractPalette, houseStyleFrom, readHouseStyle, writeHouseStyle, type HouseStyle, type PaletteColour } from './photoPalette.mjs';
import type { HousePainter } from './housePaint';

const SAMPLE = 96;

/** Reads a photo into a small pixel grid, entirely in the browser. */
async function samplePhoto(file: File): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const scale = Math.min(1, SAMPLE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2D canvas');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * "Paint my house from a photo": snap or pick a picture (a house you like, a
 * paint chip, a sunset) and its colours become your house's walls, roof, trim
 * and door, plus the paint inside. The photo never leaves the device.
 */
export function HousePhotoPaint({ characterId, painterRef }: { characterId: string; painterRef: MutableRefObject<HousePainter | null> }) {
  const input = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<HouseStyle | null>(() => readHouseStyle(characterId));
  const [palette, setPalette] = useState<PaletteColour[] | null>(null);
  const [variant, setVariant] = useState(0);
  const [status, setStatus] = useState('');

  const use = (next: HouseStyle | null) => {
    setStyle(next);
    writeHouseStyle(characterId, next);
    painterRef.current?.paint(next);
  };
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus('That file is not a picture.'); return; }
    setStatus('Reading the colours…');
    try {
      const colours = extractPalette(await samplePhoto(file), 6);
      const next = houseStyleFrom(colours, 0);
      if (!next) { setStatus('No colours found in that picture.'); return; }
      setPalette(colours);
      setVariant(0);
      use(next);
      setStatus('Painted! Walk over to your house (the one on the left) to see it.');
    } catch {
      setStatus("Couldn't read that picture. Try a JPEG or PNG.");
    }
  };

  return <div className="house-paint" aria-label="Paint your house from a photo">
    <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
    <button type="button" onClick={() => input.current?.click()}>📷 Paint my house from a photo</button>
    {style && <>
      <span className="house-paint-swatches" aria-label="Your house colours">
        {(['walls', 'roof', 'trim', 'door', 'interior'] as const).map(role =>
          <span key={role} className="house-paint-swatch" title={`${role}: ${style[role]}`} style={{ background: style[role] }}><small>{role}</small></span>)}
      </span>
      {palette && palette.length > 1 && <button type="button" onClick={() => {
        const next = variant + 1;
        setVariant(next);
        const mixed = houseStyleFrom(palette, next);
        if (mixed) use(mixed);
      }}>Try another mix</button>}
      <button type="button" onClick={() => { setPalette(null); use(null); setStatus('Back to the original paint.'); }}>Reset paint</button>
    </>}
    {status && <small role="status" className="house-paint-status">{status}</small>}
  </div>;
}
