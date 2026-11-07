/**
 * The sky through the day (item 18b): instead of one switch at 19:00, the light
 * changes gradually — sunrise 06:00–07:30, golden hour 16:30–18:30, sunset
 * 18:30–19:30 and night falling until 21:00 (and lifting 05:00–06:00).
 * Street lamps still come on with `isEvening` (19:00); this only shapes the
 * sky, the sun and the haze. Pure: the scene applies `dayLight(minute)`.
 */

const H = 60;
const smooth = t => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const ramp = (minute, from, to) => smooth((minute - from) / (to - from));
const mix = (a, b, t) => a + (b - a) * t;
const hex = colour => [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16) / 255);
const toHex = rgb => `#${rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
export const mixColour = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => mix(v, y[i], t))); };

export const DAY_LIGHT = Object.freeze({
  sun: Object.freeze({ day: 1.2, dusk: 0.42, night: 0.12 }),
  sky: Object.freeze({ day: 0.65, dusk: 0.38, night: 0.26 }),
  sunColour: Object.freeze({ day: '#fff4df', golden: '#ffd29a', dusk: '#ffb47e', night: '#8fa6d8' }),
  ground: Object.freeze({ day: '#807664', dusk: '#3a3446', night: '#1b2133' }),
  haze: Object.freeze({ day: '#dbe7ee', golden: '#e9d9c4', dusk: '#7a6a78', night: '#1f2638' }),
});

/** Normalise any minute to 0–1439. */
const wrap = minute => ((Math.floor(Number.isFinite(minute) ? minute : 0) % (24 * H)) + 24 * H) % (24 * H);

/**
 * How far into each phase the day is at `minute`:
 * golden (warm low sun), dusk (sky turns to the sunset palette), night (dark).
 */
export function dayPhase(minute) {
  const m = wrap(minute);
  if (m < 12 * H) {
    // Night lifting before dawn, then sunrise.
    const night = 1 - ramp(m, 5 * H, 6 * H);
    const dusk = 1 - ramp(m, 6 * H, 7.5 * H);
    const golden = 1 - ramp(m, 6.5 * H, 8 * H);
    return { golden, dusk, night };
  }
  const golden = ramp(m, 16.5 * H, 18.5 * H);
  const dusk = ramp(m, 18.5 * H, 19.5 * H);
  const night = ramp(m, 19.5 * H, 21 * H);
  return { golden, dusk, night };
}

/** Light levels and colours for `minute`. */
export function dayLight(minute) {
  const { golden, dusk, night } = dayPhase(minute);
  const L = DAY_LIGHT;
  const sun = mix(mix(L.sun.day, mix(L.sun.day, L.sun.dusk, 0.35), golden), L.sun.dusk, dusk) * (1 - night) + L.sun.night * night;
  const sky = mix(L.sky.day, L.sky.dusk, Math.max(dusk, golden * 0.25)) * (1 - night) + L.sky.night * night;
  const sunColour = mixColour(mixColour(mixColour(L.sunColour.day, L.sunColour.golden, golden), L.sunColour.dusk, dusk), L.sunColour.night, night);
  const ground = mixColour(mixColour(L.ground.day, L.ground.dusk, Math.max(dusk, golden * 0.3)), L.ground.night, night);
  const haze = mixColour(mixColour(mixColour(L.haze.day, L.haze.golden, golden), L.haze.dusk, dusk), L.haze.night, night);
  return {
    golden, dusk, night, sun, sky, sunColour, ground, haze,
    /** How much of the sunset sky shows over the day sky (0–1), and how bright the sky dome is. */
    skyBlend: Math.max(dusk, golden * 0.35),
    skyBrightness: 1 - 0.72 * night,
    /** The sun glow: full by day, dimmer and lower at sunset, gone at night. */
    glow: mix(0.9, 0.6, Math.max(golden * 0.5, dusk)) * (1 - night),
  };
}

/** A key that changes only when the light visibly changes (to skip needless updates). */
export function lightKey(minute) {
  const l = dayLight(minute);
  return [l.golden, l.dusk, l.night].map(v => Math.round(v * 40)).join(':');
}
