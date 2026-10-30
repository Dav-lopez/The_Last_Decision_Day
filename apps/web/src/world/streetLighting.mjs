import { Color3, Color4, PBRMaterial, PointLight, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { STREET_LIGHTS } from './streetLayout.mjs';

/** Three bounded, non-shadow-casting lamps; daylight uses only sun and sky. */
export function createStreetLighting(scene, sun, sky) {
  const lamps = STREET_LIGHTS.map(({ x, z }, index) => {
    const light = new PointLight(`street lamp ${index + 1}`, new Vector3(x + (x < 0 ? 0.4 : -0.4), 3.85, z), scene);
    light.diffuse = Color3.FromHexString('#ffe0a6');
    light.specular = new Color3(0.2, 0.16, 0.1);
    light.range = 6;
    light.intensity = 0.85;
    return light;
  });
  // Babylon defers this notification until after the material constructor.
  const materialObserver = scene.onNewMaterialAddedObservable.add(material => {
    if (material instanceof StandardMaterial || material instanceof PBRMaterial) material.maxSimultaneousLights = 5;
  });
  for (const material of scene.materials) {
    if (material instanceof StandardMaterial || material instanceof PBRMaterial) material.maxSimultaneousLights = 5;
  }
  function setEvening(evening) {
    sky.intensity = evening ? 0.38 : 0.65;
    sky.groundColor = Color3.FromHexString(evening ? '#242b3d' : '#807664');
    sun.intensity = evening ? 0.42 : 1.2;
    sun.diffuse = Color3.FromHexString(evening ? '#ffc291' : '#fff4df');
    scene.clearColor = evening ? new Color4(0.16, 0.21, 0.32, 1) : new Color4(0.67, 0.83, 0.96, 1);
    scene.fogColor = new Color3(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.009;
    for (const light of lamps) light.setEnabled(evening);
    const lens = scene.getMaterialByName('environment lamp light');
    if (lens instanceof StandardMaterial) lens.emissiveColor = evening ? new Color3(1, 0.8, 0.45) : new Color3(0.2, 0.18, 0.13);
  }
  setEvening(false);
  return {
    setEvening,
    dispose() {
      scene.onNewMaterialAddedObservable.remove(materialObserver);
      for (const lamp of lamps) lamp.dispose();
    },
  };
}
