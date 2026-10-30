export type PropType = 'plant' | 'bench';
export type PropSite = Readonly<{ id: string; type: PropType; x: number; z: number; rotation: number }>;
export declare const PROP_TYPES: Readonly<Record<PropType, Readonly<{ targetHeight: number; maxFootprint: number; halfX: number; halfZ: number }>>>;
export declare const PROP_SITES: ReadonlyArray<PropSite>;
export declare const PROP_BLOCKERS: ReadonlyArray<Readonly<{ id: string; minX: number; maxX: number; minZ: number; maxZ: number }>>;
export declare function propScale(type: string, size: ReadonlyArray<number> | undefined): number | null;
