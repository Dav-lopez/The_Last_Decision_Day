import { useEffect, useRef } from 'react';
import type { Engine } from '../babylon';
import { ZOOM, applyPhotoFilter, captureSize, filterById, filterCss, type Photo, type PhotoFilterId } from './photoMode.mjs';
import './photo.css';

export type PhotoView = { filter: PhotoFilterId; zoom: number; grid: boolean };

type Props = {
  view: PhotoView;
  /** Bumped on every shot, to replay the shutter flash. */
  shots: number;
  last: Photo | null;
  busy: boolean;
  onShoot: () => void;
  onFilter: (step: number) => void;
  onZoom: (step: number) => void;
  onGrid: () => void;
  onExit: () => void;
};

/**
 * Phone camera / photo mode (key P → Camera, or the Camera app): the game HUD steps aside, the movement keys aim
 * the camera, and the shutter saves the picture into the phone's Camera app. Drag (or pinch) still orbits and zooms.
 */
export function PhotoMode({ view, shots, last, busy, onShoot, onFilter, onZoom, onGrid, onExit }: Props) {
  const shutterRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { shutterRef.current?.focus({ preventScroll: true }); }, []);
  const filter = filterById(view.filter);
  return <div className="world-photo" role="dialog" aria-label="Camera" data-grid={view.grid ? 'true' : undefined}>
    <div className="world-photo-vignette" aria-hidden="true" style={{ opacity: filter.vignette * 2 }} />
    {view.grid && <div className="world-photo-grid" aria-hidden="true"><i /><i /><i /><i /></div>}
    <div className="world-photo-corners" aria-hidden="true"><i /><i /><i /><i /></div>
    {shots > 0 && <div key={shots} className="world-photo-flash" aria-hidden="true" />}
    <div className="world-photo-top">
      <div className="world-photo-group" role="group" aria-label="Filter">
        <button type="button" aria-label="Previous filter" onClick={() => onFilter(-1)}>‹</button>
        <span className="world-photo-label" aria-live="polite">{filter.name}</span>
        <button type="button" aria-label="Next filter (F)" onClick={() => onFilter(1)}>›</button>
      </div>
      <div className="world-photo-group" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out (minus)" disabled={view.zoom <= ZOOM.min} onClick={() => onZoom(-1)}>−</button>
        <span className="world-photo-label" aria-live="polite">{view.zoom.toFixed(view.zoom % 1 ? 2 : 0).replace(/0$/, '')}×</span>
        <button type="button" aria-label="Zoom in (plus)" disabled={view.zoom >= ZOOM.max} onClick={() => onZoom(1)}>+</button>
      </div>
      <button type="button" className="world-photo-small" aria-pressed={view.grid} onClick={onGrid}>Grid (G)</button>
      <button type="button" className="world-photo-small" onClick={onExit}>Done (Esc)</button>
    </div>
    <div className="world-photo-bottom">
      <span className="world-photo-last" aria-live="polite">
        {last && <><img src={last.src} alt="" /><small>Saved to Camera</small></>}
      </span>
      <button ref={shutterRef} type="button" className="world-photo-shutter" aria-label="Take photo (Space)" disabled={busy} onClick={onShoot}><span /></button>
      <small className="world-photo-help">Space shoot · WASD aim · F filter · +/− zoom · drag to orbit</small>
    </div>
  </div>;
}

/** CSS filter for the live 3D view while a filter is chosen (photos use the same formulas on their pixels). */
export const previewFilter = (id: PhotoFilterId) => filterCss(id);

/**
 * Takes the next rendered frame of the 3D canvas, applies the filter and vignette, prints the stamp and returns a
 * JPEG data URL. Reads the canvas right after Babylon finishes the frame, so no preserveDrawingBuffer is needed.
 */
export function capturePhoto(engine: Engine, canvas: HTMLCanvasElement, filter: PhotoFilterId, stamp: string, credit?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = window.setTimeout(() => { if (!done) { done = true; engine.onEndFrameObservable.remove(observer); reject(new Error('no frame')); } }, 2000);
    const observer = engine.onEndFrameObservable.addOnce(() => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      try {
        const { width, height } = captureSize(canvas.width, canvas.height);
        const out = document.createElement('canvas');
        out.width = width; out.height = height;
        const ctx = out.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no 2d canvas');
        ctx.drawImage(canvas, 0, 0, width, height);
        const image = ctx.getImageData(0, 0, width, height);
        applyPhotoFilter(image.data, width, height, filter);
        ctx.putImageData(image, 0, 0);
        const size = Math.max(11, Math.round(Math.min(width, height) * 0.035));
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = '#000a'; ctx.shadowBlur = size / 3;
        ctx.fillStyle = '#ffffffe6';
        ctx.textAlign = 'right';
        ctx.fillText(stamp, width - size, height - size * 0.8);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffd27ae6';
        ctx.fillText('The Last Decision Day', size, height - size * 0.8);
        if (credit) {
          ctx.font = `500 ${Math.round(size * 0.72)}px system-ui, sans-serif`;
          ctx.fillStyle = '#ffffffcc';
          ctx.textAlign = 'right';
          ctx.fillText(credit, width - size, height - size * 2.1);
        }
        resolve(out.toDataURL('image/jpeg', 0.82));
      } catch (error) { reject(error); }
    });
  });
}
