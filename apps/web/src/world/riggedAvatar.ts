import { Color3, PBRMaterial, Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { colorFor, type Look } from './appearance.mjs';
import { faceTarget, approachFace, type Emotion } from './facialEmotions';
import { blendHumanWeights, classifyHumanMotion, HUMAN_WALK_SPEED, HUMAN_RUN_SPEED } from './humanMotion.mjs';

export type RiggedAvatar = {
  root: TransformNode;
  applyLook: (look: Look) => void;
  setEmotion: (emotion: Emotion) => void;
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
    // Facial shading: preserve the authored eye texture and avoid the flat,
    // plastic-looking response of the source's uniform roughness settings.
    // These are conservative PBR adjustments, not a substitute for a scanned
    // face, skin normal maps, eyelashes or expression blendshapes.
    for (const material of container.materials) {
      if (!(material instanceof PBRMaterial)) continue;
      if (material.name === 'Student skin') {
        material.metallic = 0;
        material.roughness = 0.82;
        material.subSurface.isTranslucencyEnabled = true;
        material.subSurface.translucencyIntensity = 0.13;
        material.subSurface.tintColor = new Color3(0.94, 0.71, 0.61);
        material.subSurface.minimumThickness = 0;
        material.subSurface.maximumThickness = 0.45;
      } else if (material.name === 'Student eyes') {
        material.metallic = 0;
        material.roughness = 0.16;
        material.clearCoat.isEnabled = true;
        material.clearCoat.intensity = 0.55;
        material.clearCoat.roughness = 0.12;
      } else if (material.name === 'Student hair') {
        material.metallic = 0;
        material.roughness = 0.69;
      }
    }
    for (const mesh of container.meshes) mesh.receiveShadows = true;

    let weights = { idle: 1, walk: 0, run: 0 };
    let transition = { from: { ...weights }, target: classifyHumanMotion(0), elapsed: 0 };
    for (const state of ['idle', 'walk', 'run'] as const) {
      const group = groups[state]!;
      group.weight = weights[state];
      group.start(true);
      group.setWeightForAllAnimatables(weights[state]);
    }
    let emotion: Emotion = 'neutral';
    const facialTargets = container.meshes.flatMap(mesh => {
      const manager = mesh.morphTargetManager;
      return manager ? Array.from({ length: manager.numTargets }, (_, i) => manager.getTarget(i)) : [];
    });
    let blinkTime = 0;
    let blinkCount = 0;
    let disposed = false;
    return {
      root,
      setEmotion(next) { emotion = next; },
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
        blinkTime += Math.max(0, Math.min(0.1, deltaSeconds));
        const interval = 2.8 + (blinkCount % 4) * 0.45;
        const blink = blinkTime > interval ? Math.max(0, 1 - Math.abs((blinkTime - interval) / 0.12 - 1)) : 0;
        if (blinkTime > interval + 0.24) { blinkTime = 0; blinkCount++; }
        for (const morph of facialTargets) {
          const eyelid = morph.name === 'eyeBlinkLeft' || morph.name === 'eyeBlinkRight';
          morph.influence = approachFace(morph.influence, Math.max(faceTarget(emotion, morph.name), eyelid ? blink : 0), deltaSeconds);
        }
        const target = classifyHumanMotion(speed);
        if (target !== transition.target) transition = { from: { ...weights }, target, elapsed: 0 };
        transition.elapsed = Math.min(0.2, transition.elapsed + deltaSeconds);
        weights = blendHumanWeights(transition.from, transition.target, transition.elapsed);
        groups.walk!.speedRatio = Math.max(0.65, Math.min(1.6, speed / HUMAN_WALK_SPEED));
        groups.run!.speedRatio = Math.max(0.65, Math.min(1.6, speed / HUMAN_RUN_SPEED));
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
