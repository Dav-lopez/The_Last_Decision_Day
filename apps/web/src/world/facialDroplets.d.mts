export type DropletKind = 'tear' | 'sweat';
export type DropletSide = 'Left' | 'Right';
export function dropletCycle(seconds: number, kind: DropletKind, side: DropletSide): { phase: number; opacity: number };
export type DropletClock = { elapsed: number; active: boolean };
export function stepDropletClock(previous: DropletClock, intensity: number, seconds: number): DropletClock;
