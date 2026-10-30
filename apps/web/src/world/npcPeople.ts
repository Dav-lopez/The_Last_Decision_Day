import { Color3, PBRMaterial, SceneLoader, TransformNode, type AnimationGroup, type Scene, type ShadowGenerator } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { colorFor } from './appearance.mjs';
import { smoothHumanHeading, HUMAN_WALK_SPEED } from './humanMotion.mjs';
import { NEIGHBORS, PERSON_RADIUS, carAhead, isOut, personHeading, routePose, shouldYield } from './npcLayout.mjs';
import { normalizeRiggedVisual } from './riggedPresentation.mjs';

type CarFootprint = { x: number; z: number; rotation: number };
export type Person = { x: number; z: number; radius: number };
export type Neighbors = {
  /** Advance everyone one frame; returns the people currently out, for collisions. */
  update: (seconds: number, minute: number, player: { x: number; z: number } | null, cars: ReadonlyArray<CarFootprint>) => Person[];
  dispose: () => void;
};

const CROSSFADE = 0.25;

/**
 * Neighbours share the player's rigged human model: one download, one copy per
 * person with its own materials (skin, hair, outfit) and walk/idle clips.
 * Resolves null if the model can't load; the street simply stays empty.
 */
export async function loadNeighbors(scene: Scene, shadows?: ShadowGenerator): Promise<Neighbors | null> {
  const container = await SceneLoader.LoadAssetContainerAsync('/models/', 'human.glb', scene);
  if (scene.isDisposed) { container.dispose(); return null; }
  const clipIndex = (name: string) => container.animationGroups.findIndex(group => group.name === name);
  const idleIndex = clipIndex('Idle');
  const walkIndex = clipIndex('Walk');
  if (idleIndex < 0 || walkIndex < 0) { container.dispose(); return null; }

  const people = NEIGHBORS.map(npc => {
    const entries = container.instantiateModelsToScene(name => `npc ${npc.id} ${name}`, true);
    const holder = new TransformNode(`npc ${npc.id}`, scene);
    const visual = new TransformNode(`npc ${npc.id} visual`, scene);
    for (const node of entries.rootNodes) node.parent = visual;
    normalizeRiggedVisual(visual);
    visual.parent = holder;
    // Clips are cloned in the container's order.
    const idle: AnimationGroup = entries.animationGroups[idleIndex];
    const walk: AnimationGroup = entries.animationGroups[walkIndex];
    entries.animationGroups.forEach((group, index) => { if (index !== idleIndex && index !== walkIndex) group.stop(); });
    for (const group of [idle, walk]) { group.start(true); group.setWeightForAllAnimatables(group === idle ? 1 : 0); }
    walk.speedRatio = npc.speed / HUMAN_WALK_SPEED;
    const materials = new Set(holder.getChildMeshes().map(mesh => mesh.material).filter(Boolean));
    for (const material of materials) {
      if (!(material instanceof PBRMaterial)) continue;
      const part = material.name.endsWith('Student skin') ? 'skin'
        : material.name.endsWith('Student jacket') ? 'outfit'
          : material.name.endsWith('Student hair') ? 'hair' : null;
      if (part) material.albedoColor = Color3.FromHexString(colorFor(part, npc.look[part])).toLinearSpace();
      else if (material.name.endsWith('Student lips')) {
        material.albedoColor = Color3.Lerp(Color3.FromHexString(colorFor('skin', npc.look.skin)).toLinearSpace(), new Color3(0.19, 0.055, 0.065), 0.35);
      }
    }
    for (const mesh of holder.getChildMeshes()) { mesh.receiveShadows = true; shadows?.addShadowCaster(mesh, false); mesh.isPickable = false; }
    holder.setEnabled(false);
    const start = routePose(npc, 0);
    return { npc, entries, holder, idle, walk, walked: 0, walkWeight: 0, heading: personHeading(start.dx, start.dz), visible: false };
  });

  return {
    update(seconds, minute, player, cars) {
      const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
      const outside: Person[] = [];
      for (const person of people) {
        const out = isOut(person.npc, minute);
        if (out !== person.visible) {
          person.visible = out;
          person.holder.setEnabled(out);
          for (const group of [person.idle, person.walk]) out ? group.play(true) : group.pause();
        }
        if (!out) continue;
        let pose = routePose(person.npc, person.walked);
        const obstacles = player ? [{ x: player.x, z: player.z, radius: 0.38 }] : [];
        const blocked = !pose.moving || shouldYield(pose, obstacles) || carAhead(person.npc, person.walked, cars);
        if (!blocked) {
          person.walked += person.npc.speed * dt;
          pose = routePose(person.npc, person.walked);
        }
        const target = blocked ? 0 : 1;
        person.walkWeight += Math.sign(target - person.walkWeight) * Math.min(Math.abs(target - person.walkWeight), dt / CROSSFADE);
        person.walk.setWeightForAllAnimatables(person.walkWeight);
        person.idle.setWeightForAllAnimatables(1 - person.walkWeight);
        person.heading = smoothHumanHeading(person.heading, personHeading(pose.dx, pose.dz), dt, 8);
        person.holder.position.set(pose.x, 0, pose.z);
        person.holder.rotation.y = person.heading;
        outside.push({ x: pose.x, z: pose.z, radius: PERSON_RADIUS });
      }
      return outside;
    },
    dispose() {
      for (const person of people) { person.entries.dispose(); person.holder.dispose(); }
      container.dispose();
    },
  };
}
