import type { CityBuilding } from './cityLayout.mjs';
import type { AwningSpan } from './facadeDesign.mjs';
type Point = readonly [number, number] | number[];
export type GroundQuad = [Point, Point, number[], number[]];
export type LampPool = { x: number; z: number; radius: number; strength: number };
export declare const AMBIENT: Readonly<{
  foot: number; footBand: number; footTop: number; liftBand: number; canyon: number; reach: number; step: number;
  contactWidth: number; contactAlpha: number; poolRadius: number; poolLit: number; poolUnlit: number;
}>;
export declare function contactShade(y: number): number;
export declare function wallBreaks(height: number, neighbourHeight?: number): number[];
export declare function canyonOcclusion(y: number, distance: number, neighbourHeight: number): number;
export declare function wallShade(y: number, distance?: number, neighbourHeight?: number): number;
export declare function buildingIndex(buildings: ReadonlyArray<Pick<CityBuilding, 'ring'>>, cell?: number): { at: (x: number, z: number, skip?: number) => number };
export declare function facingNeighbour(buildings: ReadonlyArray<Pick<CityBuilding, 'ring' | 'height'>>, index: { at: (x: number, z: number, skip?: number) => number },
  self: number, a: Point, b: Point, normal: Point): { distance: number; height: number };
export declare function edgeNormal(a: Point, b: Point): [number, number] | null;
export declare function contactStrips(ring: ReadonlyArray<Point>, isInsideOther?: (x: number, z: number) => boolean, width?: number): GroundQuad[];
export declare function awningShadow(span: Pick<AwningSpan, 'a' | 'b' | 'normal'>, reach?: number): GroundQuad;
export declare function contactFalloff(v: number): number;
export declare function lampPools(spots: ReadonlyArray<{ x: number; z: number; facing: number }>, clustered: boolean): LampPool[];
export declare function poolFalloff(r: number, radius?: number): number;
