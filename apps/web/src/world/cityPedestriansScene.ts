import { SceneLoader, TransformNode, type AnimationGroup, type Material, type Scene, type ShadowGenerator } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { LOOKS, STYLES, modelFor, normalizeLook } from './appearance.mjs';
import { dressCharacter } from './riggedAvatar';
import { normalizeRiggedVisual } from './riggedPresentation.mjs';
import { resolveNpcBody, resolveNpcClips } from './npcAnimationClips.mjs';
import { smoothHumanHeading, HUMAN_WALK_SPEED } from './humanMotion.mjs';
import { personHeading } from './npcLayout.mjs';
import { makeRandom, type RoadGraph, type TrafficSignal } from './cityTraffic.mjs';
import { createPedestrians, pavementOffsets, pedestrianPoses, stepPedestrians, WALK } from './cityPedestrians.mjs';
import { CITY_ORIGIN } from './cityLayout.mjs';

const VISIBLE_RANGE = 75;

export type CityPedestrians = {
  update: (seconds: number, focus: { x: number; z: number }, signals: Map<string, TrafficSignal> | null, time: number) => void;
  /** People downtown (world), for cars to stop for. */
  people: () => Array<{ x: number; z: number; radius: number }>;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};

/** A plausible everyday outfit for walker `index` (seeded, so the same people come back). */
function lookFor(index: number) {
  const random = makeRandom(9000 + index * 31);
  const pick = <T,>(list: ReadonlyArray<T>) => list[Math.floor(random() * list.length) % list.length];
  const id = (list: ReadonlyArray<{ id: string }>) => pick(list).id;
  const female = random() < 0.5;
  return normalizeLook({
    body: female ? 'female' : 'male', skin: id(LOOKS.skin), hair: id(LOOKS.hair.slice(0, 8)),
    hairStyle: female ? pick(['long', 'pixie', 'buns', 'parted']) : pick(['parted', 'buzzed', 'bald', 'parted']),
    facialHair: !female && random() < 0.3 ? 'beard' : 'none',
    top: id(STYLES.top.filter(t => t.id !== 'crop')), outfit: id(LOOKS.outfit), bottom: female ? pick(['jeans', 'trousers', 'skirt', 'leggings']) : pick(['jeans', 'trousers', 'shorts']),
    bottomColor: id(LOOKS.bottomColor), shoes: pick(['sneakers', 'boots', 'flats', 'dress']), shoeColor: id(LOOKS.shoeColor),
  });
}

/**
 * Downtown walkers on the game's own rigged people (male and female bodies,
 * varied outfits), walking the pavements, waiting at lights and crossing.
 * Anyone far from the player is hidden and their animation paused.
 * Resolves null if the character models can't load.
 */
export async function loadCityPedestrians(scene: Scene, graph: RoadGraph, count: number,
  isInside: (x: number, z: number) => boolean, shadows?: ShadowGenerator): Promise<CityPedestrians | null> {
  const offsets = pavementOffsets(graph, isInside);
  let crowd = createPedestrians(graph, offsets, count, 21, []);
  if (!crowd.people.length) return null;
  const looks = crowd.people.map(person => lookFor(person.look));
  const models = [...new Set(looks.map(look => modelFor(look)))];
  const loaded = await Promise.all(models.map(model => SceneLoader.LoadAssetContainerAsync('/models/', model, scene).catch(() => null)));
  const containers = new Map(models.map((model, i) => [model, loaded[i]]));
  if (scene.isDisposed || !resolveNpcBody('human.glb', containers)) { for (const c of loaded) c?.dispose(); return null; }

  type Body = { holder: TransformNode; idle: AnimationGroup; walk: AnimationGroup; heading: number; walkWeight: number; shown: boolean; dispose: () => void };
  const bodies: Array<Body | null> = crowd.people.map((person, index) => {
    const chosen = resolveNpcBody(modelFor(looks[index]), containers);
    if (!chosen) return null;
    const entries = chosen.container.instantiateModelsToScene(name => `walker ${person.id} ${name}`, true);
    const clips = resolveNpcClips(chosen.container.animationGroups, entries.animationGroups);
    if (!clips) { entries.dispose(); return null; }
    const holder = new TransformNode(`walker ${person.id}`, scene);
    const visual = new TransformNode(`walker ${person.id} visual`, scene);
    for (const node of entries.rootNodes) node.parent = visual;
    normalizeRiggedVisual(visual);
    visual.parent = holder;
    entries.animationGroups.forEach(group => { if (group !== clips.idle && group !== clips.walk) group.stop(); });
    clips.idle.start(true); clips.walk.start(true);
    clips.idle.setWeightForAllAnimatables(0); clips.walk.setWeightForAllAnimatables(1);
    clips.walk.speedRatio = person.pace / HUMAN_WALK_SPEED;
    const materials = [...new Set(holder.getChildMeshes().map(mesh => mesh.material).filter((m): m is Material => Boolean(m)))];
    dressCharacter(materials, holder.getChildMeshes(), looks[index]);
    for (const mesh of holder.getChildMeshes()) { mesh.isPickable = false; mesh.receiveShadows = true; shadows?.addShadowCaster(mesh, false); }
    holder.setEnabled(false);
    clips.idle.pause(); clips.walk.pause();
    return { holder, idle: clips.idle, walk: clips.walk, heading: 0, walkWeight: 1, shown: false, dispose: () => { entries.dispose(); holder.dispose(); } };
  });

  let visible = false;
  let world: Array<{ x: number; z: number; radius: number }> = [];
  const show = (body: Body, on: boolean) => {
    if (body.shown === on) return;
    body.shown = on;
    body.holder.setEnabled(on);
    for (const group of [body.idle, body.walk]) on ? group.play(true) : group.pause();
  };
  return {
    update(seconds, focus, signals, time) {
      if (!visible) return;
      const local = { x: focus.x - CITY_ORIGIN.x, z: focus.z - CITY_ORIGIN.z };
      crowd = stepPedestrians(graph, offsets, crowd, seconds, { signals, time, focus: [local] });
      const poses = pedestrianPoses(graph, offsets, crowd);
      world = poses.map(pose => ({ x: CITY_ORIGIN.x + pose.x, z: CITY_ORIGIN.z + pose.z, radius: WALK.radius }));
      poses.forEach((pose, index) => {
        const body = bodies[index];
        if (!body) return;
        const x = CITY_ORIGIN.x + pose.x, z = CITY_ORIGIN.z + pose.z;
        const near = Math.hypot(x - focus.x, z - focus.z) < VISIBLE_RANGE;
        show(body, near);
        if (!near) return;
        // Walk, or stand at the kerb waiting for the lights.
        const target = pose.waiting ? 0 : 1;
        body.walkWeight += Math.sign(target - body.walkWeight) * Math.min(Math.abs(target - body.walkWeight), seconds / 0.25);
        body.walk.setWeightForAllAnimatables(body.walkWeight);
        body.idle.setWeightForAllAnimatables(1 - body.walkWeight);
        body.heading = smoothHumanHeading(body.heading, personHeading(pose.dx, pose.dz), seconds, 8);
        body.holder.position.set(x, 0, z);
        body.holder.rotation.y = body.heading;
      });
    },
    people: () => world,
    setVisible(next) {
      visible = next;
      if (!next) for (const body of bodies) if (body) show(body, false);
    },
    dispose() {
      for (const body of bodies) body?.dispose();
      for (const c of loaded) c?.dispose();
    },
  };
}
