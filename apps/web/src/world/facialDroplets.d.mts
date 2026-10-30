export type DropletKind = 'tear' | 'sweat';
export type DropletSide = 'Left' | 'Right';
export function dropletCycle(seconds: number, kind: DropletKind, side: DropletSide): { phase: number; opacity: number };
