import { Color3, PBRMaterial, SceneLoader, StandardMaterial, TransformNode, type Scene, type ShadowGenerator } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CITY_ORIGIN, type City } from './cityLayout.mjs';
import { buildRoadGraph, createTraffic, stepTraffic, trafficPoses, type TrafficObstacle } from './cityTraffic.mjs';

/** Paint colours for traffic: the authored sedan is repainted, one shared material per colour. */
const PAINTS = ['#b3261e', '#e8e6e1', '#1f3b63', '#2b2d31', '#8a9399', '#2f6b45'];
const VISIBLE_RANGE = 170;

export type TrafficCarState = { x: number; z: number; rotation: number; speed: number };
export type CityTraffic = {
  /** Advance the traffic; `obstacles` are world positions it must stop for (the player, your car). */
  update: (seconds: number, focus: { x: number; z: number }, obstacles: ReadonlyArray<TrafficObstacle>) => void;
  /** Traffic cars in world coordinates, for your car's collisions. */
  cars: () => TrafficCarState[];
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};

/**
 * Living downtown: AI cars on the real street network. One template per paint
 * colour, cloned for every car; cars far from the player are hidden. Resolves null if the car model can't load (downtown stays as it was).
 */
export async function loadCityTraffic(scene: Scene, city: City, count: number, shadows?: ShadowGenerator): Promise<CityTraffic | null> {
  const graph = buildRoadGraph(city.roads);
  if (!graph.edges.length) return null;
  const container = await SceneLoader.LoadAssetContainerAsync('/models/environment/', 'sedan.glb', scene).catch(() => null);
  if (!container || scene.isDisposed) { container?.dispose(); return null; }

  // One hidden template per paint, each with its own copy of the body paint material.
  const templates = PAINTS.map((hex, index) => {
    const entries = container.instantiateModelsToScene(name => `traffic template ${index} ${name}`, true);
    const root = new TransformNode(`traffic template ${index}`, scene);
    for (const node of entries.rootNodes) node.parent = root;
    for (const mesh of root.getChildMeshes()) {
      const material = mesh.material;
      if (material && /paint/i.test(material.name)) {
        if (material instanceof PBRMaterial) material.albedoColor = Color3.FromHexString(hex);
        else if (material instanceof StandardMaterial) material.diffuseColor = Color3.FromHexString(hex);
      }
      mesh.isPickable = false;
    }
    root.setEnabled(false);
    return root;
  });

  let traffic = createTraffic(graph, count, 2026, []);
  const roots = traffic.cars.map(car => {
    // Full clones (sharing the paint material): instances of a hidden template may not draw.
    const root = templates[car.paint % templates.length].instantiateHierarchy(null, { doNotInstantiate: true }, (source, clone) => {
      clone.name = `traffic car ${car.id} ${source.name}`;
    }) as TransformNode;
    root.setEnabled(false);
    for (const mesh of root.getChildMeshes()) {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      shadows?.addShadowCaster(mesh, false);
    }
    return root;
  });
  let visible = false;
  let world: TrafficCarState[] = [];

  return {
    update(seconds, focus, obstacles) {
      if (!visible) return;
      const local = obstacles.map(o => ({ x: o.x - CITY_ORIGIN.x, z: o.z - CITY_ORIGIN.z, radius: o.radius }));
      traffic = stepTraffic(graph, traffic, seconds, local);
      const poses = trafficPoses(graph, traffic);
      world = poses.map(pose => ({ x: CITY_ORIGIN.x + pose.x, z: CITY_ORIGIN.z + pose.z, rotation: pose.rotation, speed: pose.speed }));
      world.forEach((car, index) => {
        const root = roots[index];
        const near = Math.hypot(car.x - focus.x, car.z - focus.z) < VISIBLE_RANGE;
        if (root.isEnabled() !== near) root.setEnabled(near);
        if (!near) return;
        root.position.set(car.x, 0, car.z);
        root.rotation.y = car.rotation;
      });
    },
    cars: () => world,
    setVisible(next) {
      visible = next;
      if (!next) for (const root of roots) root.setEnabled(false);
    },
    dispose() {
      for (const root of roots) root.dispose();
      for (const template of templates) template.dispose(false, true);
      container.dispose();
    },
  };
}
