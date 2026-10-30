import { ClusteredLightContainer, Color3, Mesh, MeshBuilder, PointLight, StandardMaterial, Vector3, type Scene } from '@babylonjs/core';
import { CITY_ORIGIN, streetLampSpots, type City, type CityCollider } from './cityLayout.mjs';

/** Clustered lighting needs WebGPU, or WebGL 2 with blendable float colour buffers. */
function clusteredLightingSupported(scene: Scene) {
  const engine = scene.getEngine() as unknown as { isWebGPU?: boolean; webGLVersion?: number; getCaps(): Record<string, unknown> };
  if (engine.isWebGPU) return true;
  const caps = engine.getCaps();
  return (engine.webGLVersion ?? 1) >= 2 && Boolean(caps.colorBufferFloat) && Boolean(caps.blendFloat ?? caps.textureFloatRender);
}

/**
 * Downtown at night: a street lamp every ~26 m along the real streets, each a
 * real point light. Babylon.js 9 clustered lighting bins them into screen
 * tiles so 100+ lights cost about as much as a handful; where it isn't
 * supported the lamp heads still glow, without casting light.
 */
export function buildCityLights(scene: Scene, city: City, collider: CityCollider) {
  const spots = streetLampSpots(city, collider);
  const steel = new StandardMaterial('city lamp steel', scene);
  steel.diffuseColor = Color3.FromHexString('#2f3337');
  const glass = new StandardMaterial('city lamp glass', scene);
  glass.diffuseColor = Color3.FromHexString('#fff1cf');
  const pole = MeshBuilder.CreateCylinder('city lamp pole', { height: 5.2, diameterTop: 0.09, diameterBottom: 0.16, tessellation: 8 }, scene);
  const arm = MeshBuilder.CreateBox('city lamp arm', { width: 0.06, height: 0.06, depth: 1.1 }, scene);
  const head = MeshBuilder.CreateBox('city lamp head', { width: 0.32, height: 0.14, depth: 0.5 }, scene);
  pole.material = steel; arm.material = steel; head.material = glass;
  const templates: Mesh[] = [pole, arm, head];
  for (const mesh of templates) { mesh.isVisible = false; mesh.isPickable = false; }
  const heads: Vector3[] = [];
  spots.forEach((spot, i) => {
    const x = CITY_ORIGIN.x + spot.x; const z = CITY_ORIGIN.z + spot.z;
    const fx = Math.sin(spot.facing); const fz = Math.cos(spot.facing);
    const p = pole.createInstance(`city lamp pole ${i}`); p.position.set(x, 2.6, z);
    const a = arm.createInstance(`city lamp arm ${i}`); a.position.set(x + fx * 0.5, 5.15, z + fz * 0.5); a.rotation.y = spot.facing;
    const h = head.createInstance(`city lamp head ${i}`); h.position.set(x + fx * 1.0, 5.05, z + fz * 1.0); h.rotation.y = spot.facing;
    for (const instance of [p, a, h]) { instance.isPickable = false; instance.freezeWorldMatrix(); }
    heads.push(new Vector3(x + fx * 1.0, 4.9, z + fz * 1.0));
  });

  let container: ClusteredLightContainer | null = null;
  const lights: PointLight[] = [];
  if (clusteredLightingSupported(scene)) {
    try {
      for (const [i, at] of heads.entries()) {
        const light = new PointLight(`city street light ${i}`, at, scene, true);
        light.diffuse = Color3.FromHexString('#ffd9a0');
        light.specular = new Color3(0.15, 0.12, 0.08);
        light.range = 11;
        light.intensity = 1.1;
        lights.push(light);
      }
      container = new ClusteredLightContainer('city street lights', lights, scene);
      container.maxRange = 12;
      container.setEnabled(false);
    } catch (error) {
      console.warn('Clustered lighting unavailable; street lamps glow without light', error);
      container?.dispose();
      container = null;
    }
  }

  return {
    lamps: spots.length,
    clustered: Boolean(container),
    setEvening(evening: boolean) {
      glass.emissiveColor = evening ? new Color3(1, 0.86, 0.55) : new Color3(0.12, 0.11, 0.09);
      container?.setEnabled(evening);
    },
    dispose() {
      container?.dispose();
      for (const light of lights) light.dispose();
      for (const mesh of templates) mesh.dispose();
      steel.dispose(); glass.dispose();
    },
  };
}
