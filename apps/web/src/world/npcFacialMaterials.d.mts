import type { Material, AbstractMesh } from '@babylonjs/core';
import type { Look } from './appearance.mjs';
export type NpcSurfaceEffects = { tears: number; blush: number; sweat: number; wateryEyes: number };
export declare function createNpcFacialMaterials(
  materials: ReadonlyArray<Material>, meshes: ReadonlyArray<AbstractMesh>, look: Look, index?: number,
): { update(seconds: number, mood?: 'neutral' | 'happy' | 'sad', moving?: boolean, flinch?: number): NpcSurfaceEffects; reset(): void };
