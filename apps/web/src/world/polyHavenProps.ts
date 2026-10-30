import { Color3, MeshBuilder, Scene, SceneLoader, ShadowGenerator, StandardMaterial, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { cloneEnvironmentAtSites } from './environmentInstances.mjs';
import { PROP_SITES, propScale, type PropSite, type PropType } from './propLayout.mjs';
import { HOME_FURNITURE } from './homeInterior.mjs';

/** Every placed prop: street plants and benches plus the home's furniture. */
const ALL_SITES: ReadonlyArray<PropSite> = [...PROP_SITES, ...HOME_FURNITURE];

export type PolyHavenAsset = { slot: string; id: string; name: string; file: string; placed: boolean; rotation: number; sizeMeters: number[] };
export type PolyHavenManifest = { license: string; assets: PolyHavenAsset[] };
const BASE = '/models/polyhaven/';

function material(scene: Scene, name: string, hex: string) {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = Color3.FromHexString(hex);
  result.specularColor = new Color3(0.08, 0.08, 0.08);
  return result;
}

/**
 * The sun's shadow map is fitted to its casters. Furniture far away in the home
 * would stretch it and blur every street shadow, so only street props cast.
 */
const castsStreetShadow = (node: TransformNode) => Math.abs(node.position.z) < 20;

/** Simple stand-ins sized like the props, so collisions always match something visible. */
function addFallbackProps(scene: Scene): Map<PropType, TransformNode[]> {
  const m = {
    pot: material(scene, 'prop fallback terracotta', '#a9603f'),
    leaf: material(scene, 'prop fallback leaves', '#3f7a43'),
    wood: material(scene, 'prop fallback wood', '#8a6240'),
    metal: material(scene, 'prop fallback metal', '#2f3438'),
    fabric: material(scene, 'prop fallback sofa fabric', '#56708a'),
    cushion: material(scene, 'prop fallback cushion', '#c9b38f'),
    linen: material(scene, 'prop fallback bed linen', '#e8e4da'),
    blanket: material(scene, 'prop fallback blanket', '#7d5a8c'),
    shade: material(scene, 'prop fallback lamp shade', '#f4e2b8'),
  };
  m.shade.emissiveColor = new Color3(0.55, 0.45, 0.25);
  const roots = new Map<PropType, TransformNode[]>();
  for (const site of ALL_SITES) {
    const root = new TransformNode(`prop fallback ${site.id}`, scene);
    root.position.set(site.x, 0, site.z);
    root.rotation.y = site.rotation;
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: StandardMaterial) => {
      const mesh = MeshBuilder.CreateBox(`prop fallback ${name}`, { width: w, height: h, depth: d }, scene);
      mesh.position.set(x, y, z); mesh.material = mat; mesh.parent = root;
      return mesh;
    };
    const legs = (w: number, d: number, h: number, mat: StandardMaterial) => {
      for (const x of [-w, w]) for (const z of [-d, d]) box('leg', 0.06, h, 0.06, x, h / 2, z, mat);
    };
    switch (site.type) {
      case 'plant': {
        const vessel = MeshBuilder.CreateCylinder('prop fallback pot', { height: 0.45, diameterTop: 0.5, diameterBottom: 0.36, tessellation: 14 }, scene);
        vessel.position.y = 0.225; vessel.material = m.pot; vessel.parent = root;
        for (const [x, y, z, d] of [[0, 0.75, 0, 0.62], [0.14, 0.95, 0.06, 0.42], [-0.12, 0.92, -0.08, 0.44]]) {
          const bush = MeshBuilder.CreateSphere('prop fallback foliage', { diameter: d, segments: 8 }, scene);
          bush.position.set(x, y, z); bush.material = m.leaf; bush.parent = root;
        }
        break;
      }
      case 'bench':
        box('bench seat', 1.55, 0.08, 0.42, 0, 0.5, 0, m.wood);
        box('bench back', 1.55, 0.38, 0.06, 0, 0.82, -0.2, m.wood).rotation.x = -0.12;
        for (const x of [-0.68, 0.68]) for (const z of [-0.16, 0.16]) box('bench leg', 0.06, 0.5, 0.06, x, 0.25, z, m.metal);
        break;
      case 'sofa':
        box('sofa base', 2.05, 0.42, 0.85, 0, 0.32, 0, m.fabric);
        box('sofa back', 2.05, 0.55, 0.2, 0, 0.78, -0.33, m.fabric);
        for (const x of [-0.95, 0.95]) box('sofa arm', 0.18, 0.3, 0.85, x, 0.66, 0, m.fabric);
        for (const x of [-0.45, 0.45]) box('sofa cushion', 0.85, 0.12, 0.6, x, 0.59, 0.08, m.cushion);
        break;
      case 'armchair':
        box('armchair base', 0.85, 0.42, 0.85, 0, 0.32, 0, m.fabric);
        box('armchair back', 0.85, 0.6, 0.18, 0, 0.82, -0.33, m.fabric);
        for (const x of [-0.37, 0.37]) box('armchair arm', 0.14, 0.28, 0.85, x, 0.66, 0, m.fabric);
        break;
      case 'coffee_table':
        box('coffee table top', 1.08, 0.07, 0.62, 0, 0.5, 0, m.wood);
        legs(0.46, 0.24, 0.47, m.wood);
        break;
      case 'dining_chair':
        box('chair seat', 0.52, 0.06, 0.52, 0, 0.55, 0, m.wood);
        box('chair back', 0.52, 0.55, 0.05, 0, 0.85, -0.24, m.wood);
        legs(0.22, 0.22, 0.52, m.wood);
        break;
      case 'bed':
        box('bed frame', 1.68, 0.32, 2.35, 0, 0.2, 0, m.wood);
        box('bed mattress', 1.58, 0.24, 2.2, 0, 0.48, 0.05, m.linen);
        box('bed blanket', 1.62, 0.06, 1.35, 0, 0.62, 0.45, m.blanket);
        box('bed pillow', 1.1, 0.14, 0.42, 0, 0.66, -0.82, m.linen);
        box('bed headboard', 1.68, 1.0, 0.1, 0, 0.55, -1.15, m.wood);
        break;
      case 'floor_lamp': {
        const pole = MeshBuilder.CreateCylinder('prop fallback lamp pole', { height: 1.65, diameter: 0.05, tessellation: 8 }, scene);
        pole.position.y = 0.85; pole.material = m.metal; pole.parent = root;
        const base = MeshBuilder.CreateCylinder('prop fallback lamp base', { height: 0.05, diameter: 0.38, tessellation: 16 }, scene);
        base.position.y = 0.025; base.material = m.metal; base.parent = root;
        const lampShade = MeshBuilder.CreateCylinder('prop fallback lamp shade', { height: 0.38, diameterTop: 0.28, diameterBottom: 0.44, tessellation: 16 }, scene);
        lampShade.position.y = 1.78; lampShade.material = m.shade; lampShade.parent = root;
        break;
      }
      case 'shelf':
        for (const x of [-0.7, 0.7]) box('shelf side', 0.05, 2.05, 0.4, x, 1.025, 0, m.wood);
        for (let level = 0; level < 5; level++) box('shelf board', 1.4, 0.04, 0.4, 0, 0.06 + level * 0.48, 0, m.wood);
        for (let i = 0; i < 9; i++) box('shelf book', 0.08, 0.3 + (i % 3) * 0.04, 0.26, -0.55 + i * 0.13, 0.25 + 0.48 * (1 + (i % 3)), 0.02,
          [m.blanket, m.fabric, m.pot][i % 3]);
        break;
    }
    if (!roots.has(site.type)) roots.set(site.type, []);
    roots.get(site.type)!.push(root);
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
 * Street props and home furniture. Show stand-ins immediately, then replace each prop type with its Poly Haven
 * model when manifest.json and the GLB are available. Failures keep the stand-ins.
 * Resolves with the manifest (for credits) or null when no Poly Haven models shipped.
 */
export async function addWorldProps(scene: Scene, signal: { cancelled: boolean }, shadows?: ShadowGenerator): Promise<PolyHavenManifest | null> {
  const fallbacks = addFallbackProps(scene);
  for (const roots of fallbacks.values()) for (const root of roots) {
    for (const mesh of root.getChildMeshes()) { mesh.receiveShadows = true; if (castsStreetShadow(root)) shadows?.addShadowCaster(mesh, false); }
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
  for (const type of fallbacks.keys()) {
    const asset = manifest.assets.find(entry => entry.slot === type);
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
      const sites = ALL_SITES.filter(site => site.type === type).map(site => [site.x, site.z, scale, site.rotation] as const);
      for (const instance of cloneEnvironmentAtSites(template, sites)) {
        for (const mesh of instance.getChildMeshes()) { mesh.receiveShadows = true; if (castsStreetShadow(instance)) shadows?.addShadowCaster(mesh, false); }
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
