/**
 * Independent PBR facial reactions for cloned neighborhood characters.
 * NPCs already animate lips and brows; this supplies the missing material
 * response (watery eyes, complexion-aware cheeks, tears, sweat, skin sheen).
 * Every controller owns only the materials and morphs of its NPC clone.
 */
import { Color3, PBRMaterial } from '@babylonjs/core';
import { dressZones } from './appearance.mjs';
import { skinSurface, hairSurface, skinRoughness } from './surfaceShading.mjs';
import { calculateFacialEffectTargets, stepFacialEffectWeights } from './facialEffectDynamics.mjs';
import { dropletCycle, stepDropletClock } from './facialDroplets.mjs';
import { collectNpcSurfaceMorphs, npcFacialSurfaceResponse } from './npcFacialSurfaceResponse.mjs';

const zero = () => ({ tears: 0, blush: 0, sweat: 0, wateryEyes: 0 });
const finiteUnit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const originalName = name => name.replace(/^.* (?=Student )/, '');

/**
 * Materials must come from instantiateModelsToScene(..., true), which clones
 * them per resident. This controller never changes the shared source GLB.
 */
export function createNpcFacialMaterials(materials, meshes, look) {
  const { skin, hairColour } = dressZones(look);
  const skinRGB = Color3.FromHexString(skin).toLinearSpace();
  const hairRGB = Color3.FromHexString(hairColour).toLinearSpace();
  const complexion = skinSurface([skinRGB.r, skinRGB.g, skinRGB.b]);
  const sheen = hairSurface([hairRGB.r, hairRGB.g, hairRGB.b]);
  const surface = new Map();
  for (const material of materials) {
    if (!(material instanceof PBRMaterial)) continue;
    const name = originalName(material.name);
    surface.set(name, material);
    if (name === 'Student skin') {
      material.metallic = 0;
      material.subSurface.isTranslucencyEnabled = true;
      material.subSurface.tintColor = Color3.FromArray(complexion.subsurfaceTint);
      material.subSurface.translucencyIntensity = complexion.translucencyIntensity;
      material.subSurface.minimumThickness = 0;
      material.subSurface.maximumThickness = 0.45;
    } else if (name === 'Student eyes') {
      material.metallic = 0;
      material.roughness = 0.16;
      material.clearCoat.isEnabled = true;
      material.clearCoat.roughness = 0.12;
    } else if (name === 'Student hair') {
      material.metallic = 0;
      material.roughness = 0.72;
      material.sheen.isEnabled = true;
      material.sheen.color = Color3.FromArray(sheen.sheenColor);
      material.sheen.intensity = sheen.sheenIntensity;
      material.sheen.roughness = sheen.sheenRoughness;
    } else if (name === 'Student lips') {
      material.albedoColor = Color3.FromArray(complexion.lip);
      material.metallic = 0;
      material.roughness = 0.65;
    } else if (name === 'Student cheek blush') {
      material.albedoColor = Color3.FromArray(complexion.cheek);
      material.metallic = 0;
      material.roughness = 0.92;
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    } else if (/^Student (tear|sweat) (Left|Right)$/.test(name)) {
      material.metallic = 0;
      material.roughness = name.startsWith('Student tear ') ? 0.09 : 0.18;
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    }
  }
  // Read only this clone's existing blink and oral morphs after its facial
  // animation step; no extra textures, GLB targets, or per-frame mesh scans.
  const readSurfaceMorphs = collectNpcSurfaceMorphs(meshes);
  const tracks = [];
  for (const mesh of meshes) {
    const manager = mesh.morphTargetManager;
    if (!manager) continue;
    for (let i = 0; i < manager.numTargets; i++) {
      const morph = manager.getTarget(i);
      const match = /^(tear|sweat)Track(Left|Right)$/.exec(morph.name);
      if (match) tracks.push({ morph, kind: match[1], side: match[2] });
    }
  }
  let effects = zero();
  // Each resident and effect type owns its own episode clock. A shared world
  // phase made newly frightened or crying NPCs spawn droplets halfway down
  // the face; starting both clocks at zero preserves the tear-duct origin.
  let clocks = {
    tear: { elapsed: 0, active: false },
    sweat: { elapsed: 0, active: false },
  };

  function paint(neutralSurface = false) {
    const skinMaterial = surface.get('Student skin');
    if (skinMaterial) skinMaterial.roughness = skinRoughness(effects.sweat);
    const cheeks = surface.get('Student cheek blush');
    if (cheeks) cheeks.alpha = Math.min(0.65, effects.blush * 0.65);
    const response = npcFacialSurfaceResponse(effects.wateryEyes,
      neutralSurface ? {} : readSurfaceMorphs());
    const eyes = surface.get('Student eyes');
    if (eyes) {
      eyes.clearCoat.intensity = response.eyeIntensity;
      eyes.clearCoat.roughness = response.eyeRoughness;
    }
    const lips = surface.get('Student lips');
    if (lips) lips.roughness = response.lipRoughness;
    for (const kind of ['tear', 'sweat']) for (const side of ['Left', 'Right']) {
      const material = surface.get(`Student ${kind} ${side}`);
      if (material) {
        const { opacity } = dropletCycle(clocks[kind].elapsed, kind, side);
        material.alpha = clocks[kind].active
          ? Math.min(0.82, effects[kind === 'tear' ? 'tears' : 'sweat'] * opacity * 0.82)
          : 0;
      }
    }
    for (const { morph, kind, side } of tracks) {
      // Only animate visible droplets; hidden residents reset to neutral.
      morph.influence = clocks[kind].active
        ? dropletCycle(clocks[kind].elapsed, kind, side).phase : 0;
    }
  }
  paint();
  return {
    update(seconds, mood = 'neutral', moving = false, flinch = 0) {
      const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(0.1, seconds)) : 0;
      const startled = finiteUnit(flinch);
      const target = calculateFacialEffectTargets(startled > 0.2 ? 'fear' : mood, moving ? 3.1 : 0);
      // Friendly interactions warm the cheeks slightly; distress wets the eyes.
      if (mood === 'happy' && startled <= 0.2) target.blush = 0.25;
      effects = stepFacialEffectWeights(effects, target, dt);
      clocks.tear = stepDropletClock(clocks.tear, effects.tears, dt);
      clocks.sweat = stepDropletClock(clocks.sweat, effects.sweat, dt);
      paint();
      return { ...effects };
    },
    reset() {
      effects = zero();
      clocks = { tear: { elapsed: 0, active: false }, sweat: { elapsed: 0, active: false } };
      // Reset materials even if another animation system still owns an
      // active jaw or eyelid morph at the moment this NPC becomes hidden.
      paint(true);
      for (const { morph } of tracks) morph.influence = 0;
    },
  };
}
