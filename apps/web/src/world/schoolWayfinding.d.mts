export type SchoolWaypoint = {
  distance: number | null;
  direction: 'unknown' | 'at entrance' | 'ahead' | 'behind' | 'left' | 'right';
};
export function schoolWaypoint(
  position: { x: number; z: number },
  cameraForward?: { x: number; z: number },
): SchoolWaypoint;
