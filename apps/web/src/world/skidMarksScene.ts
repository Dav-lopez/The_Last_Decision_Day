import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Scene } from '@babylonjs/core';
import { SKID, type SkidMarks } from './carFeel.mjs';

/**
 * Skid marks as one thin-instanced ground quad: a single draw call for every
 * mark on the road. Each instance's colour alpha fades the mark out; the
 * buffers are rewritten only when marks were laid or twice a second to fade.
 */
export function createSkidMarksMesh(scene: Scene, marks: SkidMarks) {
  const mesh = MeshBuilder.CreateGround('skid-marks', { width: SKID.width, height: 1 }, scene);
  const material = new StandardMaterial('skid-marks-material', scene);
  material.diffuseColor = new Color3(0.05, 0.05, 0.05);
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.emissiveColor = new Color3(0.04, 0.04, 0.04);
  material.backFaceCulling = false;
  material.zOffset = -2;
  mesh.material = material;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.alwaysSelectAsActiveMesh = true; // instances are spread around; skip the bounding check
  let capacity = 0;
  let matrices = new Float32Array(0);
  let colors = new Float32Array(0);
  let shownVersion = -1;
  let fadeTimer = 0;
  const scale = new Vector3(1, 1, 1);
  const position = new Vector3();
  const rotation = new Quaternion();
  const matrix = new Matrix();
  const rebuild = (now: number) => {
    const segments = marks.segments;
    if (segments.length > capacity) {
      capacity = Math.max(segments.length, marks.capacity);
      matrices = new Float32Array(capacity * 16);
      colors = new Float32Array(capacity * 4);
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
      mesh.thinInstanceSetBuffer('color', colors, 4, false);
    }
    let count = 0;
    for (const segment of segments) {
      const alpha = marks.opacity(segment, now) * 0.75;
      if (alpha <= 0.01) continue;
      scale.set(1, 1, segment.length + 0.04);
      position.set(segment.x, 0.022, segment.z);
      Quaternion.RotationYawPitchRollToRef(segment.rotation, 0, 0, rotation);
      Matrix.ComposeToRef(scale, rotation, position, matrix);
      matrix.copyToArray(matrices, count * 16);
      colors.set([1, 1, 1, alpha], count * 4);
      count++;
    }
    mesh.thinInstanceCount = count;
    if (capacity > 0) {
      mesh.thinInstanceBufferUpdated('matrix');
      mesh.thinInstanceBufferUpdated('color');
    }
    mesh.setEnabled(count > 0);
  };
  mesh.setEnabled(false);
  return {
    update(seconds: number, now: number) {
      fadeTimer += seconds;
      if (marks.version === shownVersion && fadeTimer < 0.5) return;
      if (marks.segments.length === 0 && shownVersion === marks.version) return;
      shownVersion = marks.version;
      fadeTimer = 0;
      rebuild(now);
    },
    dispose() { mesh.dispose(); material.dispose(); },
  };
}
