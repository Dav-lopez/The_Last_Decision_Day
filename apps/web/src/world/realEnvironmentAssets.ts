import { Scene, SceneLoader, ShadowGenerator, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { cloneEnvironmentAtSites } from './environmentInstances.mjs';
import { PARKED_CARS } from './streetLayout.mjs';

/**
 * Original, checked-in GLBs. Keep procedural fallback geometry until every
 * replacement contains actual meshes. No third-party downloads at runtime.
 */
const assets = [
  { file: 'oak.glb', match: 'tree', sites: [[-8, 3, 1], [8, 3, 1.12], [-8, 8, 0.94], [8, 8, 1.06], [-4.8, -8.4, 0.88], [4.8, -8.4, 0.96]] },
  { file: 'house.glb', match: 'house', sites: [[-8.4, -5.05, 1], [8.4, -5.05, 1]] },
  { file: 'sedan.glb', match: 'car', sites: PARKED_CARS.map(car => [car.x, car.z, 1, car.rotation] as const) },
] as const;

/**
 * `onCarsReady` receives the authored sedan roots in PARKED_CARS order so the
 * driven car can be moved; it is not called if the sedan model fails to load.
 */
export async function upgradeNeighborhoodAssets(scene: Scene, signal: { cancelled: boolean }, shadows?: ShadowGenerator,
  onCarsReady?: (roots: TransformNode[]) => void): Promise<void> {
  for (const entry of assets) {
    if (signal.cancelled || scene.isDisposed) return;
    let root: TransformNode | undefined;
    try {
      const loaded = await SceneLoader.ImportMeshAsync('', '/models/environment/', entry.file, scene);
      if (signal.cancelled || scene.isDisposed) {
        loaded.meshes.forEach(mesh => mesh.dispose());
        continue;
      }
      root = new TransformNode(`authored ${entry.match} template`, scene);
      for (const mesh of loaded.meshes) {
        if (!mesh.parent) mesh.parent = root;
      }
      root.setEnabled(false);
      const instances = cloneEnvironmentAtSites(root, entry.sites);
      for (const instance of instances) {
        for (const mesh of instance.getChildMeshes()) {
          mesh.receiveShadows = true;
          mesh.checkCollisions = entry.match === 'house' || entry.match === 'car';
          shadows?.addShadowCaster(mesh, false);
        }
      }
      const oldNames = entry.match === 'tree'
        ? new Set(['tree trunk', 'tree angled branch', 'tree foliage cluster', 'tree irregular crown top'])
        : entry.match === 'house' ? new Set(['home', 'home pitched roof', 'home front door', 'home porch landing', 'home front window', 'home window vertical trim', 'home window sill', 'home garage door', 'garage horizontal seam', 'house window frame', 'house window glass', 'house window mullion', 'house front steps'])
          : new Set(['parked car fallback body', 'parked car fallback cabin', 'parked car fallback wheel']);
      for (const mesh of scene.meshes) {
        if (oldNames.has(mesh.name)) {
          mesh.setEnabled(false);
          shadows?.removeShadowCaster(mesh, false);
        }
      }
      if (entry.match === 'car') onCarsReady?.(instances);
      root.dispose();
    } catch (error) {
      root?.dispose();
      console.warn(`Environment model ${entry.file} failed; keeping procedural fallback`, error);
    }
  }
}
