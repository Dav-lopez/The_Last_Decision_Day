import { Color3, PBRMaterial, Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { colorFor, type Look } from './appearance.mjs';
import { blendLocomotion, type LocomotionWeights } from './locomotion.mjs';

export type RiggedAvatar = {
  root: TransformNode;
  applyLook: (look: Look) => void;
  update: (speed: number, deltaSeconds: number) => void;
  dispose: () => void;
};

/** Quarantine imports until a usable mesh, skeleton and every required clip exist. */
export async function loadRiggedAvatar(scene: Scene, parent: TransformNode): Promise<RiggedAvatar | null> {
  const container = await SceneLoader.LoadAssetContainerAsync('/models/', 'human.glb', scene);
  if (scene.isDisposed) { container.dispose(); return null; }
  let root: TransformNode | undefined;
  try {
    const groups = {
      idle: container.animationGroups.find(group => group.name === 'Idle'),
      walk: container.animationGroups.find(group => group.name === 'Walk'),
      run: container.animationGroups.find(group => group.name === 'Run'),
    };
    if (!groups.idle || !groups.walk || !groups.run ||
      !container.skeletons.some(skeleton => skeleton.bones.length > 0) ||
      !container.meshes.some(mesh => mesh.getTotalVertices() > 0)) {
      throw new Error('Character asset is missing its mesh, skeleton or locomotion clips.');
    }
    for (const group of container.animationGroups) group.stop();
    root = new TransformNode('rigged player visual', scene);
    for (const node of container.rootNodes) if (!node.parent) node.parent = root;
    container.addAllToScene();

    // Source units are metres. Normalize by the rest-pose bounds, including hair,
    // and place the soles on the same ground used by collisions and the camera.
    const { min, max } = root.getHierarchyBoundingVectors(true);
    const height = max.y - min.y;
    if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) || height < 0.1 || height > 100) {
      throw new Error('Character asset has invalid bounds.');
    }
    const scale = 2.2 / height;
    root.scaling.setAll(scale);
    root.position.set(-(min.x + max.x) / 2 * scale, -min.y * scale, -(min.z + max.z) / 2 * scale);
    root.parent = parent;
    for (const mesh of container.meshes) mesh.receiveShadows = true;

    let weights: LocomotionWeights = { idle: 1, walk: 0, run: 0 };
    for (const state of ['idle', 'walk', 'run'] as const) {
      const group = groups[state]!;
      group.weight = weights[state];
      group.start(true);
      group.setWeightForAllAnimatables(weights[state]);
    }
    let disposed = false;
    return {
      root,
      applyLook(look) {
        for (const material of container.materials) {
          if (!(material instanceof PBRMaterial)) continue;
          const part = material.name === 'Student skin' ? 'skin'
            : material.name === 'Student jacket' ? 'outfit'
              : material.name === 'Student hair' ? 'hair' : null;
          if (part) material.albedoColor = Color3.FromHexString(colorFor(part, look[part])).toLinearSpace();
        }
      },
      update(speed, deltaSeconds) {
        if (disposed) return;
        weights = blendLocomotion(weights, speed, deltaSeconds);
        groups.walk!.speedRatio = Math.max(0.65, Math.min(1.6, speed / 2.6));
        groups.run!.speedRatio = Math.max(0.65, Math.min(1.6, speed / 5.5));
        for (const state of ['idle', 'walk', 'run'] as const) groups[state]!.setWeightForAllAnimatables(weights[state]);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        container.dispose();
        root?.dispose();
      },
    };
  } catch (error) {
    container.dispose();
    root?.dispose();
    throw error;
  }
}
