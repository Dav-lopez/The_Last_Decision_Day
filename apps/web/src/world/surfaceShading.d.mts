/** Linear-space RGB, matching Babylon Color3 values. */
export type LinearRGB = readonly number[];
export type SkinSurface = { subsurfaceTint: number[]; lip: number[]; cheek: number[]; translucencyIntensity: number };
export type HairSurface = { sheenColor: number[]; sheenIntensity: number; sheenRoughness: number };
export declare function skinSurface(linearSkin: LinearRGB): SkinSurface;
export declare function hairSurface(linearHair: LinearRGB): HairSurface;
export declare function skinRoughness(sweat: number): number;
