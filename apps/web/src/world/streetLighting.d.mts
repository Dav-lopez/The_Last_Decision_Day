import type { Scene, DirectionalLight, HemisphericLight } from '@babylonjs/core';
export declare function createStreetLighting(scene: Scene, sun: DirectionalLight, sky: HemisphericLight): {
  setEvening(evening: boolean): void;
  dispose(): void;
};
