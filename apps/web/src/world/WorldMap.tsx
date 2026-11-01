import { useEffect, useState } from 'react';
import './worldMap.css';
import type { City } from './cityLayout.mjs';

export type MapMarker = { id: string; label: string; x: number; z: number; kind: 'home' | 'school' | 'bus' | 'gate' | 'pitch' | 'work' | 'you' };
export type MapSnapshot = {
  location: 'street' | 'home' | 'school' | 'city';
  you: { x: number; z: number; heading: number } | null; // local to the shown area
  city: City | null;
  street: MapMarker[];
  downtown: MapMarker[];
  canTravel: boolean;
  /** Which way the camera looks (radians, 0 = north/+z, clockwise): the minimap turns so this is up. */
  view: number;
  /** Traffic downtown (local). */
  traffic: ReadonlyArray<{ x: number; z: number }>;
  /** GPS: waypoint and the road route to it (local to the shown area), when there is one. */
  waypoint: { x: number; z: number } | null;
  waypointLabel: string | null;
  route: ReadonlyArray<readonly [number, number]> | null;
  routeLength: number | null;
};
export type WaypointControl = { set: (x: number, z: number) => void; clear: () => void };
export type TravelTarget = 'maple' | 'downtown' | 'pitch' | 'work';

const COLOURS: Record<MapMarker['kind'], string> = { home: '#f2d48b', school: '#9ad0ff', bus: '#5fb3ff', gate: '#ff9f43', pitch: '#7ddc6f', work: '#ff7a7a', you: '#ffffff' };

/** Arrow for you, pointing where you face (heading 0 = north/+z). */
const You = ({ x, y, heading, size }: { x: number; y: number; heading: number; size: number }) =>
  <g transform={`translate(${x} ${y}) rotate(${heading * 180 / Math.PI})`}>
    <circle r={size * 0.9} fill="#1d6fff" opacity="0.25" />
    <path d={`M 0 ${-size} L ${size * 0.65} ${size * 0.7} L 0 ${size * 0.35} L ${-size * 0.65} ${size * 0.7} Z`} fill="#fff" stroke="#1d6fff" strokeWidth={size * 0.15} />
  </g>;

function Pins({ markers, size }: { markers: MapMarker[]; size: number }) {
  return <>{markers.map(m => <g key={m.id} transform={`translate(${m.x} ${-m.z})`}>
    <circle r={size * 0.55} fill={COLOURS[m.kind]} stroke="#0b1626" strokeWidth={size * 0.12} />
    <text y={-size * 0.85} textAnchor="middle" fontSize={size * 1.15} fill="#fff" stroke="#0b1626" strokeWidth={size * 0.25} paintOrder="stroke">{m.label}</text>
  </g>)}</>;
}

/** Map of Maple Street and real downtown Boulder, with your position and quick travel. */
export function WorldMap({ open, onClose, read, travel, waypoint }: { open: boolean; onClose: () => void; read: () => MapSnapshot; travel: (to: TravelTarget) => void; waypoint?: WaypointControl }) {
  const [snap, setSnap] = useState<MapSnapshot | null>(null);
  const [tab, setTab] = useState<'street' | 'downtown'>('street');
  useEffect(() => {
    if (!open) return;
    const first = read();
    setSnap(first);
    setTab(first.location === 'city' ? 'downtown' : 'street');
    const timer = window.setInterval(() => setSnap(read()), 500);
    return () => window.clearInterval(timer);
  }, [open, read]);
  if (!open || !snap) return null;
  const city = snap.city;
  const go = (to: TravelTarget) => { travel(to); onClose(); };

  return <div className="world-map" role="dialog" aria-label="Map" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <div className="world-map-head">
      <div className="wardrobe-tabs" role="tablist">
        <button type="button" role="tab" className="wardrobe-tab" aria-selected={tab === 'street'} onClick={() => setTab('street')}>Maple Street</button>
        <button type="button" role="tab" className="wardrobe-tab" aria-selected={tab === 'downtown'} onClick={() => setTab('downtown')} disabled={!city}>Downtown Boulder</button>
      </div>
      <button type="button" onClick={onClose} aria-label="Close map">Close (N)</button>
    </div>
    {tab === 'street' ? <svg className="world-map-svg" viewBox="-13 -13 26 26" role="img" aria-label="Map of Maple Street">
      <rect x="-13" y="-13" width="26" height="26" fill="#3f6b3a" />
      <rect x="-2.1" y="-30" width="4.2" height="60" fill="#55595c" />
      <line x1="0" y1="-12" x2="0" y2="12" stroke="#e9e7e0" strokeWidth="0.1" strokeDasharray="0.8 0.8" />
      {[-1, 1].map(side => <rect key={side} x={side * 2.5 - 0.33} y="-12" width="0.65" height="24" fill="#c8c4ba" />)}
      <rect x="-3.9" y={6.75} width="7.8" height="4.75" fill="#b58a6a" />
      {[-8.4, 8.4].map(x => <rect key={x} x={x - 2.1} y={2.6} width="4.2" height="4.9" fill={x < 0 ? '#d8cbb7' : '#899eac'} />)}
      <rect x="-2.6" y="-12.2" width="5.2" height="0.5" fill="#ff9f43" />
      <Pins markers={snap.street} size={0.7} />
      {snap.location !== 'city' && snap.you && <You x={snap.you.x} y={-snap.you.z} heading={snap.you.heading} size={0.8} />}
    </svg> : city ? <svg className="world-map-svg world-map-gps" viewBox={`${-city.halfSize[0]} ${-city.halfSize[1]} ${city.halfSize[0] * 2} ${city.halfSize[1] * 2}`} role="img"
      aria-label="Map of downtown Boulder. Click a street to set a GPS waypoint."
      onClick={event => {
        // Click to drop a waypoint; the GPS draws the road route to it.
        const svg = event.currentTarget;
        const matrix = svg.getScreenCTM();
        if (!matrix || !waypoint) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        waypoint.set(point.x, -point.y);
        setSnap(read());
      }}>
      <rect x={-city.halfSize[0]} y={-city.halfSize[1]} width={city.halfSize[0] * 2} height={city.halfSize[1] * 2} fill="#a9a59c" />
      {city.parks.map(p => <polygon key={p.id} points={p.ring.map(([x, z]) => `${x},${-z}`).join(' ')} fill="#5f8a4f" />)}
      {city.roads.map(r => <polyline key={r.id} points={r.points.map(([x, z]) => `${x},${-z}`).join(' ')} fill="none"
        stroke={['footway', 'path', 'cycleway', 'steps'].includes(r.kind) ? '#d6d2c8' : r.kind === 'pedestrian' ? '#b8735a' : '#55595c'} strokeWidth={Math.max(1.5, r.width)} strokeLinecap="round" strokeLinejoin="round" />)}
      {city.buildings.map(b => <polygon key={b.id} points={b.ring.map(([x, z]) => `${x},${-z}`).join(' ')} fill={b.name ? '#c98f6f' : '#8f7a6a'} stroke="#5d4c40" strokeWidth="0.4" />)}
      {snap.location === 'city' && snap.route && <polyline points={snap.route.map(([x, z]) => `${x},${-z}`).join(' ')} fill="none" stroke="#b44dff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />}
      <Pins markers={snap.downtown} size={7} />
      {snap.location === 'city' && snap.waypoint && <circle cx={snap.waypoint.x} cy={-snap.waypoint.z} r="7" fill="#b44dff" stroke="#fff" strokeWidth="2" />}
      {snap.location === 'city' && snap.you && <You x={snap.you.x} y={-snap.you.z} heading={snap.you.heading} size={8} />}
      <text x={city.halfSize[0] - 4} y={city.halfSize[1] - 4} textAnchor="end" fontSize="9" fill="#1d2430">© OpenStreetMap contributors</text>
    </svg> : null}
    <div className="world-map-travel">
      <span>{snap.canTravel ? 'Quick travel (taxi · 10 game minutes):' : 'Quick travel is available on foot.'}</span>
      <button type="button" disabled={!snap.canTravel} onClick={() => go('maple')}>Home · Maple Street</button>
      <button type="button" disabled={!snap.canTravel || !city} onClick={() => go('downtown')}>Downtown bus stop</button>
      <button type="button" disabled={!snap.canTravel || !city} onClick={() => go('pitch')}>Football pitch</button>
      {snap.downtown.some(m => m.id === 'your-work') && <button type="button" disabled={!snap.canTravel} onClick={() => go('work')}>Your workplace</button>}
      {tab === 'downtown' && <span className="world-map-gps-hint">{snap.waypoint
        ? <>GPS to {snap.waypointLabel ?? 'your waypoint'}{snap.routeLength != null ? ` · ${Math.round(snap.routeLength)} m` : ''} <button type="button" onClick={() => { waypoint?.clear(); setSnap(read()); }}>Clear waypoint</button></>
        : 'Click a street to set a GPS waypoint.'}</span>}
    </div>
  </div>;
}
