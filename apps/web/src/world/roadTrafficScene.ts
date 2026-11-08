import { Color3, PBRMaterial, SceneLoader, StandardMaterial, TransformNode, type Scene, type ShadowGenerator } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { OpenRoad } from './openRoad.mjs';
import { createRoadTraffic, roadTrafficPoses, stepRoadTraffic } from './roadTraffic.mjs';

const PAINTS = ['#b3261e', '#e8e6e1', '#1f3b63', '#2b2d31', '#8a9399', '#2f6b45'];
const VISIBLE_RANGE = 220;

export type RoadTrafficCar = { x: number; z: number; rotation: number; speed: number };
export type RoadTrafficView = {
  /** Advance; `viewer` is where you are, `obstacles` what the cars must stop for (you, your car). */
  update: (seconds: number, viewer: { x: number; z: number }, obstacles: ReadonlyArray<{ x: number; z: number; radius?: number }>) => void;
  cars: () => RoadTrafficCar[];
  dispose: () => void;
};

/** Cars driving the open road both ways (item 17b): the family sedan, repainted, one clone per car. */
export async function loadRoadTraffic(scene: Scene, road: OpenRoad, shadows?: ShadowGenerator): Promise<RoadTrafficView | null> {
  const container = await SceneLoader.LoadAssetContainerAsync('/models/environment/', 'sedan.glb', scene).catch(() => null);
  if (!container || scene.isDisposed) { container?.dispose(); return null; }
  let traffic = createRoadTraffic(road);
  const roots = traffic.cars.map(car => {
    const entries = container.instantiateModelsToScene(name => `road car ${car.id} ${name}`, true);
    const root = new TransformNode(`road car ${car.id}`, scene);
    for (const node of entries.rootNodes) node.parent = root;
    for (const mesh of root.getChildMeshes()) {
      const material = mesh.material;
      if (material && /paint/i.test(material.name)) {
        const hex = PAINTS[car.paint % PAINTS.length];
        if (material instanceof PBRMaterial) material.albedoColor = Color3.FromHexString(hex);
        else if (material instanceof StandardMaterial) material.diffuseColor = Color3.FromHexString(hex);
      }
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      shadows?.addShadowCaster(mesh, false);
    }
    root.setEnabled(false);
    return root;
  });
  let world: RoadTrafficCar[] = [];
  return {
    update(seconds, viewer, obstacles) {
      traffic = stepRoadTraffic(road, traffic, seconds, obstacles, [viewer]);
      const poses = roadTrafficPoses(road, traffic);
      world = poses.map(pose => ({ x: pose.x, z: pose.z, rotation: pose.rotation, speed: pose.speed }));
      poses.forEach((pose, index) => {
        const root = roots[index];
        const near = Math.hypot(pose.x - viewer.x, pose.z - viewer.z) < VISIBLE_RANGE;
        if (root.isEnabled() !== near) root.setEnabled(near);
        if (!near) return;
        root.position.set(pose.x, 0, pose.z);
        root.rotation.y = pose.rotation;
      });
    },
    cars: () => world,
    dispose() {
      for (const root of roots) root.dispose(false, true);
      container.dispose();
    },
  };
}
