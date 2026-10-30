import { Color3, MeshBuilder, Scene, SceneLoader, ShadowGenerator, StandardMaterial, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { cloneEnvironmentAtSites } from './environmentInstances.mjs';
import { PROP_SITES, propScale, type PropType } from './propLayout.mjs';

export type PolyHavenAsset = { slot: string; id: string; name: string; file: string; placed: boolean; rotation: number; sizeMeters: number[] };
export type PolyHavenManifest = { license: string; assets: PolyHavenAsset[] };
const BASE = '/models/polyhaven/';

function material(scene: Scene, name: string, hex: string) {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = Color3.FromHexString(hex);
  result.specularColor = new Color3(0.08, 0.08, 0.08);
  return result;
}

/** Simple stand-ins sized like the props, so collisions always match something visible. */
function addFallbackProps(scene: Scene): Map<PropType, TransformNode[]> {
  const pot = material(scene, 'prop fallback terracotta', '#a9603f');
  const leaf = material(scene, 'prop fallback leaves', '#3f7a43');
  const wood = material(scene, 'prop fallback bench wood', '#8a6240');
  const metal = material(scene, 'prop fallback bench metal', '#2f3438');
  const roots = new Map<PropType, TransformNode[]>([['plant', []], ['bench', []]]);
  for (const site of PROP_SITES) {
    const root = new TransformNode(`prop fallback ${site.id}`, scene);
    root.position.set(site.x, 0, site.z);
    root.rotation.y = site.rotation;
    if (site.type === 'plant') {
      const vessel = MeshBuilder.CreateCylinder('prop fallback pot', { height: 0.45, diameterTop: 0.5, diameterBottom: 0.36, tessellation: 14 }, scene);
      vessel.position.y = 0.225; vessel.material = pot; vessel.parent = root;
      for (const [x, y, z, d] of [[0, 0.75, 0, 0.62], [0.14, 0.95, 0.06, 0.42], [-0.12, 0.92, -0.08, 0.44]]) {
        const bush = MeshBuilder.CreateSphere('prop fallback foliage', { diameter: d, segments: 8 }, scene);
        bush.position.set(x, y, z); bush.material = leaf; bush.parent = root;
      }
    } else {
      const seat = MeshBuilder.CreateBox('prop fallback bench seat', { width: 1.55, height: 0.08, depth: 0.42 }, scene);
      seat.position.y = 0.5; seat.material = wood; seat.parent = root;
      const back = MeshBuilder.CreateBox('prop fallback bench back', { width: 1.55, height: 0.38, depth: 0.06 }, scene);
      back.position.set(0, 0.82, -0.2); back.rotation.x = -0.12; back.material = wood; back.parent = root;
      for (const x of [-0.68, 0.68]) for (const z of [-0.16, 0.16]) {
        const leg = MeshBuilder.CreateBox('prop fallback bench leg', { width: 0.06, height: 0.5, depth: 0.06 }, scene);
        leg.position.set(x, 0.25, z); leg.material = metal; leg.parent = root;
      }
    }
    roots.get(site.type)?.push(root);
  }
  return roots;
}

/** Shape-check the manifest so a malformed or partial download never breaks the scene. */
export function readManifest(value: unknown): PolyHavenManifest | null {
  const manifest = value as PolyHavenManifest;
  if (!manifest || manifest.license !== 'CC0-1.0' || !Array.isArray(manifest.assets)) return null;
  const assets = manifest.assets.filter(asset => asset && typeof asset.slot === 'string' &&
    typeof asset.file === 'string' && /^[a-z_]+\.glb$/.test(asset.file) && Array.isArray(asset.sizeMeters));
  return { license: manifest.license, assets };
}

/**
 * Show stand-ins immediately, then replace each prop type with its Poly Haven
 * model when manifest.json and the GLB are available. Failures keep the stand-ins.
 * Resolves with the manifest (for credits) or null when no Poly Haven models shipped.
 */
export async function addNeighborhoodProps(scene: Scene, signal: { cancelled: boolean }, shadows?: ShadowGenerator): Promise<PolyHavenManifest | null> {
  const fallbacks = addFallbackProps(scene);
  for (const roots of fallbacks.values()) for (const root of roots) {
    for (const mesh of root.getChildMeshes()) { mesh.receiveShadows = true; shadows?.addShadowCaster(mesh, false); }
  }
  let manifest: PolyHavenManifest | null = null;
  try {
    const response = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
    if (!response.ok) return null;
    manifest = readManifest(await response.json());
  } catch {
    return null;
  }
  if (!manifest) return null;
  for (const type of ['plant', 'bench'] as const) {
    const asset = manifest.assets.find(entry => entry.slot === type && entry.placed);
    const scale = asset ? propScale(type, asset.sizeMeters) : null;
    if (!asset || !scale || signal.cancelled || scene.isDisposed) continue;
    let template: TransformNode | undefined;
    try {
      const loaded = await SceneLoader.ImportMeshAsync('', BASE, asset.file, scene);
      if (signal.cancelled || scene.isDisposed) { loaded.meshes.forEach(mesh => mesh.dispose()); return manifest; }
      template = new TransformNode(`polyhaven ${type} template`, scene);
      // Re-centre on the ground under the model so site coordinates mean the prop's footprint centre.
      const pivot = new TransformNode(`polyhaven ${type} pivot`, scene);
      pivot.parent = template;
      for (const mesh of loaded.meshes) if (!mesh.parent) mesh.parent = pivot;
      const { min, max } = pivot.getHierarchyBoundingVectors(true);
      pivot.position.set(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
      pivot.rotation.y = asset.rotation || 0;
      template.setEnabled(false);
      const sites = PROP_SITES.filter(site => site.type === type).map(site => [site.x, site.z, scale, site.rotation] as const);
      for (const instance of cloneEnvironmentAtSites(template, sites)) {
        for (const mesh of instance.getChildMeshes()) { mesh.receiveShadows = true; shadows?.addShadowCaster(mesh, false); }
      }
      for (const root of fallbacks.get(type) ?? []) {
        for (const mesh of root.getChildMeshes()) shadows?.removeShadowCaster(mesh, false);
        root.setEnabled(false);
      }
      template.dispose();
    } catch (error) {
      template?.dispose();
      console.warn(`Poly Haven ${type} model failed; keeping stand-in props`, error);
    }
  }
  return manifest;
}
