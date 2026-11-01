import { Color3, DynamicTexture, MeshBuilder, Ray, StandardMaterial, Vector3, type AbstractMesh, type Mesh, type Scene, type TransformNode } from '@babylonjs/core';
import { applyImpact, bodyCondition, createCarDamage, marksForQuality, type CarDamage, type DamageMark } from './carDamage.mjs';
import { carLocalToWorld, type CarState } from './vehicleDrive.mjs';

/** Outward direction of each panel in car-local (right, forward) coordinates. */
const OUTWARD = { front: [0, 1], rear: [0, -1], left: [-1, 0], right: [1, 0] } as const;
/** Heights (metres) tried for the ray, bumper/door line first. */
const HEIGHTS = { front: [0.58, 0.45, 0.75], rear: [0.62, 0.48, 0.8], left: [0.68, 0.55, 0.85], right: [0.68, 0.55, 0.85] } as const;

type Drawn = { id: string; meshes: Mesh[] };

/**
 * Scratches and dents drawn on the car you drive: each mark from carDamage.mjs
 * becomes a decal projected onto the car's own bodywork (found with a ray from
 * outside the panel), parented to it so it rides along, tilts and rolls.
 * Textures are painted on a canvas at start-up: original, no downloads.
 */
export function createCarDamageView(scene: Scene) {
  const damage = new Map<number, CarDamage>();
  const drawn = new Map<number, Drawn[]>();
  let budget = marksForQuality(null);

  const paint = (name: string, draw: (context: CanvasRenderingContext2D, size: number) => void) => {
    const texture = new DynamicTexture(name, { width: 256, height: 256 }, scene, true);
    const context = texture.getContext() as unknown as CanvasRenderingContext2D;
    context.clearRect(0, 0, 256, 256);
    draw(context, 256);
    texture.update();
    texture.hasAlpha = true;
    const material = new StandardMaterial(`${name} material`, scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.specularColor = new Color3(0.25, 0.25, 0.25);
    material.backFaceCulling = false;
    material.zOffset = -2;
    return material;
  };
  let seed = 7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Scratches: bright keyed lines through the paint, a dark scuff around them.
  const scratch = paint('car scratch', (context, size) => {
    const scuff = context.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size * 0.48);
    scuff.addColorStop(0, 'rgba(40,40,40,0.28)');
    scuff.addColorStop(1, 'rgba(40,40,40,0)');
    context.fillStyle = scuff;
    context.fillRect(0, 0, size, size);
    context.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const y = size * (0.3 + random() * 0.4);
      const x0 = size * (0.08 + random() * 0.25);
      const x1 = size * (0.6 + random() * 0.32);
      const tilt = (random() - 0.5) * 30;
      context.strokeStyle = `rgba(20,20,20,${0.25 + random() * 0.2})`;
      context.lineWidth = 3 + random() * 2;
      context.beginPath(); context.moveTo(x0, y); context.lineTo(x1, y + tilt); context.stroke();
      context.strokeStyle = `rgba(222,226,230,${0.55 + random() * 0.4})`;
      context.lineWidth = 1 + random() * 1.6;
      context.beginPath(); context.moveTo(x0, y - 1); context.lineTo(x1, y + tilt - 1); context.stroke();
    }
  });
  // Dents: a shaded hollow with a lit rim, creases, and chips of grey primer.
  const dent = paint('car dent', (context, size) => {
    const c = size / 2;
    const hollow = context.createRadialGradient(c + 10, c + 12, 6, c, c, size * 0.46);
    hollow.addColorStop(0, 'rgba(0,0,0,0.55)');
    hollow.addColorStop(0.55, 'rgba(0,0,0,0.3)');
    hollow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = hollow;
    context.fillRect(0, 0, size, size);
    const rim = context.createRadialGradient(c - 18, c - 20, size * 0.18, c, c, size * 0.42);
    rim.addColorStop(0, 'rgba(255,255,255,0)');
    rim.addColorStop(0.75, 'rgba(255,255,255,0.32)');
    rim.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = rim;
    context.fillRect(0, 0, size, size);
    context.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const angle = random() * Math.PI * 2;
      const r0 = size * (0.04 + random() * 0.08);
      const r1 = size * (0.16 + random() * 0.12);
      context.strokeStyle = `rgba(10,10,10,${0.35 + random() * 0.25})`;
      context.lineWidth = 2 + random() * 2.5;
      context.beginPath();
      context.moveTo(c + Math.cos(angle) * r0, c + Math.sin(angle) * r0);
      context.quadraticCurveTo(c + Math.cos(angle + 0.07) * (r0 + r1) / 2, c + Math.sin(angle + 0.07) * (r0 + r1) / 2, c + Math.cos(angle) * r1, c + Math.sin(angle) * r1);
      context.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const angle = random() * Math.PI * 2;
      const r = size * random() * 0.3;
      const grey = Math.round(140 + random() * 50);
      context.fillStyle = `rgba(${grey},${grey},${grey + 4},0.9)`;
      context.beginPath();
      context.arc(c + Math.cos(angle) * r, c + Math.sin(angle) * r, 2 + random() * 6, 0, Math.PI * 2);
      context.fill();
    }
  });

  const clearMark = (index: number, id: string) => {
    const list = drawn.get(index) ?? [];
    const found = list.find(item => item.id === id);
    if (!found) return;
    found.meshes.forEach(mesh => mesh.dispose());
    drawn.set(index, list.filter(item => item !== found));
  };

  const drawMark = (index: number, roots: TransformNode[], car: CarState, mark: DamageMark) => {
    const [ox, oz] = OUTWARD[mark.panel];
    const inward = carLocalToWorld({ x: 0, z: 0, rotation: car.rotation, speed: 0 }, -ox, -oz);
    const direction = new Vector3(inward.x, 0, inward.z).normalize();
    const owns = (mesh: AbstractMesh) => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0
      && roots.some(root => root.isEnabled() && mesh.isDescendantOf(root));
    const start = carLocalToWorld(car, mark.x + ox * 2.4, mark.z + oz * 2.4);
    for (const height of HEIGHTS[mark.panel]) {
      const hit = scene.pickWithRay(new Ray(new Vector3(start.x, height, start.z), direction, 5), owns);
      if (!hit?.hit || !hit.pickedMesh || !hit.pickedPoint) continue;
      const normal = hit.getNormal(true, true) ?? direction.scale(-1);
      const size = mark.size;
      const decal = MeshBuilder.CreateDecal(`car ${mark.kind}`, hit.pickedMesh, {
        position: hit.pickedPoint, normal, size: new Vector3(size * (mark.kind === 'scratch' ? 1.35 : 1), size, size * 0.6), angle: mark.angle,
      });
      decal.material = mark.kind === 'dent' ? dent : scratch;
      decal.visibility = 0.6 + 0.4 * mark.severity;
      decal.isPickable = false;
      decal.receiveShadows = true;
      decal.setParent(hit.pickedMesh);
      const list = drawn.get(index) ?? [];
      list.push({ id: mark.id, meshes: [decal] });
      // Over this quality's budget, the oldest decal goes (the damage itself is still counted).
      while (list.length > budget) list.shift()?.meshes.forEach(mesh => mesh.dispose());
      drawn.set(index, list);
      return true;
    }
    return false;
  };

  return {
    /** Record a knock on car `index`; returns the mark that was made (null for a nudge). */
    hit(index: number, roots: TransformNode[], car: CarState, input: { speed: number; steer: number }) {
      const result = applyImpact(damage.get(index) ?? createCarDamage(), input);
      if (!result.mark) return null;
      damage.set(index, result.state);
      if (result.replaces) clearMark(index, result.replaces);
      try { drawMark(index, roots, car, result.mark); } catch (error) { console.warn('Car damage decal failed', error); }
      return result.mark;
    },
    /** Bodywork condition of car `index` (100 = clean). */
    condition(index: number) { return bodyCondition(damage.get(index)); },
    marks(index: number) { return drawn.get(index)?.length ?? 0; },
    setQuality(quality: { scale?: number; base?: number }) {
      budget = marksForQuality(quality);
      for (const [index, list] of drawn) {
        while (list.length > budget) list.shift()?.meshes.forEach(mesh => mesh.dispose());
        drawn.set(index, list);
      }
    },
    /** Overnight repairs: every car is good as new. Returns how many cars were fixed. */
    repairAll() {
      let fixed = 0;
      for (const state of damage.values()) if (bodyCondition(state) < 100) fixed++;
      damage.clear();
      for (const list of drawn.values()) list.forEach(item => item.meshes.forEach(mesh => mesh.dispose()));
      drawn.clear();
      return fixed;
    },
    dispose() {
      for (const list of drawn.values()) list.forEach(item => item.meshes.forEach(mesh => mesh.dispose()));
      drawn.clear();
      for (const material of [scratch, dent]) { material.diffuseTexture?.dispose(); material.dispose(); }
    },
  };
}
export type CarDamageView = ReturnType<typeof createCarDamageView>;
