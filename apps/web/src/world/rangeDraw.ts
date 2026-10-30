import { maxScore, targetAngles, targetFacing, type RangeDrill, type RangeSession, type RangeTarget } from './trainingRange.mjs';

/** Canvas drawing for the training range (no React, so it can be previewed on its own). */
export type Splash = { x: number; y: number; age: number; ring: number; targetId: number | null };
const EYE = 1.5;

export type View = { w: number; h: number; focal: number; cx: number; cy: number };

export function drawRange(ctx: CanvasRenderingContext2D, v: View, drill: RangeDrill, s: RangeSession, schedule: readonly RangeTarget[],
  aim: { x: number; y: number }, splashes: Splash[], flash: number, holding: boolean) {
  const { w, h, focal, cx, cy } = v;
  const px = (ax: number) => cx + ax * focal;
  const py = (ay: number) => cy + ay * focal;
  const far = drill.distances[drill.distances.length - 1] * 1.25;
  // Sky and the Flatirons on the horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, cy);
  sky.addColorStop(0, drill.theme === 'flame' ? '#9fb6c9' : '#7fb0de');
  sky.addColorStop(1, '#dfe9ef');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, cy + 1);
  ctx.fillStyle = '#8a7a6c';
  ctx.beginPath();
  ctx.moveTo(0, cy);
  const peaks = [0, 0.05, 0.12, 0.18, 0.24, 0.31, 0.38, 0.45, 0.52, 0.6, 0.68, 0.76, 0.84, 0.92, 1];
  peaks.forEach((p, i) => ctx.lineTo(p * w, cy - (i % 2 ? h * (0.05 + (i % 3) * 0.025) : h * 0.012)));
  ctx.lineTo(w, cy);
  ctx.fill();
  // Ground.
  const ground = ctx.createLinearGradient(0, cy, 0, h);
  ground.addColorStop(0, drill.theme === 'flame' ? '#9a9a96' : '#7f8f5a');
  ground.addColorStop(1, drill.theme === 'flame' ? '#6c6c69' : '#5c6b3c');
  ctx.fillStyle = ground;
  ctx.fillRect(0, cy, w, h - cy);
  // Earth berm behind the furthest targets.
  if (drill.theme !== 'flame') {
    const bermTop = py((EYE - 3.2) / far), bermFoot = py(EYE / far);
    ctx.fillStyle = '#8b6f4e';
    ctx.beginPath();
    ctx.moveTo(0, bermFoot);
    ctx.quadraticCurveTo(cx, bermTop - (bermFoot - bermTop) * 0.6, w, bermFoot);
    ctx.fill();
  } else {
    // Drill-yard training tower.
    const towerAt = 45;
    const top = py((EYE - 9) / towerAt), foot = py(EYE / towerAt);
    const half = (2.5 / towerAt) * focal;
    ctx.fillStyle = '#9b4b3a';
    ctx.fillRect(cx - half * 3, top, half * 2, foot - top);
    ctx.fillStyle = '#3b3b3b';
    for (let i = 1; i < 4; i++) ctx.fillRect(cx - half * 2.6, top + (foot - top) * i / 4, half * 1.2, (foot - top) * 0.1);
  }
  // Floor lines converging on the vanishing point, and distance markers.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, h / 500);
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + i * w * 0.22, h);
    ctx.stroke();
  }
  ctx.font = `${Math.round(h / 40)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const d of drill.distances) {
    const y = py(EYE / d);
    if (y > h) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`${d} m`, w * 0.04, y - 4);
  }
  // Every target stand on the range, turned edge-on until it's its turn.
  const stands = new Map<string, RangeTarget>();
  for (const t of schedule) if (targetFacing(t, s.time) === 0) stands.set(`${t.lane}:${t.distance}`, t);
  for (const t of [...stands.values()].sort((a, b) => b.distance - a.distance)) {
    const c = targetAngles(drill, t);
    const x = px(c.x), y = py(c.y), r = drill.radius * focal / t.distance, foot = py(EYE / t.distance);
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(x - Math.max(1, r * 0.05), y + r, Math.max(2, r * 0.1), Math.max(0, foot - y - r));
    // The board itself, turned edge-on.
    ctx.fillStyle = drill.theme === 'flame' ? '#7c2a20' : drill.theme === 'steel' ? '#8d959b' : '#e6e0cf';
    ctx.fillRect(x - Math.max(1.5, r * 0.08), y - r, Math.max(3, r * 0.16), r * 2);
  }
  // Targets, far to near.
  const up = [...schedule].filter(t => targetFacing(t, s.time) > 0).sort((a, b) => b.distance - a.distance);
  for (const target of up) drawTarget(ctx, drill, target, targetFacing(target, s.time), s, px, py, focal, s.time);
  // Shot impacts that missed: dust puffs or water splashes on the ground line.
  for (const splash of splashes) {
    if (splash.ring) continue;
    const alpha = 1 - splash.age / 0.6;
    ctx.fillStyle = drill.theme === 'flame' ? `rgba(180,215,255,${alpha * 0.7})` : `rgba(150,120,90,${alpha * 0.8})`;
    ctx.beginPath();
    ctx.arc(px(splash.x), py(splash.y), (h / 90) * (1 + splash.age * 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Water stream for the hose: from the nozzle to the aim point.
  if (drill.theme === 'flame') {
    for (const splash of splashes) {
      if (splash.age > 0.3) continue;
      const alpha = 1 - splash.age / 0.3;
      ctx.strokeStyle = `rgba(190,225,255,${alpha * 0.85})`;
      ctx.lineWidth = h / 70;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // From the nozzle tip (see the nozzle below), arcing up onto the target.
      const angle = Math.atan2(py(splash.y) - h * 1.02, px(splash.x) - w * 0.62);
      const tx = w * 0.62 + Math.cos(angle) * h * 0.24, ty = h * 1.02 + Math.sin(angle) * h * 0.24;
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo((tx + px(splash.x)) / 2, Math.min(ty, py(splash.y)) - h * 0.12, px(splash.x), py(splash.y));
      ctx.stroke();
    }
  }
  // The shooting bench / nozzle in the foreground.
  const ax = px(aim.x), ay = py(aim.y);
  if (drill.theme === 'flame') {
    // Hose line and brass nozzle pointing at the aim.
    const bx = w * 0.62, by = h * 1.02;
    const angle = Math.atan2(ay - by, ax - bx);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle);
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(-h * 0.1, -h * 0.035, h * 0.22, h * 0.07);
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.moveTo(h * 0.12, -h * 0.04);
    ctx.lineTo(h * 0.24, -h * 0.022);
    ctx.lineTo(h * 0.24, h * 0.022);
    ctx.lineTo(h * 0.12, h * 0.04);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(h * 0.13, -h * 0.05, h * 0.03, h * 0.1);
    ctx.restore();
  } else {
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(0, h * 0.9, w, h * 0.1);
    ctx.fillStyle = '#6e5639';
    ctx.fillRect(0, h * 0.9, w, h * 0.012);
    if (drill.zoom === 1) {
      // Service pistol held in both hands, following the aim a little.
      const gx = w / 2 + (ax - w / 2) * 0.35, gy = h * 0.86 + (ay - cy) * 0.15 - s.recoil * h * 2;
      ctx.fillStyle = '#c99a78';
      ctx.beginPath();
      ctx.ellipse(gx, gy + h * 0.1, h * 0.07, h * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#26282b';
      ctx.fillRect(gx - h * 0.028, gy - h * 0.035, h * 0.056, h * 0.11);
      ctx.fillStyle = '#34373b';
      ctx.fillRect(gx - h * 0.034, gy - h * 0.05, h * 0.068, h * 0.035);
      ctx.fillStyle = '#26282b';
      ctx.fillRect(gx - h * 0.005, gy - h * 0.062, h * 0.01, h * 0.014);
    }
  }
  if (flash > 0 && drill.theme !== 'flame') {
    ctx.fillStyle = `rgba(255,236,190,${flash * 0.18})`;
    ctx.fillRect(0, 0, w, h);
  }
  // Reticle (where the shot will actually go).
  const rx = ax, ry = ay;
  if (drill.zoom > 1) drawScope(ctx, w, h, rx, ry);
  else {
    ctx.strokeStyle = drill.theme === 'flame' ? 'rgba(255,255,255,0.95)' : 'rgba(20,255,120,0.95)';
    ctx.lineWidth = Math.max(1.5, h / 400);
    const r = h / 45;
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath();
      ctx.moveTo(rx + dx * r * 0.45, ry + dy * r * 0.45);
      ctx.lineTo(rx + dx * r * 1.5, ry + dy * r * 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
  }
  drawHud(ctx, w, h, drill, s, holding);
}

function drawTarget(ctx: CanvasRenderingContext2D, drill: RangeDrill, target: RangeTarget, facing: number, s: RangeSession,
  px: (a: number) => number, py: (a: number) => number, focal: number, time: number) {
  const centre = targetAngles(drill, target);
  const x = px(centre.x), y = py(centre.y);
  const scale = focal / target.distance;
  const r = drill.radius * scale;
  const foot = py(EYE / target.distance);
  const hits = s.hits[target.id] ?? [];
  const down = hits.length >= drill.hitsPerTarget;
  // Post.
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(x - Math.max(1, r * 0.06), y + r, Math.max(2, r * 0.12), Math.max(0, foot - y - r));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.02, facing), 1);
  if (drill.theme === 'paper') {
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(-r * 1.25, -r * 1.25, r * 2.5, r * 2.5);
    for (let ring = 5; ring >= 1; ring--) {
      ctx.beginPath();
      ctx.arc(0, 0, r * ring / 5, 0, Math.PI * 2);
      ctx.fillStyle = ring <= 3 ? '#1d1d1d' : '#f4f1e8';
      ctx.fill();
      ctx.strokeStyle = ring <= 3 ? '#f4f1e8' : '#1d1d1d';
      ctx.lineWidth = Math.max(0.6, r * 0.02);
      ctx.stroke();
    }
    ctx.fillStyle = '#c7372f';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  } else if (drill.theme === 'steel') {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = down ? '#9aa1a6' : '#e9ecee';
    ctx.fill();
    ctx.strokeStyle = '#555c62';
    ctx.lineWidth = Math.max(0.8, r * 0.06);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.strokeStyle = '#c7372f';
    ctx.stroke();
  } else {
    // Flame board: a red prop panel with flames that shrink as you knock them down.
    ctx.fillStyle = '#7c2a20';
    ctx.fillRect(-r, -r * 0.3, r * 2, r * 1.3);
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.strokeRect(-r, -r * 0.3, r * 2, r * 1.3);
    const strength = 1 - hits.length / drill.hitsPerTarget;
    if (strength > 0) {
      for (let i = -2; i <= 2; i++) {
        const flicker = 0.75 + 0.25 * Math.sin(time * 9 + i * 1.7 + target.id);
        const height = r * 1.3 * strength * flicker * (1 - Math.abs(i) * 0.18);
        ctx.fillStyle = i % 2 ? 'rgba(255,170,40,0.9)' : 'rgba(240,80,30,0.92)';
        ctx.beginPath();
        ctx.moveTo(i * r * 0.36 - r * 0.2, -r * 0.3);
        ctx.quadraticCurveTo(i * r * 0.36, -r * 0.3 - height * 1.3, i * r * 0.36 + r * 0.2, -r * 0.3);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(230,235,240,0.65)';
      ctx.beginPath();
      ctx.arc(0, -r * 0.5, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Hits: holes on paper, grey marks on steel, splashes on the flame board.
  for (const hit of hits) {
    ctx.beginPath();
    ctx.arc(hit.x * scale, hit.y * scale, Math.max(1.4, r * 0.05), 0, Math.PI * 2);
    const inBlack = Math.hypot(hit.x, hit.y) < drill.radius * 0.6;
    ctx.fillStyle = drill.theme === 'paper' ? (inBlack ? '#e8e2d0' : '#4d4d4d') : drill.theme === 'steel' ? '#3a3f44' : 'rgba(200,230,255,0.9)';
    ctx.fill();
  }
  ctx.restore();
}

function drawScope(ctx: CanvasRenderingContext2D, w: number, h: number, rx: number, ry: number) {
  const radius = Math.min(w, h) * 0.4;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,12,0.94)';
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.arc(rx, ry, radius, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(10,10,10,0.95)';
  ctx.lineWidth = Math.max(1.2, h / 520);
  ctx.beginPath();
  ctx.moveTo(rx - radius, ry); ctx.lineTo(rx - radius * 0.06, ry);
  ctx.moveTo(rx + radius * 0.06, ry); ctx.lineTo(rx + radius, ry);
  ctx.moveTo(rx, ry - radius); ctx.lineTo(rx, ry - radius * 0.06);
  ctx.moveTo(rx, ry + radius * 0.06); ctx.lineTo(rx, ry + radius);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,30,30,0.95)';
  ctx.beginPath();
  ctx.arc(rx, ry, Math.max(1.5, h / 380), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, drill: RangeDrill, s: RangeSession, holding: boolean) {
  const pad = h / 40;
  const font = Math.round(h / 32);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(pad, pad, font * 11, font * 3.6);
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${font}px system-ui, sans-serif`;
  ctx.fillText(`${drill.title}`, pad * 1.6, pad + font * 1.2);
  ctx.font = `${Math.round(font * 0.85)}px system-ui, sans-serif`;
  const left = Math.max(0, Math.ceil(drill.seconds - s.time));
  ctx.fillText(`Score ${s.score} / ${maxScore(drill)} · ${left}s`, pad * 1.6, pad + font * 2.3);
  const ammo = s.reloading > 0 ? `${drill.reloadWord === 'Refill' ? 'Refilling' : 'Reloading'}…` : `${s.loaded} / ${drill.magazine} · ${s.reserve} spare`;
  ctx.fillText(ammo, pad * 1.6, pad + font * 3.25);
  // Breath meter.
  const bw = font * 6, bh = font * 0.45, bx = w - pad - bw, by = pad;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(bx - 4, by - 4, bw + 8, bh + font * 1.4);
  ctx.fillStyle = s.breath.gasping ? '#e0533a' : holding ? '#5fd38a' : '#cfd8dc';
  ctx.fillRect(bx, by + font, bw * (s.breath.air / 4), bh);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(s.breath.gasping ? 'Catch your breath' : 'Breath (Shift)', w - pad, by + font * 0.8);
}
