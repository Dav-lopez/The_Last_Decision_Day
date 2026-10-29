import { Scene, SceneLoader, TransformNode, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const SCHOOL_ORIGINALS = new Set(['school building', 'school roof', 'school entrance']);

/** Same quarantined-asset pattern as riggedAvatar: validate before replacing the fallback. */
export async function loadSchoolEnvironment(scene: Scene): Promise<{ meshes: AbstractMesh[]; dispose: () => void } | null> {
  const container = await SceneLoader.LoadAssetContainerAsync('/models/', 'school.gltf', scene);
  if (scene.isDisposed) { container.dispose(); return null; }
  try {
    const meshes = container.meshes.filter(mesh => mesh.getTotalVertices() > 0);
    if (!meshes.length || meshes.some(mesh => !mesh.getBoundingInfo())) {
      throw new Error('School asset has no valid geometry');
    }
    const parent = new TransformNode('school authored glTF', scene);
    parent.position.set(0, 0, -9.12);
    for (const node of container.rootNodes) if (!node.parent) node.parent = parent;
    container.addAllToScene();
    meshes.forEach(mesh => { mesh.receiveShadows = true; });
    const fallback = scene.meshes.filter(mesh => SCHOOL_ORIGINALS.has(mesh.name));
    fallback.forEach(mesh => mesh.setEnabled(false));
    return {
      meshes,
      dispose() { fallback.forEach(mesh => { if (!scene.isDisposed) mesh.setEnabled(true); }); container.dispose(); parent.dispose(); },
    };
  } catch (error) {
    container.dispose();
    throw error;
  }
}
