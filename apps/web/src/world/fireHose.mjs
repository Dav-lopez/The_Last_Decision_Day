/**
 * The hose at a fire call (open-world item 16a). A firefighter on a call-out arrives at a small outdoor fire (a
 * skip or a bin burning beside the pavement) and has to knock it down with the hose: stand within reach, face the
 * base of the flames and hold the spray. Pure rules, no scene: the scene draws the flames, smoke and water from
 * the numbers here. Local metres, facing as a direction (dx, dz); heading conventions stay in the scene.
 */

export const HOSE = Object.freeze({
  minRange: 1.4,      // closer than this the spray splashes back off the skip
  maxRange: 9,        // the jet's useful reach
  cone: 0.5,          // radians either side of straight at the fire that still lands on it
  knockdown: 0.24,    // heat removed per second with a perfect aim (about four seconds of solid spraying)
  regrow: 0.05,       // heat regained per second while nobody sprays it
  out: 0.02,          // at or below this heat, the fire is out
  flow: 8,            // litres per second through the nozzle (a 38 mm attack line)
  smoulderSeconds: 6, // smoke keeps rising this long after the flames are out
});

/** A fire to put out, `distance` metres from the stop along the pavement (`along` is the street's direction). */
export function placeFire(stop, along, distance = 5) {
  const length = Math.hypot(along?.x ?? 0, along?.z ?? 0);
  const ux = length > 1e-6 ? along.x / length : 1, uz = length > 1e-6 ? along.z / length : 0;
  return { x: stop.x + ux * distance, z: stop.z + uz * distance };
}

export function createFire(at) {
  return { x: at.x, z: at.z, heat: 1, out: false, sprayed: 0, water: 0, burning: 0, hitting: false };
}

/**
 * How well a player at (x, z) facing (dx, dz) is aimed at the fire. `quality` is 1 dead centre at a good distance
 * and falls off towards the edge of the cone and the end of the jet's reach.
 */
export function aimAt(fire, { x, z, dx, dz }) {
  const tx = fire.x - x, tz = fire.z - z;
  const distance = Math.hypot(tx, tz);
  const facing = Math.hypot(dx, dz);
  if (!(facing > 1e-6) || !Number.isFinite(distance)) return { distance, angle: Math.PI, inRange: false, onTarget: false, quality: 0, hint: 'aim' };
  const angle = distance < 1e-6 ? 0 : Math.acos(Math.max(-1, Math.min(1, (tx * dx + tz * dz) / (distance * facing))));
  const inRange = distance >= HOSE.minRange && distance <= HOSE.maxRange;
  const onTarget = angle <= HOSE.cone;
  // Best between 3 and 6 m; the stream thins out towards full reach.
  const reach = distance <= 6 ? 1 : Math.max(0.35, 1 - (distance - 6) / (HOSE.maxRange - 6) * 0.65);
  const centre = 1 - 0.6 * (angle / HOSE.cone) ** 2;
  const quality = inRange && onTarget ? reach * centre : 0;
  const hint = distance > HOSE.maxRange ? 'closer' : distance < HOSE.minRange ? 'back' : !onTarget ? 'aim' : null;
  return { distance, angle, inRange, onTarget, quality, hint };
}

/**
 * Advance the fire by `seconds`. Spraying on target knocks the heat down; left alone it creeps back up (never past
 * where it started). Returns the new fire, the aim, and `event: 'out'` on the frame it goes out.
 */
export function stepFire(fire, { x, z, dx, dz, spraying = false, seconds = 0 }) {
  const dt = Math.max(0, Math.min(0.25, Number(seconds) || 0));
  const aim = aimAt(fire, { x, z, dx, dz });
  if (fire.out) return { fire: { ...fire, burning: fire.burning + dt, hitting: false }, aim, event: null };
  const hitting = Boolean(spraying) && aim.quality > 0;
  const water = fire.water + (spraying ? HOSE.flow * dt : 0);
  let heat = fire.heat;
  if (hitting) heat -= HOSE.knockdown * aim.quality * dt;
  else if (!spraying) heat = Math.min(1, heat + HOSE.regrow * dt);
  heat = Math.max(0, heat);
  const out = heat <= HOSE.out;
  const next = { ...fire, heat: out ? 0 : heat, out, water, hitting,
    sprayed: fire.sprayed + (hitting ? dt : 0), burning: out ? 0 : fire.burning + dt };
  return { fire: next, aim, event: out ? 'out' : null };
}

/** The card line while the fire burns: how much is left and what to fix. */
export function hoseStatus(fire, aim, spraying = false) {
  const left = Math.round(Math.max(0, Math.min(1, fire?.heat ?? 0)) * 100);
  if (!fire || fire.out) return { left: 0, line: 'Fire out' };
  const line = aim?.hint === 'closer' ? 'Get closer to the fire'
    : aim?.hint === 'back' ? 'Step back a little'
    : aim?.hint === 'aim' ? 'Turn to face the flames'
    : spraying ? 'Keep it on the base of the flames'
    : 'Hold Space or HOSE to spray';
  return { left, line };
}

/** After the fire is out: how the job went, for the sign-off line. */
export function hoseReport(fire) {
  const litres = Math.round((fire?.water ?? 0) / 10) * 10;
  const seconds = Math.round(fire?.sprayed ?? 0);
  // A tidy job wastes little water: most of what left the nozzle landed on the fire.
  const efficiency = fire?.water > 0 ? Math.min(1, (fire.sprayed * HOSE.flow) / fire.water) : 0;
  const grade = efficiency >= 0.8 ? 'Clean knockdown' : efficiency >= 0.5 ? 'Knocked down' : 'Soaked the street';
  return { litres, seconds, efficiency, grade };
}

/**
 * Particle budget for the flames, smoke and water by adaptive quality (hardware scaling above the device's base
 * means the game is already struggling, so draw fewer particles).
 */
export function particleBudget(quality) {
  const scale = Number(quality?.scale) || 1;
  const base = Number(quality?.base) || 1;
  const factor = scale > base + 0.6 ? 0.35 : scale > base + 0.2 ? 0.6 : 1;
  return { flames: Math.round(260 * factor), smoke: Math.round(90 * factor), water: Math.round(320 * factor), factor };
}
