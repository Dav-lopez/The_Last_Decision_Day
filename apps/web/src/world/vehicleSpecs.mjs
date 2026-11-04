/**
 * The vehicles you can drive and how each one handles. The family sedans on Maple Street are the baseline
 * (`VEHICLE` in vehicleDrive.mjs mirrors them); the police cruiser and the fire engine wait outside their
 * stations downtown for officers and firefighters. Units: metres, seconds, radians.
 *
 * Kept free of renderer imports so movement, driving and the tests can share it.
 */
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from './streetLayout.mjs';

const SEDAN = Object.freeze({
  kind: 'sedan', name: 'car',
  halfWidth: CAR_HALF_WIDTH, halfLength: CAR_HALF_LENGTH,
  maxForwardSpeed: 9, maxReverseSpeed: 3.2,
  acceleration: 5.5, reverseAcceleration: 3.5, brakeDeceleration: 11, coastDeceleration: 1.8,
  wheelbase: 2.6, maxSteerAngle: 0.78,
  handbrakeDeceleration: 6.5, handbrakeYaw: 1.55,
  /** Horn pitch relative to the sedan's (349 + 440 Hz). */
  hornPitch: 1,
  siren: null,
});

export const VEHICLE_SPECS = Object.freeze({
  sedan: SEDAN,
  // A police interceptor: a little longer than the family car, quicker off the line and sharper on the brakes.
  cruiser: Object.freeze({
    ...SEDAN, kind: 'cruiser', name: 'police cruiser',
    halfWidth: 0.84, halfLength: 2.2,
    maxForwardSpeed: 11.5, acceleration: 7, brakeDeceleration: 12.5,
    wheelbase: 2.9, maxSteerAngle: 0.74, handbrakeYaw: 1.6,
    hornPitch: 1.12,
    siren: 'wail',
  }),
  // A pumper fire engine: long, wide and heavy. Slow to pick up speed, long to stop, wide turning circle,
  // and the back barely steps out on the handbrake. The air horn is low and loud.
  'fire-engine': Object.freeze({
    ...SEDAN, kind: 'fire-engine', name: 'fire engine',
    halfWidth: 1.2, halfLength: 3.9,
    maxForwardSpeed: 8.5, maxReverseSpeed: 2.6,
    acceleration: 3, reverseAcceleration: 2.2, brakeDeceleration: 7.5, coastDeceleration: 1.3,
    wheelbase: 4.8, maxSteerAngle: 0.66,
    handbrakeDeceleration: 5, handbrakeYaw: 1.12,
    hornPitch: 0.5,
    siren: 'growl',
  }),
});

/** Which career's vehicle is which (and so who may drive it). */
export const CAREER_VEHICLES = Object.freeze({
  police: Object.freeze({ kind: 'cruiser', career: 'police', job: 'police officers' }),
  firefighter: Object.freeze({ kind: 'fire-engine', career: 'firefighter', job: 'firefighters' }),
});

/** The handling and size of a car state's vehicle (sedan unless it says otherwise). */
export function vehicleSpec(carOrKind) {
  const kind = typeof carOrKind === 'string' ? carOrKind : carOrKind?.kind;
  return VEHICLE_SPECS[kind] ?? SEDAN;
}

/** Half extents (right, forward) of a car state's footprint. */
export function vehicleSize(car) {
  const spec = vehicleSpec(car);
  return { halfWidth: spec.halfWidth, halfLength: spec.halfLength };
}

/** The career a vehicle belongs to, or null for the family cars. */
export function vehicleCareer(kind) {
  return Object.values(CAREER_VEHICLES).find(entry => entry.kind === kind)?.career ?? null;
}

/**
 * Whether someone with `career` may take this vehicle. Family cars are anyone's; the cruiser is for police
 * officers and the engine for firefighters (it is their station's, not a car to take).
 */
export function mayDrive(kind, career) {
  const owner = vehicleCareer(kind);
  if (!owner || owner === career) return { ok: true, reason: '' };
  const entry = CAREER_VEHICLES[owner];
  const spec = vehicleSpec(kind);
  return { ok: false, reason: `The ${spec.name} is for ${entry.job} on duty. Join at the ${owner === 'police' ? 'police station' : 'fire station'} to drive it.` };
}

/** Local (right, forward) sample points around a footprint, at most `spacing` apart, grown by `margin`. */
export function footprintSamples(car, margin = 0, spacing = 0.9) {
  const { halfWidth, halfLength } = vehicleSize(car);
  const w = halfWidth + margin, l = halfLength + margin;
  const across = Math.max(2, Math.ceil(2 * w / spacing) + 1);
  const along = Math.max(3, Math.ceil(2 * l / spacing) + 1);
  const cos = Math.cos(car.rotation ?? 0), sin = Math.sin(car.rotation ?? 0);
  const points = [];
  for (let i = 0; i < across; i++) for (let j = 0; j < along; j++) {
    const lx = -w + 2 * w * i / (across - 1), lz = -l + 2 * l * j / (along - 1);
    points.push({ x: car.x + lx * cos + lz * sin, z: car.z - lx * sin + lz * cos });
  }
  return points;
}

/** Distance from a point to the edge of a vehicle's footprint (0 when inside). */
export function distanceToVehicle(car, point) {
  const { halfWidth, halfLength } = vehicleSize(car);
  const dx = point.x - car.x, dz = point.z - car.z;
  const cos = Math.cos(car.rotation ?? 0), sin = Math.sin(car.rotation ?? 0);
  const lx = Math.abs(dx * cos - dz * sin) - halfWidth;
  const lz = Math.abs(dx * sin + dz * cos) - halfLength;
  return Math.hypot(Math.max(0, lx), Math.max(0, lz));
}

/**
 * A bay outside a station door for a vehicle of `kind`: the nearest spot (searched in rings out to
 * `maxRadius`) where the whole footprint, plus a walking margin, is free (`isFree(x, z)`: not a building,
 * not a traffic lane). Headings are tried parallel to `along` first (the street), then every 45°.
 * The footprint stays `doorClearance` metres from the door. Returns { x, z, rotation } or null.
 */
export function stationBay(door, kind, isFree, { along = null, maxRadius = 40, margin = 0.45, step = 0.75, doorClearance = 3.4 } = {}) {
  if (!door || !Number.isFinite(door.x) || !Number.isFinite(door.z) || typeof isFree !== 'function') return null;
  const { halfWidth, halfLength } = vehicleSize({ kind });
  const base = along && Number.isFinite(along.x) && Number.isFinite(along.z) && Math.hypot(along.x, along.z) > 0
    ? Math.atan2(along.x, along.z) : 0;
  const headings = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].map(offset => base + offset);
  // Never on the door itself: the workplace prompt (2 m round the door) and the vehicle's own "get in" reach
  // (1.3 m round its bodywork) must not overlap, so E at the door always means work.
  const start = halfWidth + doorClearance;
  for (let r = start; r <= maxRadius; r += step) {
    const around = Math.max(12, Math.ceil(2 * Math.PI * r / step));
    for (let a = 0; a < around; a++) {
      const angle = a / around * Math.PI * 2;
      const x = door.x + Math.cos(angle) * r, z = door.z + Math.sin(angle) * r;
      for (const rotation of headings) {
        const bay = { kind, x, z, rotation };
        if (distanceToVehicle(bay, door) < doorClearance) continue;
        if (footprintSamples(bay, margin).every(point => isFree(point.x, point.z))) {
          return { x: round(x), z: round(z), rotation: round(normalizeAngle(rotation)) };
        }
      }
    }
  }
  return null;
}

/** Unit direction of the street segment nearest to `point` (roads as city data: { points: [[x, z], …] }), or null. */
export function streetDirection(roads, point) {
  let best = null, bestDistance = Infinity;
  for (const road of roads ?? []) {
    const points = road?.points;
    if (!Array.isArray(points)) continue;
    for (let i = 0; i + 1 < points.length; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
      if (!length) continue;
      const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / (length * length)));
      const distance = Math.hypot(point.x - ax - dx * t, point.z - az - dz * t);
      if (distance < bestDistance) { bestDistance = distance; best = { x: dx / length, z: dz / length }; }
    }
  }
  return best;
}

/**
 * Siren pitch in Hz `seconds` after it started. A police "wail" sweeps 650–1350 Hz every 2.4 s; the fire
 * engine's mechanical "growl" winds up from 300 Hz over the first two seconds, then sweeps 520–1050 Hz more
 * slowly (4 s) with a fast rotor flutter. Null for no siren.
 */
export function sirenFrequency(pattern, seconds) {
  const t = Math.max(0, Number(seconds) || 0);
  if (pattern === 'wail') {
    const phase = (t % 2.4) / 2.4;
    return 650 + 700 * (phase < 0.5 ? phase * 2 : 2 - phase * 2);
  }
  if (pattern === 'growl') {
    const windUp = Math.min(1, t / 2);
    const phase = (t % 4) / 4;
    const sweep = 520 + 530 * (phase < 0.5 ? phase * 2 : 2 - phase * 2);
    const flutter = 1 + 0.012 * Math.sin(t * 2 * Math.PI * 23);
    return (300 + (sweep - 300) * windUp * windUp * (3 - 2 * windUp)) * flutter;
  }
  return null;
}

/**
 * Which emergency lights are lit `seconds` into the pattern: the cruiser alternates red and blue six times a
 * second; the engine's reds flash in a double-blink with a white take-down light between.
 */
export function beaconPhase(kind, seconds) {
  const t = Math.max(0, Number(seconds) || 0);
  if (kind === 'fire-engine') {
    const slot = Math.floor((t % 0.8) / 0.1); // 8 slots: L L - R R - W -
    return { left: slot === 0 || slot === 2, right: slot === 4 || slot === 6, white: slot === 3 || slot === 7 };
  }
  const phase = Math.floor(t * 6) % 2;
  return { left: phase === 0, right: phase === 1, white: false };
}

const round = value => Math.round(value * 1000) / 1000;
const normalizeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
