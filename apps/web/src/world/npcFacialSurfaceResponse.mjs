/**
 * Per-resident, morph-responsive facial PBR values. A shared eye material
 * cannot dim just one eye, so attenuate the corneal highlight only when BOTH
 * lids close; a wink must not darken the other open eye.
 *
 * This is a material response to existing GLB morphs, not a replacement for
 * corneal geometry or an assertion that the checked-in GLB has those morphs.
 */
const unit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const NAMES = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthOpen'];

/** Cache only morph references at construction; never scan meshes each frame. */
export function collectNpcSurfaceMorphs(meshes) {
  const tracks = new Map(NAMES.map(name => [name, []]));
  for (const mesh of meshes ?? []) {
    const manager = mesh?.morphTargetManager;
    if (!manager || !Number.isInteger(manager.numTargets)) continue;
    for (let i = 0; i < manager.numTargets; i++) {
      const morph = manager.getTarget(i);
      if (tracks.has(morph?.name)) tracks.get(morph.name).push(morph);
    }
  }
  return () => {
    const read = name => {
      let influence = 0;
      for (const morph of tracks.get(name)) influence = Math.max(influence, unit(morph.influence));
      return influence;
    };
    return {
      blinkLeft: read('eyeBlinkLeft'),
      blinkRight: read('eyeBlinkRight'),
      jawOpen: read('jawOpen'),
      mouthOpen: read('mouthOpen'),
    };
  };
}

/** Deterministic PBR response, clamped for missing/invalid legacy morphs. */
export function npcFacialSurfaceResponse(wateryEyes = 0, face = {}) {
  const wet = unit(wateryEyes);
  const closed = Math.min(unit(face.blinkLeft), unit(face.blinkRight));
  const articulation = Math.max(unit(face.jawOpen), unit(face.mouthOpen));
  return {
    eyeIntensity: (0.55 + 0.35 * wet) * (1 - 0.65 * closed),
    eyeRoughness: 0.12 - 0.04 * wet + 0.07 * closed,
    lipRoughness: 0.65 - 0.10 * articulation,
  };
}
