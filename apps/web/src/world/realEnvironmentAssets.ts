import { Scene, SceneLoader, TransformNode, Vector3, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

/**
 * Optional artist-authored GLB replacements. Never fetch third-party assets at
 * runtime: only locally hosted, license-reviewed files may be used.
 */
const assets = [
  { file: 'oak.glb', match: 'tree', sites: [[-8, 3, 1], [8, 3, 1.12], [-8, 8, 0.94], [8, 8, 1.06], [-4.8, -8.4, 0.88], [4.8, -8.4, 0.96]] },
  { file: 'house.glb', match: 'house', sites: [[-8.4, -5.05, 1], [8.4, -5.05, 1]] },
] as const;

export async function upgradeNeighborhoodAssets(scene: Scene, signal: { cancelled: boolean }): Promise<void> {
  for (const entry of assets) {
    // Avoid unnecessary 404s when the optional asset hasn't been licensed yet.
    const url = `/models/environment/${entry.file}`;
    let response: Response;
    try { response = await fetch(url, { method: 'HEAD' }); }
    catch { continue; }
    if (!response.ok || signal.cancelled || scene.isDisposed) continue;
    try {
      const loaded = await SceneLoader.ImportMeshAsync('', '/models/environment/', entry.file, scene);
      if (signal.cancelled || scene.isDisposed) {
        loaded.meshes.forEach(mesh => mesh.dispose());
        continue;
      }
      const root = new TransformNode(`real ${entry.match} template`, scene);
      for (const mesh of loaded.meshes) {
        if (!mesh.parent) mesh.parent = root;
      }
      root.setEnabled(false);
      const instances: TransformNode[] = [];
      for (const [x, z, scale] of entry.sites) {
        const clone = root.clone(`real ${entry.match} ${x} ${z}`, null, true);
        if (!clone) continue;
        clone.position = new Vector3(x, 0, z);
        clone.scaling.scaleInPlace(scale);
        clone.setEnabled(true);
        instances.push(clone);
      }
      if (instances.length !== entry.sites.length) {
        instances.forEach(node => node.dispose());
        root.dispose();
        continue;
      }
      const oldNames = entry.match === 'tree'
        ? new Set(['tree trunk', 'tree angled branch', 'tree foliage cluster', 'tree irregular crown top'])
        : new Set(['home', 'home pitched roof', 'home front door', 'home porch landing', 'home front window', 'home window vertical trim', 'home window sill', 'home garage door', 'garage horizontal seam']);
      for (const mesh of scene.meshes) {
        if (oldNames.has(mesh.name)) mesh.setEnabled(false);
      }
      root.dispose();
    } catch (error) {
      console.warn(`Environment model ${entry.file} failed; keeping procedural fallback`, error);
    }
  }
}
