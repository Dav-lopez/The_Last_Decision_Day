import { Color3, Mesh, MultiMaterial, PBRMaterial, RawTexture, Scene, SceneLoader, Texture, TransformNode, VertexBuffer, type AbstractMesh, type AnimationGroup, type Material } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ZONE_MATERIALS, dressZones, type Look, type Zone } from './appearance.mjs';
import { faceTarget, type Emotion } from './facialEmotions';
import { EMPTY_EFFECTS, smoothFacialEffects, targetFacialEffects } from './facialEffects';
import { dropletCycle, stepDropletClock } from './facialDroplets.mjs';
import { skinSurface, hairSurface, skinRoughness } from './surfaceShading.mjs';
import { planarSkinUV, skinMicroNormalMap } from './skinMicroNormalMap.mjs';
import { stepBlink } from './blinkCycle.mjs';
import { advanceSharedFacialMorph } from './facialMorphSync.mjs';
import { idleGazeTarget } from './gazeDynamics.mjs';
import { emotionHeadTarget, stepEmotionHeadPose } from './emotionalHeadPose.mjs';
import { createEmotionalHeadRig } from './emotionalHeadRig.mjs';
import { actionFacialWeight } from './actionFacial.mjs';
import { composeFacialLayer } from './facialLayerBlend.mjs';
import { stepSpeechOverlay, remoteCuedSpeechWeight } from './speechOverlay.mjs';
import type { SpeechCue } from './npcSpeechCues.mjs';
import { blendHumanWeights, classifyHumanMotion, HUMAN_WALK_SPEED, HUMAN_RUN_SPEED } from './humanMotion.mjs';
import { normalizeRiggedVisual } from './riggedPresentation.mjs';
import { startAction, stepAction, stopAction, type ActionState } from './actionMixer.mjs';
import type { BoundAction } from './characterActions';

export type RiggedAvatar = {
  root: TransformNode;
  applyLook: (look: Look) => void;
  setEmotion: (emotion: Emotion) => void;
  /** Drive remote chat mouth morphs without requiring a body animation clip. */
  setSpeaking: (speaking: boolean, cues?: ReadonlyArray<SpeechCue>, elapsed?: number) => void;
  /** Clips from characterActions, bound to this character's bones. */
  setActions: (actions: Map<string, BoundAction>) => void;
  /** Play an action over locomotion (one at a time); false if it isn't available. */
  playAction: (name: string, loop?: boolean) => boolean;
  stopAction: () => void;
  readonly action: string | null;
  /** Lean the whole body (radians): roll about the facing axis, pitch forward. Smoothed. */
  setLean: (roll: number, pitch: number) => void;
  /** Bones (transform nodes) of this character copy. */
  readonly bones: ReadonlyArray<TransformNode>;
  update: (speed: number, deltaSeconds: number) => void;
  dispose: () => void;
};

const ZONE_BY_MATERIAL = new Map(Object.entries(ZONE_MATERIALS).map(([zone, name]) => [name, zone as Zone]));
const unprefixed = (name: string) => name.replace(/^.* (?=Student )/, '');

/**
 * One tiny GPU normal tile per Babylon scene, shared by the playable character
 * and every independently dressed NPC. Keep any artist-authored normal map.
 * Scene disposal releases the texture; no per-frame texture work is performed.
 */
const skinTiles = new WeakMap<Scene, RawTexture>();
function attachSkinPores(material: PBRMaterial) {
  if (material.bumpTexture) return;
  const scene = material.getScene();
  let tile = skinTiles.get(scene);
  if (!tile) {
    tile = RawTexture.CreateRGBATexture(skinMicroNormalMap(), 64, 64, scene,
      true, false, Texture.TRILINEAR_SAMPLINGMODE);
    tile.name = 'shared skin pore normals';
    tile.wrapU = Texture.WRAP_ADDRESSMODE;
    tile.wrapV = Texture.WRAP_ADDRESSMODE;
    tile.uScale = 5;
    tile.vScale = 5;
    tile.level = 0.24; // Pore shading, not large visible bumps.
    skinTiles.set(scene, tile);
  }
  material.bumpTexture = tile;
}

/** Populate only absent UVs on imported skin meshes; preserve authored UV maps. */
function ensureSkinUVs(meshes: ReadonlyArray<AbstractMesh>) {
  for (const mesh of meshes) {
    if (!(mesh instanceof Mesh) || mesh.isVerticesDataPresent(VertexBuffer.UVKind)) continue;
    const materials = mesh.material instanceof MultiMaterial ? mesh.material.subMaterials : [mesh.material];
    if (!materials.some(item => item instanceof PBRMaterial && unprefixed(item.name) === 'Student skin')) continue;
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const uvs = planarSkinUV(positions);
    if (uvs) mesh.setVerticesData(VertexBuffer.UVKind, uvs, false, 2);
  }
}

/**
 * Paints a character copy for a look: skin, hair colour and style, and each
 * outfit zone (sleeves, legs, socks, shoes, soles) as clothing or skin, plus
 * the skirt. Names may carry a clone prefix (NPC copies). Returns the skin
 * colour (linear) for the blush effect.
 */
export function dressCharacter(materials: ReadonlyArray<Material>, meshes: ReadonlyArray<AbstractMesh>, look: Look) {
  const dress = dressZones(look);
  ensureSkinUVs(meshes);
  const linear = (hex: string) => Color3.FromHexString(hex).toLinearSpace();
  const skin = linear(dress.skin);
  const hair = linear(dress.hairColour);
  const skinDetail = skinSurface([skin.r, skin.g, skin.b]);
  const hairDetail = hairSurface([hair.r, hair.g, hair.b]);
  for (const material of materials) {
    if (!(material instanceof PBRMaterial)) continue;
    const name = unprefixed(material.name);
    const zone = ZONE_BY_MATERIAL.get(name);
    if (name === 'Student skin') {
      attachSkinPores(material);
      material.albedoColor = skin.clone();
      material.subSurface.tintColor = Color3.FromArray(skinDetail.subsurfaceTint);
      material.subSurface.translucencyIntensity = skinDetail.translucencyIntensity;
    } else if (name === 'Student hair') {
      material.albedoColor = hair.clone();
      material.sheen.color = Color3.FromArray(hairDetail.sheenColor);
    }
    else if (zone) {
      const paint = dress.zones[zone];
      material.albedoColor = linear(paint.colour);
      material.metallic = 0;
      material.roughness = paint.roughness;
    } else if (name === 'Student skirt' && dress.skirt) {
      material.albedoColor = linear(dress.skirt.colour);
      material.metallic = 0;
      material.roughness = dress.skirt.roughness;
    } else if (name === 'Student lips') material.albedoColor = Color3.FromArray(skinDetail.lip);
    else if (name === 'Student cheek blush') material.albedoColor = Color3.FromArray(skinDetail.cheek);
  }
  for (const mesh of meshes) {
    const name = unprefixed(mesh.name);
    const hair = /^Student hair (\w+)/.exec(name);
    if (hair) mesh.setEnabled(dress.hair.includes(hair[1]));
    else if (name.startsWith('Student skirt')) mesh.setEnabled(Boolean(dress.skirt));
  }
  return skin;
}

/** Quarantine imports until a usable mesh, skeleton and every required clip exist. */
export async function loadRiggedAvatar(scene: Scene, parent: TransformNode, model = 'human.glb'): Promise<RiggedAvatar | null> {
  const container = await SceneLoader.LoadAssetContainerAsync('/models/', model, scene);
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
    ensureSkinUVs(container.meshes);
    // A lean node between the player and the model banks the body into turns.
    const leanNode = new TransformNode('rigged player lean', scene);
    leanNode.parent = parent;
    root.parent = leanNode;
    let lean = { roll: 0, pitch: 0, wantRoll: 0, wantPitch: 0 };
    let actions = new Map<string, BoundAction>();
    let action: ActionState | null = null;
    let actionGroup: AnimationGroup | null = null;
    // Facial shading: preserve the authored eye texture and avoid the flat,
    // plastic-looking response of the source's uniform roughness settings.
    // These are conservative PBR adjustments, not a substitute for a scanned
    // face, skin normal maps, eyelashes or expression blendshapes.
    for (const material of container.materials) {
      if (!(material instanceof PBRMaterial)) continue;
      if (material.name === 'Student skin') {
        attachSkinPores(material);
        material.metallic = 0;
        material.roughness = 0.82;
        material.subSurface.isTranslucencyEnabled = true;
        const defaultSkin = skinSurface([0.6, 0.42, 0.31]);
        material.subSurface.translucencyIntensity = defaultSkin.translucencyIntensity;
        material.subSurface.tintColor = Color3.FromArray(defaultSkin.subsurfaceTint);
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
        material.roughness = 0.72;
        // Restrained coloured PBR sheen avoids a plastic clear coat on hair.
        const hairDetail = hairSurface([0.06, 0.04, 0.07]);
        material.sheen.isEnabled = true;
        material.sheen.intensity = hairDetail.sheenIntensity;
        material.sheen.roughness = hairDetail.sheenRoughness;
        material.sheen.color = Color3.FromArray(hairDetail.sheenColor);
      } else if (material.name === 'Student lips') {
        material.metallic = 0;
        material.roughness = 0.65;
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
    let speaking = false;
    let speechOverlay = { elapsed: 0, weight: 0 };
    let speechCues: ReadonlyArray<SpeechCue> = [];
    let speechCueElapsed = 0;
    const facialTargets = container.meshes.flatMap(mesh => {
      const manager = mesh.morphTargetManager;
      return manager ? Array.from({ length: manager.numTargets }, (_, i) => manager.getTarget(i)) : [];
    });
    let effects = { ...EMPTY_EFFECTS };
    let baseSkin = new Color3(0.6, 0.42, 0.31);
    let baseBlush = Color3.FromArray(skinSurface([baseSkin.r, baseSkin.g, baseSkin.b]).cheek);
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
    let tearClock = { elapsed: 0, active: false };
    let sweatClock = { elapsed: 0, active: false };
    // Initialize with the full BlinkFrame type, including left/right eyelid values.
    let blinkState = stepBlink({ elapsed: 0, count: 0 }, 0);
    // Preserve the underlying emotional pose while a blink temporarily masks it.
    const expressionInfluences = new Map<string, { value: number; velocity: number }>();
    // A morph name may appear on several skinned facial surfaces in the same GLB.
    const frameExpressionWeights = new Map<string, number>();
    // Add restrained emotional head posture after authored bone animations,
    // restoring the base pose before each new animation frame.
    const headRig = createEmotionalHeadRig(scene, root!);
    let headPose = { pitch: 0, roll: 0 };
    let disposed = false;
    return {
      root,
      setEmotion(next) { emotion = next; },
      setSpeaking(next, cues, elapsed) {
        speaking = next === true;
        if (speaking && Array.isArray(cues) && cues.length && Number.isFinite(elapsed) && elapsed! >= 0) {
          speechCues = cues;
          speechCueElapsed = elapsed!;
        } else if (!speaking && speechCues.length) {
          // Hold a closed mouth through the release fade, including emote interruption.
          speechCueElapsed = speechCues[speechCues.length - 1].end;
        } else if (speaking) {
          // Legacy callers with no text track retain generic Talk articulation.
          speechCues = [];
          speechCueElapsed = 0;
        }
      },
      setActions(next) {
        for (const { group } of actions.values()) group.dispose();
        actions = next;
        action = null;
        actionGroup = null;
      },
      playAction(name, loop) {
        const clip = actions.get(name);
        if (!clip || disposed) return false;
        if (actionGroup && actionGroup !== clip.group) actionGroup.stop();
        actionGroup = clip.group;
        action = startAction(name, clip.duration, loop);
        clip.group.start(action.loop, 1, clip.group.from, clip.group.to);
        clip.group.setWeightForAllAnimatables(0);
        return true;
      },
      stopAction() { action = stopAction(action); },
      get action() { return action && action.stopAt === null ? action.name : null; },
      setLean(roll, pitch) { lean.wantRoll = Number.isFinite(roll) ? roll : 0; lean.wantPitch = Number.isFinite(pitch) ? pitch : 0; },
      get bones() { return root!.getChildTransformNodes(false); },
      applyLook(look) {
        baseSkin = dressCharacter(container.materials, container.meshes, look);
        baseBlush = Color3.FromArray(skinSurface([baseSkin.r, baseSkin.g, baseSkin.b]).cheek);
      },
      update(speed, deltaSeconds) {
        if (disposed) return;
        // Bad physics frames or background-tab resumes must not corrupt facial
        // morphs/materials or skip the animation transition in a single frame.
        const frameSeconds = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0;
        const movementSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
        effects = smoothFacialEffects(effects, targetFacialEffects(emotion, movementSpeed), frameSeconds);
        effectTime += frameSeconds;
        tearClock = stepDropletClock(tearClock, effects.tears, frameSeconds);
        sweatClock = stepDropletClock(sweatClock, effects.sweat, frameSeconds);
        for (const material of container.materials) {
          if (!(material instanceof PBRMaterial)) continue;
          if (material.name === 'Student skin') {
            // Legacy GLBs retain their old subtle warmth cue. With cheek
            // geometry, keep the body skin unchanged and fade in only cheeks.
            material.albedoColor = Color3.Lerp(baseSkin, baseBlush,
              hasCheekBlush ? 0 : effects.blush * 0.18);
            material.roughness = skinRoughness(effects.sweat);
          } else if (material.name === 'Student cheek blush') {
            material.alpha = Math.min(0.65, Math.max(0, effects.blush * 0.65));
          } else if (material.name === 'Student eyes') {
            material.clearCoat.intensity = 0.55 + effects.wateryEyes * 0.35;
          } else if (material.name.startsWith('Student tear ') || material.name.startsWith('Student sweat ')) {
            const kind = material.name.startsWith('Student tear ') ? 'tear' : 'sweat';
            const side = material.name.endsWith('Left') ? 'Left' : 'Right';
            const { opacity } = dropletCycle(kind === 'tear' ? tearClock.elapsed : sweatClock.elapsed, kind, side);
            material.alpha = Math.min(0.82, (kind === 'tear' ? effects.tears : effects.sweat) * opacity * 0.82);
          }
        }
        blinkState = stepBlink(blinkState, frameSeconds);
        // Advance the action before facial evaluation: the same fade drives both
        // the body clip and its speech articulation, including stop transitions.
        const step = stepAction(action, frameSeconds);
        action = step.state;
        headPose = stepEmotionHeadPose(
          headPose, emotionHeadTarget(emotion, movementSpeed, step.state?.name), frameSeconds,
        );
        headRig.setPose(headPose);
        speechOverlay = stepSpeechOverlay(speechOverlay, speaking, frameSeconds);
        if (!speaking && speechOverlay.weight === 0) speechCues = [];
        // Remote chat uses only facial morphs; body clips keep walking/running.
        const speechAction: ActionState | null = speechOverlay.weight > 0.001 && !speechCues.length
          ? { name: 'Talk', elapsed: speechOverlay.elapsed, loop: true, duration: 1, stopAt: null } : null;
        frameExpressionWeights.clear();
        for (const morph of facialTargets) {
          const dropletKind = morph.name.startsWith('tearTrack') ? 'tear'
            : morph.name.startsWith('sweatTrack') ? 'sweat' : null;
          if (dropletKind) {
            const side = morph.name.endsWith('Left') ? 'Left' : 'Right';
            morph.influence = dropletCycle(dropletKind === 'tear' ? tearClock.elapsed : sweatClock.elapsed, dropletKind, side).phase;
            continue;
          }
          const eyelid = morph.name === 'eyeBlinkLeft' || morph.name === 'eyeBlinkRight';
          if (eyelid) {
            // The blink curve already eases the eyelid. Passing it through the
            // slow expression filter prevents a full closure on short blinks.
            morph.influence = morph.name.endsWith('Left') ? blinkState.left : blinkState.right;
          } else {
            // Preserve facial muscle velocity across interrupted expressions.
            // Blink and droplet morphs retain their dedicated timing paths.
            morph.influence = advanceSharedFacialMorph(
              morph.name, morph.influence,
              composeFacialLayer(morph.name, emotion,
                faceTarget(emotion, morph.name),
                actionFacialWeight(morph.name, step.state, step.weight),
                speechCues.length
                   ? remoteCuedSpeechWeight(morph.name, speechCues, speechCueElapsed, speechOverlay.weight)
                   : actionFacialWeight(morph.name, speechAction, speechOverlay.weight),
                idleGazeTarget(morph.name, effectTime, emotion, movementSpeed)),
              frameSeconds, blinkState, expressionInfluences, frameExpressionWeights,
            );
          }
        }
        const target = classifyHumanMotion(movementSpeed);
        if (target !== transition.target) transition = { from: { ...weights }, target, elapsed: 0 };
        transition.elapsed = Math.min(0.2, transition.elapsed + frameSeconds);
        weights = blendHumanWeights(transition.from, transition.target, transition.elapsed);
        groups.walk!.speedRatio = Math.max(0.65, Math.min(1.6, movementSpeed / HUMAN_WALK_SPEED));
        groups.run!.speedRatio = Math.max(0.65, Math.min(1.6, movementSpeed / HUMAN_RUN_SPEED));
        // An action (talk, sit, drive, jump, dance…) takes over the body by its weight.
        if (actionGroup) {
          actionGroup.setWeightForAllAnimatables(step.weight);
          if (!action) { actionGroup.stop(); actionGroup = null; }
        }
        for (const state of ['idle', 'walk', 'run'] as const) groups[state]!.setWeightForAllAnimatables(weights[state] * (1 - step.weight));
        const ease = 1 - Math.exp(-frameSeconds * 8);
        lean.roll += (lean.wantRoll - lean.roll) * ease;
        lean.pitch += (lean.wantPitch - lean.pitch) * ease;
        leanNode.rotation.z = lean.roll;
        leanNode.rotation.x = lean.pitch;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const { group } of actions.values()) group.dispose();
        headRig.dispose();
        container.dispose();
        root?.dispose();
        leanNode.dispose();
      },
    };
  } catch (error) {
    container.dispose();
    root?.dispose();
    throw error;
  }
}
