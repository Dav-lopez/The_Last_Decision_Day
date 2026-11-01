export declare function tabListTarget(key: string, index: number, enabled: ReadonlyArray<boolean>, orientation?: 'horizontal' | 'vertical'): number | null;
export declare function trapTarget(index: number, count: number, shift: boolean): number | null;
export declare function initialFocus(preferred: ReadonlyArray<boolean>): number;
export declare function gpsDestinations<M extends { id: string; label: string; x: number; z: number; kind: string }>(markers: ReadonlyArray<M>, you: { x: number; z: number } | null): M[];
