import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, TransformNode, type ShadowGenerator, type Scene } from '@babylonjs/core';
import { beaconPhase, vehicleSize, type VehicleKind } from './vehicleSpecs.mjs';

/**
 * The station vehicles downtown, built from simple shapes (no downloads): a black-and-white police cruiser
 * with a red/blue light bar and push bar, and a red pumper fire engine with a ladder, roller-shutter lockers,
 * a reflective stripe and red/white beacons. Local +Z is the front, the root sits on the ground at the centre.
 * Each vehicle merges its body parts per material, so it costs about ten draw calls.
 */
export type CareerVehicleModel = {
  root: TransformNode;
  /** Light the beacons (`on`) at `seconds` into the flash pattern; off leaves them dark. */
  setBeacons(on: boolean, seconds: number): void;
  dispose(): void;
};

type Part = { mesh: Mesh; material: string };

export function buildCareerVehicle(scene: Scene, kind: Exclude<VehicleKind, 'sedan'>, shadows?: ShadowGenerator | null): CareerVehicleModel {
  const root = new TransformNode(`career vehicle ${kind}`, scene);
  const materials = new Map<string, StandardMaterial>();
  const material = (key: string, hex: string, options: { emissive?: string; specular?: number; alpha?: number } = {}) => {
    let made = materials.get(key);
    if (made) return made;
    made = new StandardMaterial(`career vehicle ${kind} ${key}`, scene);
    made.diffuseColor = Color3.FromHexString(hex);
    made.specularColor = new Color3(options.specular ?? 0.25, options.specular ?? 0.25, options.specular ?? 0.25);
    if (options.emissive) made.emissiveColor = Color3.FromHexString(options.emissive);
    if (options.alpha !== undefined) made.alpha = options.alpha;
    materials.set(key, made);
    return made;
  };
  const parts: Part[] = [];
  const box = (key: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = MeshBuilder.CreateBox(`career vehicle ${kind} ${key}`, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    parts.push({ mesh, material: key.split(':')[0] });
    return mesh;
  };
  const wheel = (x: number, z: number, diameter: number, width: number) => {
    const tyre = MeshBuilder.CreateCylinder(`career vehicle ${kind} tyre`, { diameter, height: width, tessellation: 18 }, scene);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(x, diameter / 2, z);
    parts.push({ mesh: tyre, material: 'tyre' });
    const hub = MeshBuilder.CreateCylinder(`career vehicle ${kind} hub`, { diameter: diameter * 0.55, height: width + 0.02, tessellation: 12 }, scene);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, diameter / 2, z);
    parts.push({ mesh: hub, material: 'chrome' });
  };
  material('tyre', '#16171a', { specular: 0.05 });
  material('chrome', '#c9ced6', { specular: 0.9 });
  material('glass', '#1f2a36', { specular: 0.8 });
  material('head', '#fff6dc', { emissive: '#8a8470' });
  material('tail', '#7a0c0c', { emissive: '#3a0404' });

  // Beacons: separate meshes so their emissive colour can flash without touching the body.
  const beacons: { mesh: Mesh; material: StandardMaterial; side: 'left' | 'right' | 'white'; lit: Color3; dim: Color3 }[] = [];
  const beacon = (side: 'left' | 'right' | 'white', hex: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = MeshBuilder.CreateBox(`career vehicle ${kind} beacon ${side}`, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    mesh.parent = root;
    const mat = new StandardMaterial(`career vehicle ${kind} beacon ${side} ${beacons.length}`, scene);
    const colour = Color3.FromHexString(hex);
    mat.diffuseColor = colour.scale(0.5);
    mat.specularColor = new Color3(0.6, 0.6, 0.6);
    mesh.material = mat;
    beacons.push({ mesh, material: mat, side, lit: colour, dim: colour.scale(0.12) });
  };

  const { halfWidth, halfLength } = vehicleSize({ kind });
  const width = halfWidth * 2, length = halfLength * 2;
  let sideLabel: { text: string; colour: string; ink: string; y: number; z: number; w: number; h: number };

  if (kind === 'cruiser') {
    material('black', '#14161a', { specular: 0.55 });
    material('white', '#f2f3f5', { specular: 0.55 });
    // Black nose and tail, white doors: the classic two-tone.
    box('black:nose', width, 0.6, 1.25, 0, 0.6, halfLength - 0.625);
    box('black:tail', width, 0.6, 1.15, 0, 0.6, -halfLength + 0.575);
    box('white:doors', width + 0.01, 0.6, length - 2.4, 0, 0.6, -0.05);
    box('black:sill', width + 0.02, 0.14, length - 0.3, 0, 0.36, 0);
    box('glass:cabin', width - 0.14, 0.46, 2.0, 0, 1.12, -0.2);
    box('white:roof', width - 0.24, 0.06, 1.7, 0, 1.38, -0.25);
    box('black:pushbar', 1.2, 0.36, 0.08, 0, 0.55, halfLength + 0.06);
    box('black:pushbar:upright', 0.08, 0.5, 0.08, -0.45, 0.62, halfLength + 0.06);
    box('black:pushbar:upright2', 0.08, 0.5, 0.08, 0.45, 0.62, halfLength + 0.06);
    box('head:l', 0.32, 0.12, 0.04, -0.55, 0.72, halfLength + 0.005);
    box('head:r', 0.32, 0.12, 0.04, 0.55, 0.72, halfLength + 0.005);
    box('tail:l', 0.3, 0.12, 0.04, -0.58, 0.74, -halfLength - 0.005);
    box('tail:r', 0.3, 0.12, 0.04, 0.58, 0.74, -halfLength - 0.005);
    box('black:barbase', 1.1, 0.06, 0.26, 0, 1.44, -0.05);
    beacon('left', '#ff2a2a', 0.5, 0.12, 0.24, -0.28, 1.53, -0.05);
    beacon('right', '#2a62ff', 0.5, 0.12, 0.24, 0.28, 1.53, -0.05);
    for (const x of [-halfWidth + 0.1, halfWidth - 0.1]) for (const z of [1.45, -1.45]) wheel(x, z, 0.66, 0.24);
    sideLabel = { text: 'POLICE', colour: '#f2f3f5', ink: '#111827', y: 0.62, z: -0.05, w: 1.6, h: 0.34 };
  } else {
    material('red', '#b5121b', { specular: 0.5 });
    material('stripe', '#f4f1e6', { specular: 0.4, emissive: '#2a2925' });
    material('locker', '#bfc4cc', { specular: 0.6 });
    material('ladder', '#d8dbe0', { specular: 0.7 });
    const cabLength = 2.3;
    const cabZ = halfLength - cabLength / 2;
    box('red:cab', width, 1.85, cabLength, 0, 1.4, cabZ);
    box('glass:windscreen', width - 0.3, 0.75, 0.05, 0, 1.85, halfLength + 0.01);
    box('glass:sidewindows', width + 0.01, 0.62, 1.2, 0, 1.88, cabZ + 0.35);
    box('red:body', width, 1.75, length - cabLength - 0.1, 0, 1.38, -cabLength / 2 - 0.05);
    box('stripe:band', width + 0.03, 0.13, length - 0.2, 0, 0.98, 0);
    for (const z of [-0.45, -1.85, -3.15]) box('locker:door', width + 0.02, 1.0, 1.15, 0, 1.6, z);
    box('chrome:bumper', width - 0.1, 0.28, 0.16, 0, 0.5, halfLength + 0.05);
    box('chrome:grille', 1.2, 0.55, 0.04, 0, 1.0, halfLength + 0.005);
    box('red:chassis', width - 0.5, 0.35, length - 0.4, 0, 0.55, 0);
    box('head:l', 0.3, 0.2, 0.04, -0.85, 0.9, halfLength + 0.01);
    box('head:r', 0.3, 0.2, 0.04, 0.85, 0.9, halfLength + 0.01);
    box('tail:l', 0.25, 0.3, 0.04, -1.0, 0.95, -halfLength - 0.01);
    box('tail:r', 0.25, 0.3, 0.04, 1.0, 0.95, -halfLength - 0.01);
    // A ladder along the roof: two rails and rungs.
    const ladderLength = length - cabLength - 0.4;
    const ladderZ = -cabLength / 2 - 0.1;
    box('ladder:rail-l', 0.07, 0.1, ladderLength, -0.42, 2.32, ladderZ);
    box('ladder:rail-r', 0.07, 0.1, ladderLength, 0.42, 2.32, ladderZ);
    for (let i = 0; i < 13; i++) box('ladder:rung', 0.84, 0.04, 0.05, 0, 2.32, ladderZ - ladderLength / 2 + 0.2 + i * (ladderLength - 0.4) / 12);
    box('chrome:hosereel', width - 0.4, 0.22, 0.6, 0, 2.38, -halfLength + 0.5);
    box('red:barbase', 1.9, 0.07, 0.3, 0, 2.36, cabZ);
    beacon('left', '#ff2020', 0.6, 0.14, 0.28, -0.62, 2.46, cabZ);
    beacon('white', '#ffffff', 0.4, 0.14, 0.28, 0, 2.46, cabZ);
    beacon('right', '#ff2020', 0.6, 0.14, 0.28, 0.62, 2.46, cabZ);
    beacon('left', '#ff2020', 0.14, 0.2, 0.14, -halfWidth + 0.1, 2.33, -halfLength + 0.1);
    beacon('right', '#ff2020', 0.14, 0.2, 0.14, halfWidth - 0.1, 2.33, -halfLength + 0.1);
    for (const x of [-halfWidth + 0.2, halfWidth - 0.2]) for (const z of [halfLength - 1.25, -1.6, -2.75]) wheel(x, z, 1.0, 0.34);
    sideLabel = { text: 'FIRE RESCUE', colour: '#b5121b', ink: '#fff4d6', y: 1.25, z: cabZ - 0.2, w: 1.7, h: 0.4 };
  }

  // Merge the body per material: a handful of draw calls instead of dozens.
  const merged: Mesh[] = [];
  const groups = new Map<string, Mesh[]>();
  for (const part of parts) groups.set(part.material, [...(groups.get(part.material) ?? []), part.mesh]);
  for (const [key, meshes] of groups) {
    const mesh = meshes.length > 1 ? Mesh.MergeMeshes(meshes, true, true) : meshes[0];
    if (!mesh) continue;
    mesh.name = `career vehicle ${kind} ${key}`;
    mesh.material = materials.get(key) ?? null;
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    shadows?.addShadowCaster(mesh, false);
    merged.push(mesh);
  }

  // Door lettering on both sides (original text, drawn on a canvas).
  const label = new DynamicTexture(`career vehicle ${kind} label`, { width: 512, height: 112 }, scene, true);
  const ctx = label.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = sideLabel.colour; ctx.fillRect(0, 0, 512, 112);
  label.drawText(sideLabel.text, null, 84, `bold ${sideLabel.text.length > 8 ? 62 : 82}px sans-serif`, sideLabel.ink, null, true, false);
  label.update();
  const labelMaterial = new StandardMaterial(`career vehicle ${kind} label`, scene);
  labelMaterial.diffuseTexture = label;
  labelMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
  const labels: Mesh[] = [];
  for (const side of [-1, 1]) {
    const plane = MeshBuilder.CreatePlane(`career vehicle ${kind} label`, { width: sideLabel.w, height: sideLabel.h }, scene);
    plane.material = labelMaterial;
    plane.parent = root;
    plane.position.set(side * (halfWidth + 0.02), sideLabel.y, sideLabel.z);
    // Planes face -Z; turn each to face outwards from its side.
    plane.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    plane.isPickable = false;
    labels.push(plane);
  }

  for (const entry of beacons) { entry.mesh.isPickable = false; entry.material.emissiveColor = entry.dim; }
  let lit = false;
  return {
    root,
    setBeacons(on, seconds) {
      if (!on && !lit) return;
      lit = on;
      const phase = on ? beaconPhase(kind, seconds) : { left: false, right: false, white: false };
      for (const entry of beacons) entry.material.emissiveColor = phase[entry.side] ? entry.lit : entry.dim;
    },
    dispose() {
      for (const mesh of [...merged, ...labels, ...beacons.map(entry => entry.mesh)]) mesh.dispose();
      for (const entry of beacons) entry.material.dispose();
      for (const made of materials.values()) made.dispose();
      labelMaterial.dispose();
      label.dispose();
      root.dispose();
    },
  };
}
