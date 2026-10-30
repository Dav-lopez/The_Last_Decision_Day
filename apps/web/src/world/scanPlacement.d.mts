type V = { x: number; y: number; z: number };
export declare const SCAN_SPOT: Readonly<{ x: number; z: number; maxSize: number }>;
export declare const SCAN_FORMATS: readonly string[];
export declare function scanFormat(fileName: string): string | null;
export declare function fitScan(bounds: { min: V; max: V }, spot?: { x: number; z: number; maxSize: number }): { scale: number; position: V } | null;
