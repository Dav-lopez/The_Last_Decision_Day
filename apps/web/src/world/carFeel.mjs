/**
 * Driving feel, independent of the renderer and Web Audio: a little gearbox
 * that turns road speed into engine revs (so the engine note climbs, drops on
 * each up-shift and climbs again), tyre slip from cornering, hard braking and
 * the handbrake (which drives the squeal and the skid marks), and a bounded
 * pool of skid-mark segments laid behind the rear wheels.
 * Units are metres, seconds and radians, matching vehicleDrive.mjs.
 */

/** Forward gears by road speed (m/s). The car tops out at 9 m/s (~32 km/h). */
export const GEARS = Object.freeze([
  Object.freeze({ gear: 1, from: 0, to: 3.4 }),
  Object.freeze({ gear: 2, from: 3.4, to: 6.4 }),
  Object.freeze({ gear: 3, from: 6.4, to: 9.4 }),
]);
export const GEARBOX = Object.freeze({ idle: 0.12, downshiftMargin: 0.5, shiftLift: 0.35 });

export function createGearbox() {
  return { gear: 1, rpm: GEARBOX.idle, shiftTimer: 0 };
}

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Advance the gearbox one frame. Reverse is its own gear ('R'). Up-shifts happen
 * at the top of a gear; down-shifts wait until a little under the band so the
 * gearbox doesn't hunt. `shifted` is true on the frame a gear changes, and
 * `rpm` (0..1) dips briefly after an up-shift like a real lift-off.
 */
export function stepGearbox(state, speed, throttle, seconds) {
  const dt = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 0.1) : 0;
  const v = Number.isFinite(speed) ? speed : 0;
  const pedal = Number.isFinite(throttle) ? throttle : 0;
  let gear = state.gear;
  let shiftTimer = Math.max(0, state.shiftTimer - dt);
  let shifted = false;
  if (v < -0.2) {
    if (gear !== 'R') { gear = 'R'; shifted = true; }
  } else {
    if (gear === 'R') { gear = 1; shifted = true; }
    let band = GEARS[gear - 1];
    while (band && v > band.to && gear < GEARS.length) { gear += 1; band = GEARS[gear - 1]; shifted = true; shiftTimer = 0.25; }
    while (band && gear > 1 && v < band.from - GEARBOX.downshiftMargin) { gear -= 1; band = GEARS[gear - 1]; shifted = true; }
  }
  let target;
  if (gear === 'R') target = GEARBOX.idle + clamp01(Math.abs(v) / 3.2) * 0.6;
  else {
    const band = GEARS[gear - 1];
    target = GEARBOX.idle + clamp01((v - band.from) / (band.to - band.from)) * (1 - GEARBOX.idle);
    if (gear === 1) target = Math.max(target, GEARBOX.idle + clamp01(v / band.to) * 0.88);
  }
  // Revs rise a touch on the gas even when stuck, and fall off quickly when you lift.
  if (pedal > 0 && Math.abs(v) < 0.5) target = Math.max(target, 0.3);
  if (shiftTimer > 0) target *= 1 - GEARBOX.shiftLift * (shiftTimer / 0.25);
  const ease = 1 - Math.exp(-dt * (target > state.rpm ? 9 : 14));
  const rpm = clamp01(state.rpm + (target - state.rpm) * ease);
  return { gear, rpm, shiftTimer, shifted };
}

/** Engine note frequency (Hz) for the audio: a low idle burble up to a busy hum. */
export function engineFrequency(rpm, gear) {
  const r = clamp01(rpm);
  const gearLift = gear === 'R' ? 0 : (Number(gear) - 1) * 6;
  return 42 + r * 78 + gearLift;
}

export const SLIP = Object.freeze({ lateralStart: 8, lateralFull: 22, brakeSpeed: 4, brakeSlip: 0.55, handbrakeSlip: 0.85, marksAbove: 0.35 });

/**
 * How hard the tyres are working, 0 (gripping) to 1 (sliding). Cornering load
 * is speed × yaw rate; hard braking at speed and the handbrake add slip.
 */
export function tyreSlip({ speed = 0, yawRate = 0, acceleration = 0, handbrake = false } = {}) {
  const v = Math.abs(Number.isFinite(speed) ? speed : 0);
  if (v < 1) return 0;
  const lateral = v * Math.abs(Number.isFinite(yawRate) ? yawRate : 0);
  let slip = clamp01((lateral - SLIP.lateralStart) / (SLIP.lateralFull - SLIP.lateralStart));
  const braking = (Number.isFinite(acceleration) ? acceleration : 0) * Math.sign(speed) < -8;
  if (braking && v > SLIP.brakeSpeed) slip = Math.max(slip, SLIP.brakeSlip * clamp01((v - SLIP.brakeSpeed) / 3 + 0.5));
  if (handbrake && v > 2) slip = Math.max(slip, SLIP.handbrakeSlip * clamp01(v / 6 + 0.3));
  return clamp01(slip);
}

/** Rear wheel contact points in car-local metres (right, forward). */
export const REAR_WHEELS = Object.freeze([Object.freeze({ x: -0.72, z: -1.25 }), Object.freeze({ x: 0.72, z: -1.25 })]);
export const SKID = Object.freeze({ spacing: 0.3, maxSegments: 240, lifetime: 24, width: 0.22 });

function wheelPoint(car, wheel) {
  const cos = Math.cos(car.rotation);
  const sin = Math.sin(car.rotation);
  return { x: car.x + wheel.x * cos + wheel.z * sin, z: car.z - wheel.x * sin + wheel.z * cos };
}

/**
 * A ring buffer of skid-mark segments. Each `lay` call extends the two rear
 * wheel trails while the tyres slip; a break in slipping starts a new trail.
 * The oldest segment is reused when the pool is full, and segments fade (their
 * `life` shrinks to 0) over `lifetime` seconds. `capacity` can be lowered by
 * the adaptive quality system without losing the newest marks.
 */
export function createSkidMarks({ maxSegments = SKID.maxSegments, lifetime = SKID.lifetime } = {}) {
  const segments = [];
  let next = 0;
  let capacity = Math.max(2, Math.floor(maxSegments));
  let last = null;
  let version = 0;
  const push = segment => {
    if (segments.length < capacity) segments.push(segment);
    else { segments[next % capacity] = segment; next = (next + 1) % capacity; }
  };
  return {
    get segments() { return segments; },
    get version() { return version; },
    get capacity() { return capacity; },
    /** Lay marks for this frame; returns the number of new segments. */
    lay(car, slip, now) {
      if (!(slip > SLIP.marksAbove)) { last = null; return 0; }
      const points = REAR_WHEELS.map(wheel => wheelPoint(car, wheel));
      if (!last) { last = points; return 0; }
      if (Math.hypot(points[0].x - last[0].x, points[0].z - last[0].z) < SKID.spacing) return 0;
      // A jump (teleport, quick travel) is not a skid.
      if (Math.hypot(points[0].x - last[0].x, points[0].z - last[0].z) > 3) { last = points; return 0; }
      const strength = clamp01((slip - SLIP.marksAbove) / (1 - SLIP.marksAbove) * 0.7 + 0.3);
      for (let i = 0; i < points.length; i++) {
        const a = last[i], b = points[i];
        push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, length: Math.hypot(b.x - a.x, b.z - a.z), rotation: Math.atan2(b.x - a.x, b.z - a.z), born: now, strength });
      }
      last = points;
      version++;
      return points.length;
    },
    /** Current opacity of a segment, 0..1 (fresh marks are darkest). */
    opacity(segment, now) {
      const age = Math.max(0, now - segment.born);
      return clamp01(1 - age / lifetime) * segment.strength;
    },
    setCapacity(value) {
      const cap = Math.max(2, Math.floor(value));
      if (cap === capacity) return;
      // Keep the newest marks in age order.
      const ordered = [...segments.slice(next), ...segments.slice(0, next)].slice(-cap);
      segments.length = 0; segments.push(...ordered);
      next = 0; capacity = cap; version++;
    },
    clear() { segments.length = 0; next = 0; last = null; version++; },
    breakTrail() { last = null; },
  };
}

/** Fewer skid marks when the adaptive quality system is rendering below native resolution. */
export function skidCapacityFor(quality) {
  const scale = Number(quality?.scale) || 1;
  const base = Number(quality?.base) || 1;
  if (scale > base + 0.6) return 80;
  if (scale > base + 0.2) return 150;
  return SKID.maxSegments;
}
