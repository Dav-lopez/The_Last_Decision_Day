/**
 * Weather by day (open-world 18a): every game day has its own weather, worked
 * out from the day number alone so it is the same on every device and after a
 * reload, and needs nothing saved. Day 1 is always clear (the first look at
 * Maple Street), day 2 brings an afternoon shower and day 3 a foggy morning, so
 * a new player meets each kind early; after that the days are shuffled.
 *
 * Everything here is pure: the scene (`weatherScene.ts`) turns these numbers
 * into rain, wet roads, fog, overcast skies and the sound of rain.
 */

export const WEATHER_KINDS = Object.freeze(['clear', 'cloudy', 'showers', 'fog']);

export const WEATHER_LABELS = Object.freeze({ clear: 'Clear', cloudy: 'Cloudy', showers: 'Showers', fog: 'Fog' });

/** Minutes for rain to build up or die away, for roads to soak, and for them to dry. */
export const WEATHER_TIMING = Object.freeze({ rainRamp: 15, soak: 25, dry: 150, fogFade: 90 });

/** Rain drops drawn at full quality; fewer as the adaptive quality lowers resolution. */
export const RAIN_DROPS = Object.freeze({ max: 1800, min: 300 });

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const lerp = (a, b, t) => a + (b - a) * t;

/** A small integer hash (deterministic, well mixed) → a number in [0, 1). */
function roll(day, salt) {
  let h = (Math.imul(day | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function kindFor(day) {
  if (day <= 1) return 'clear';
  if (day === 2) return 'showers';
  if (day === 3) return 'fog';
  const r = roll(day, 1);
  // About 40 % clear, 25 % cloudy, 22 % showers, 13 % fog.
  return r < 0.4 ? 'clear' : r < 0.65 ? 'cloudy' : r < 0.87 ? 'showers' : 'fog';
}

/**
 * The plan for one day: its kind, how cloudy it is, and when it rains or is foggy.
 * `rain` is { start, end, peak } in minutes of the day (rain never crosses midnight);
 * `fog` is { until } (thick fog until that minute, then it lifts).
 */
export function dayWeather(dayValue) {
  const day = Math.max(1, Math.floor(Number(dayValue) || 1));
  const kind = kindFor(day);
  if (kind === 'clear') return { day, kind, cloud: 0.1, rain: null, fog: null };
  if (kind === 'cloudy') return { day, kind, cloud: 0.7 + roll(day, 2) * 0.15, rain: null, fog: null };
  if (kind === 'fog') return { day, kind, cloud: 0.45, rain: null, fog: { until: 570 + Math.round(roll(day, 3) * 6) * 15 } };
  // Showers: one spell of rain between 10:00 and 20:00, an hour to three and a half long.
  const start = day === 2 ? 14 * 60 : 600 + Math.round(roll(day, 4) * 40) * 15;
  const length = day === 2 ? 120 : 60 + Math.round(roll(day, 5) * 10) * 15;
  const peak = day === 2 ? 0.8 : 0.55 + roll(day, 6) * 0.45;
  return { day, kind, cloud: 0.9, rain: { start, end: Math.min(1380, start + length), peak }, fog: null };
}

/**
 * The weather right now: `rain` 0–1 (how hard it is raining), `wet` 0–1 (how wet the roads are;
 * they stay wet for a while after the rain stops), `fog` 0–1 and `cloud` 0–1.
 * `override` forces a kind for a whole day (the playtest's weather switch).
 */
export function weatherAt(dayValue, minuteValue, override = null) {
  const plan = override && WEATHER_KINDS.includes(override) ? forcedPlan(dayValue, override) : dayWeather(dayValue);
  const minute = Math.max(0, Math.min(1439, Number(minuteValue) || 0));
  let rain = 0;
  let wet = 0;
  if (plan.rain) {
    const { start, end, peak } = plan.rain;
    if (minute >= start && minute <= end) {
      rain = peak * Math.min(1, (minute - start) / WEATHER_TIMING.rainRamp, (end - minute) / WEATHER_TIMING.rainRamp);
      wet = Math.min(1, (minute - start) / WEATHER_TIMING.soak);
    } else if (minute > end) {
      const soaked = Math.min(1, (end - start) / WEATHER_TIMING.soak);
      wet = soaked - (minute - end) / WEATHER_TIMING.dry;
    }
  }
  let fog = 0;
  if (plan.fog) fog = minute <= plan.fog.until ? 1 : 1 - (minute - plan.fog.until) / WEATHER_TIMING.fogFade;
  fog = clamp01(fog);
  // Clouds thin out as the fog lifts and gather before the rain.
  const cloud = plan.fog ? lerp(0.25, plan.cloud, fog) : plan.cloud;
  return { kind: plan.kind, label: WEATHER_LABELS[plan.kind], rain: clamp01(rain), wet: clamp01(wet), fog, cloud: clamp01(cloud) };
}

function forcedPlan(dayValue, kind) {
  const day = Math.max(1, Math.floor(Number(dayValue) || 1));
  if (kind === 'showers') return { day, kind, cloud: 0.9, rain: { start: 0, end: 1439, peak: 1 }, fog: null };
  if (kind === 'fog') return { day, kind, cloud: 0.45, rain: null, fog: { until: 1439 } };
  return { day, kind, cloud: kind === 'cloudy' ? 0.8 : 0.1, rain: null, fog: null };
}

const clockText = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** A one-line forecast for the day ("Showers 14:00–16:00"), for the phone and the HUD. */
export function forecastLine(dayValue) {
  const plan = dayWeather(dayValue);
  if (plan.kind === 'showers' && plan.rain) return `Showers ${clockText(plan.rain.start)}–${clockText(plan.rain.end)}`;
  if (plan.kind === 'fog' && plan.fog) return `Fog until about ${clockText(plan.fog.until)}, then clearing`;
  if (plan.kind === 'cloudy') return 'Cloudy all day';
  return 'Clear skies';
}

/** What Mom adds to her morning text, or null on a plain day. */
export function weatherTip(dayValue) {
  const plan = dayWeather(dayValue);
  if (plan.kind === 'showers' && plan.rain) {
    const when = plan.rain.start < 720 ? 'this morning' : plan.rain.start < 1020 ? 'this afternoon' : 'this evening';
    return `Rain ${when}, so bring an umbrella.`;
  }
  if (plan.kind === 'fog') return 'Foggy out, so look both ways twice.';
  return null;
}

/** A short status for the HUD: "Rain", "Light rain", "Wet roads", "Fog", or the day's kind. */
export function weatherStatus(state) {
  if (state.rain >= 0.6) return 'Heavy rain';
  if (state.rain > 0.05) return 'Rain';
  if (state.fog > 0.3) return 'Fog';
  if (state.wet > 0.15) return 'Wet roads';
  return state.cloud >= 0.6 ? 'Cloudy' : 'Clear';
}

/**
 * How the weather changes the light: multipliers for the sun and sky lights, the fog density,
 * how pale shadows get (Babylon's shadow darkness: 0 black … 1 none), how much the haze turns grey,
 * and how opaque the overcast sky layer is.
 */
export function weatherLook(state, evening = false) {
  const overcast = clamp01((state.cloud - 0.2) / 0.7);
  return {
    overcast,
    sun: 1 - 0.72 * overcast,
    sky: 1 - (evening ? 0.1 : 0.2) * overcast,
    fogScale: 1 + 1.6 * state.rain + 4.5 * state.fog,
    shadowDarkness: Math.min(0.9, 0.3 + 0.55 * overcast + 0.3 * state.fog),
    grey: clamp01(Math.max(overcast * 0.85, state.fog)),
    sunGlow: 1 - overcast,
  };
}

/** How many rain drops to draw: by rain strength, and fewer when adaptive quality is rendering at lower resolution. */
export function rainDropCount(rain, quality = { scale: 1, base: 1 }) {
  if (!(rain > 0.02)) return 0;
  const base = quality?.base > 0 ? quality.base : 1;
  const scale = quality?.scale > 0 ? quality.scale : base;
  // Hardware scaling 1 → full budget; 2 (half resolution) → a third of it.
  const budget = lerp(RAIN_DROPS.max, RAIN_DROPS.max / 3, clamp01((scale - 1) / 1));
  return Math.round(Math.max(RAIN_DROPS.min, budget) * clamp01(rain));
}

/** Wet asphalt: darker, with a glossy highlight (multiplier for diffuse, specular strength 0–1, gloss power). */
export function wetSurface(wet) {
  const w = clamp01(wet);
  return { darken: 1 - 0.32 * w, specular: 0.55 * w, power: lerp(16, 96, w) };
}
