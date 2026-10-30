import { Color3, PBRMaterial, Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { colorFor, type Look } from './appearance.mjs';
import { faceTarget, approachFace, type Emotion } from './facialEmotions';
import { EMPTY_EFFECTS, smoothFacialEffects, targetFacialEffects } from './facialEffects';
import { dropletCycle } from './facialDroplets.mjs';
import { stepBlink } from './blinkCycle.mjs';
import { blendHumanWeights, classifyHumanMotion, HUMAN_WALK_SPEED, HUMAN_RUN_SPEED } from './humanMotion.mjs';
import { normalizeRiggedVisual } from './riggedPresentation.mjs';

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
    // Register the intact import hierarchy before parenting it to a scene-only
    // visual node. Reparenting first makes AssetContainer validation warn.
    container.addAllToScene();
    root = new TransformNode('rigged player visual', scene);
    for (const node of container.rootNodes) if (!node.parent) node.parent = root;

    // Source units are metres. Normalize by the rest-pose bounds, including hair,
    // and place the soles on the same ground used by collisions and the camera.
    normalizeRiggedVisual(root);
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
      } else if (material.name === 'Student cheek blush') {
        material.metallic = 0;
        material.roughness = 0.92;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
        material.alpha = 0;
      } else if (material.name.startsWith('Student tear ') || material.name.startsWith('Student sweat ')) {
        material.metallic = 0;
        material.roughness = material.name.startsWith('Student tear ') ? 0.09 : 0.18;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
        material.alpha = 0;
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
    let effects = { ...EMPTY_EFFECTS };
    let baseSkin = new Color3(0.6, 0.42, 0.31);
    const hasCheekBlush = container.materials.some(material => material.name === 'Student cheek blush');
    // Warn once when the checked-in GLB has not yet been regenerated with morphs.
    // Do not silently report working facial animation for a legacy model.
    const availableMorphNames = new Set(facialTargets.map(target => target.name));
    const essentialMorphNames = ['eyeBlinkLeft', 'eyeBlinkRight', 'browInnerUp'];
    const missingMorphs = essentialMorphNames.filter(name => !availableMorphNames.has(name));
    if (missingMorphs.length) {
      console.warn('[character] Facial morph geometry missing from human.glb:', missingMorphs.join(', '),
        'Regenerate the model with scripts/build-character.py and review the generated asset PR.');
    }
    let effectTime = 0;
    let blinkState = { elapsed: 0, count: 0 };
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
          if (part) {
            const selected = Color3.FromHexString(colorFor(part, look[part])).toLinearSpace();
            material.albedoColor = selected;
            if (part === 'skin') baseSkin = selected.clone();
          } else if (material.name === 'Student lips') {
            // Match the chosen skin tone while retaining a muted lip tint.
            const skin = Color3.FromHexString(colorFor('skin', look.skin)).toLinearSpace();
            material.albedoColor = Color3.Lerp(skin, new Color3(0.19, 0.055, 0.065), 0.35);
          } else if (material.name === 'Student cheek blush') {
            const skin = Color3.FromHexString(colorFor('skin', look.skin)).toLinearSpace();
            material.albedoColor = Color3.Lerp(skin, new Color3(0.74, 0.12, 0.17), 0.45);
          }
        }
      },
      update(speed, deltaSeconds) {
        if (disposed) return;
        // Bad physics frames or background-tab resumes must not corrupt facial
        // morphs/materials or skip the animation transition in a single frame.
        const frameSeconds = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0;
        const movementSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
        effects = smoothFacialEffects(effects, targetFacialEffects(emotion, movementSpeed), frameSeconds);
        effectTime += frameSeconds;
        for (const material of container.materials) {
          if (!(material instanceof PBRMaterial)) continue;
          if (material.name === 'Student skin') {
            // Legacy GLBs retain their old subtle warmth cue. With cheek
            // geometry, keep the body skin unchanged and fade in only cheeks.
            material.albedoColor = Color3.Lerp(baseSkin, new Color3(0.75, 0.24, 0.28),
              hasCheekBlush ? 0 : effects.blush * 0.18);
            material.roughness = 0.82 - effects.sweat * 0.12;
          } else if (material.name === 'Student cheek blush') {
            material.alpha = Math.min(0.65, Math.max(0, effects.blush * 0.65));
          } else if (material.name === 'Student eyes') {
            material.clearCoat.intensity = 0.55 + effects.wateryEyes * 0.35;
          } else if (material.name.startsWith('Student tear ') || material.name.startsWith('Student sweat ')) {
            const kind = material.name.startsWith('Student tear ') ? 'tear' : 'sweat';
            const side = material.name.endsWith('Left') ? 'Left' : 'Right';
            const { opacity } = dropletCycle(effectTime, kind, side);
            material.alpha = Math.min(0.82, (kind === 'tear' ? effects.tears : effects.sweat) * opacity * 0.82);
          }
        }
        blinkState = stepBlink(blinkState, frameSeconds);
        for (const morph of facialTargets) {
          const dropletKind = morph.name.startsWith('tearTrack') ? 'tear'
            : morph.name.startsWith('sweatTrack') ? 'sweat' : null;
          if (dropletKind) {
            const side = morph.name.endsWith('Left') ? 'Left' : 'Right';
            morph.influence = dropletCycle(effectTime, dropletKind, side).phase;
            continue;
          }
          const eyelid = morph.name === 'eyeBlinkLeft' || morph.name === 'eyeBlinkRight';
          const blink = eyelid ? (morph.name.endsWith('Left') ? blinkState.left : blinkState.right) : 0;
          morph.influence = approachFace(morph.influence, Math.max(faceTarget(emotion, morph.name), blink), frameSeconds);
        }
        const target = classifyHumanMotion(movementSpeed);
        if (target !== transition.target) transition = { from: { ...weights }, target, elapsed: 0 };
        transition.elapsed = Math.min(0.2, transition.elapsed + frameSeconds);
        weights = blendHumanWeights(transition.from, transition.target, transition.elapsed);
        groups.walk!.speedRatio = Math.max(0.65, Math.min(1.6, movementSpeed / HUMAN_WALK_SPEED));
        groups.run!.speedRatio = Math.max(0.65, Math.min(1.6, movementSpeed / HUMAN_RUN_SPEED));
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
