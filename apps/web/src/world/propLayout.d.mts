export type PropType = 'plant' | 'bench' | 'sofa' | 'armchair' | 'coffee_table' | 'dining_chair' | 'bed' | 'floor_lamp' | 'shelf' | 'desk' | 'teacher_desk';
export type PropSite = Readonly<{ id: string; type: PropType; x: number; z: number; rotation: number }>;
export declare const PROP_TYPES: Readonly<Record<PropType, Readonly<{ targetHeight: number; maxFootprint: number; halfX: number; halfZ: number }>>>;
export declare const PROP_SITES: ReadonlyArray<PropSite>;
export declare const PROP_BLOCKERS: ReadonlyArray<Readonly<{ id: string; minX: number; maxX: number; minZ: number; maxZ: number }>>;
export type PropBlocker = Readonly<{ id: string; minX: number; maxX: number; minZ: number; maxZ: number }>;
export declare function propBlocker(site: PropSite): PropBlocker;
export declare function propScale(type: string, size: ReadonlyArray<number> | undefined): number | null;
export declare function carFit(size: ReadonlyArray<number> | undefined, manualRotation?: number): { scale: number; rotation: number } | null;
