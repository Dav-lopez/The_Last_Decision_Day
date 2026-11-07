import type { Scene, DirectionalLight, HemisphericLight } from '@babylonjs/core';
export declare function createStreetLighting(scene: Scene, sun: DirectionalLight, sky: HemisphericLight): {
  setEvening(evening: boolean): void;
  setDayLight(light: { sun: number; sunColour: string; sky: number; ground: string }): void;
  dispose(): void;
};
