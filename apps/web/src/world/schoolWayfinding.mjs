import { SCHOOL_DOOR, isNearSchool } from './movement.mjs';

/** Camera-relative direction toward the reachable school doorway, not the building center. */
export function schoolWaypoint(position, cameraForward = { x: 0, z: -1 }) {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z))
    return { distance: null, direction: 'unknown' };

  const toX = SCHOOL_DOOR.x - position.x;
  const toZ = SCHOOL_DOOR.z - position.z;
  const distance = Math.hypot(toX, toZ);
  if (isNearSchool(position)) return { distance, direction: 'at entrance' };

  const headingLength = Math.hypot(cameraForward.x, cameraForward.z);
  const forwardX = Number.isFinite(headingLength) && headingLength > 1e-6
    ? cameraForward.x / headingLength : 0;
  const forwardZ = Number.isFinite(headingLength) && headingLength > 1e-6
    ? cameraForward.z / headingLength : -1;
  const forward = (toX * forwardX + toZ * forwardZ) / distance;
  const right = (toX * -forwardZ + toZ * forwardX) / distance;
  const direction = forward >= 0.65 ? 'ahead'
    : forward <= -0.65 ? 'behind'
      : right >= 0 ? 'right' : 'left';
  return { distance, direction };
}
