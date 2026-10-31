import { useEffect, useRef } from 'react';
import type { City } from './cityLayout.mjs';
import type { MapMarker, MapSnapshot } from './WorldMap';
import { formatDistance } from './gps.mjs';
import './minimap.css';

const SIZE = 168;
const PIN: Record<MapMarker['kind'], string> = { home: '#f2d48b', school: '#9ad0ff', bus: '#5fb3ff', gate: '#ff9f43', pitch: '#7ddc6f', work: '#ff7a7a', you: '#ffffff' };

type CityPaths = { city: City; roads: Path2D; paths: Path2D; buildings: Path2D; parks: Path2D };

function cityPaths(city: City): CityPaths {
  const roads = new Path2D(), paths = new Path2D(), buildings = new Path2D(), parks = new Path2D();
  for (const road of city.roads) {
    const target = ['footway', 'path', 'cycleway', 'steps', 'pedestrian'].includes(road.kind) ? paths : roads;
    road.points.forEach(([x, z], i) => i ? target.lineTo(x, -z) : target.moveTo(x, -z));
  }
  for (const b of city.buildings) { b.ring.forEach(([x, z], i) => i ? buildings.lineTo(x, -z) : buildings.moveTo(x, -z)); buildings.closePath(); }
  for (const p of city.parks) { p.ring.forEach(([x, z], i) => i ? parks.lineTo(x, -z) : parks.moveTo(x, -z)); parks.closePath(); }
  return { city, roads, paths, buildings, parks };
}

/**
 * GTA-style corner minimap: north-up is replaced by "camera-up" (what's ahead
 * of you is up), with roads, your GPS route and waypoint, traffic, and pins.
 * Draws on its own canvas a few times a second; reads the same snapshot as
 * the big map.
 */
export function Minimap({ read, hidden }: { read: () => MapSnapshot; hidden: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cache = useRef<CityPaths | null>(null);
  const label = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (hidden) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * ratio; canvas.height = SIZE * ratio;
    let timer = 0;
    const draw = () => {
      const snap = read();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2); ctx.clip();
      const inCity = snap.location === 'city' && snap.city;
      ctx.fillStyle = inCity ? '#b9b4aa' : '#4c7a45';
      ctx.fillRect(0, 0, SIZE, SIZE);
      const you = snap.you;
      if (you) {
        // Scale: downtown shows ~180 m across, Maple Street ~30 m.
        const scale = inCity ? SIZE / 180 : SIZE / 30;
        ctx.translate(SIZE / 2, SIZE / 2);
        ctx.rotate(-snap.view);
        ctx.scale(scale, scale);
        ctx.translate(-you.x, you.z);
        const line = (w: number) => w / scale;
        if (inCity && snap.city) {
          if (cache.current?.city !== snap.city) cache.current = cityPaths(snap.city);
          const c = cache.current;
          ctx.fillStyle = '#7fae6b'; ctx.fill(c.parks);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = '#e7e3da'; ctx.lineWidth = 3; ctx.stroke(c.paths);
          ctx.strokeStyle = '#5b5f63'; ctx.lineWidth = 9; ctx.stroke(c.roads);
          ctx.fillStyle = '#d9cfc2'; ctx.fill(c.buildings);
        } else {
          // Maple Street: the road, sidewalks, houses and school.
          ctx.fillStyle = '#55595c'; ctx.fillRect(-2.1, -30, 4.2, 60);
          ctx.fillStyle = '#c8c4ba'; for (const side of [-1, 1]) ctx.fillRect(side * 2.5 - 0.33, -12, 0.65, 24);
          ctx.fillStyle = '#b58a6a'; ctx.fillRect(-3.9, 6.75, 7.8, 4.75);
          ctx.fillStyle = '#d8cbb7'; ctx.fillRect(-10.5, 2.6, 4.2, 4.9);
          ctx.fillStyle = '#899eac'; ctx.fillRect(6.3, 2.6, 4.2, 4.9);
        }
        // GPS route and waypoint.
        if (snap.route && snap.route.length > 1) {
          ctx.strokeStyle = '#b44dff'; ctx.lineWidth = line(5); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); snap.route.forEach(([x, z], i) => i ? ctx.lineTo(x, -z) : ctx.moveTo(x, -z)); ctx.stroke();
        }
        if (inCity) for (const car of snap.traffic) {
          ctx.fillStyle = '#20252b'; ctx.beginPath(); ctx.arc(car.x, -car.z, line(2.6), 0, Math.PI * 2); ctx.fill();
        }
        const pins = inCity ? snap.downtown : snap.street;
        for (const pin of pins) {
          ctx.fillStyle = PIN[pin.kind]; ctx.strokeStyle = '#0b1626'; ctx.lineWidth = line(1.5);
          ctx.beginPath(); ctx.arc(pin.x, -pin.z, line(4.5), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        if (snap.waypoint) {
          ctx.fillStyle = '#b44dff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = line(2);
          ctx.beginPath(); ctx.arc(snap.waypoint.x, -snap.waypoint.z, line(6), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        // You: an arrow pointing the way you're heading.
        ctx.translate(you.x, -you.z);
        ctx.rotate(you.heading);
        ctx.scale(1 / scale, 1 / scale);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d6fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      // North marker on the rim.
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const north = -Math.PI / 2 - snap.view;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('N', SIZE / 2 + Math.cos(north) * (SIZE / 2 - 10), SIZE / 2 + Math.sin(north) * (SIZE / 2 - 10));
      if (label.current) {
        const text = snap.routeLength != null ? `${snap.waypointLabel ?? 'Waypoint'} · ${formatDistance(snap.routeLength)}` : '';
        if (label.current.textContent !== text) label.current.textContent = text;
      }
    };
    const loop = () => { draw(); timer = window.setTimeout(loop, 120); };
    loop();
    return () => window.clearTimeout(timer);
  }, [read, hidden]);
  if (hidden) return null;
  return <div className="world-minimap" aria-hidden="true">
    <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE }} />
    <span ref={label} className="world-minimap-label" />
  </div>;
}
