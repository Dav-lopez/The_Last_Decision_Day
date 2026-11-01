import type { Scene } from '@babylonjs/core';
import { createGearbox, createSkidMarks, engineFrequency, skidCapacityFor, stepGearbox, tyreSlip, type Gear } from './carFeel.mjs';
import { createSkidMarksMesh } from './skidMarksScene';
import type { CarState, DriveInput } from './vehicleDrive.mjs';

/**
 * Driving feel for the car you drive (loaded the first time you get in a car,
 * so it stays out of the start-up bundle): gearbox revs for the engine note,
 * tyre slip for the squeal, and skid marks on the road.
 */
export function createDriveFeel(scene: Scene) {
  let gearbox = createGearbox();
  let slip = 0;
  let throttle = 0;
  const marks = createSkidMarks();
  const mesh = createSkidMarksMesh(scene, marks);
  return {
    get gear(): Gear { return gearbox.gear; },
    get marks() { return marks.segments.length; },
    /** Engine and tyre state for the audio director. */
    sound() { return { rpm: gearbox.rpm, frequency: engineFrequency(gearbox.rpm, gearbox.gear), throttle, slip }; },
    get slip() { return slip; },
    get rpm() { return gearbox.rpm; },
    step(before: CarState, next: CarState & { collided: boolean }, controls: DriveInput, yawRate: number, seconds: number, now: number, quality: { scale?: number; base?: number }) {
      const shifted = stepGearbox(gearbox, next.speed, controls.throttle, seconds);
      gearbox = { gear: shifted.gear, rpm: shifted.rpm, shiftTimer: shifted.shiftTimer };
      throttle = Math.abs(controls.throttle) > 0 && !controls.handbrake ? 1 : 0;
      slip = next.collided ? 0 : tyreSlip({ speed: next.speed, yawRate, acceleration: seconds > 0 ? (next.speed - before.speed) / seconds : 0, handbrake: controls.handbrake });
      marks.setCapacity(skidCapacityFor(quality));
      marks.lay(next, slip, now);
    },
    /** A fresh start when you get in (or out of) a car. */
    reset() { gearbox = createGearbox(); slip = 0; throttle = 0; marks.breakTrail(); },
    update(seconds: number, now: number) { mesh.update(seconds, now); },
    dispose() { mesh.dispose(); },
  };
}
export type DriveFeel = ReturnType<typeof createDriveFeel>;
