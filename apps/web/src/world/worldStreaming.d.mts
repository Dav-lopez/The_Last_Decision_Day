export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
export type StreamShown = { town: boolean; city: boolean };
export declare const STREAMING: Readonly<{ showWithin: number; hideBeyond: number; town: Readonly<Rect>; cityMargin: number }>;
export declare function rectDistance(rect: Rect, point: { x: number; z: number }): number;
export declare function cityRect(halfSize: readonly number[], margin?: number): Rect;
export declare function streamVisibility(previous: StreamShown | null, point: { x: number; z: number }, city: Rect | null, place: string): StreamShown;
