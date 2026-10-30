import './football.css';
import { SceneLoader, TransformNode, type AnimationGroup, type AssetContainer, type Material, type Scene, type ShadowGenerator } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { modelFor, normalizeLook, type Look } from './appearance.mjs';
import { dressCharacter } from './riggedAvatar';
import { normalizeRiggedVisual } from './riggedPresentation.mjs';
import { HUMAN_RUN_SPEED, HUMAN_WALK_SPEED, smoothHumanHeading } from './humanMotion.mjs';
import type { MatchPlayer } from './footballMatch.mjs';

/** Team kits: blue (yours) and red; keepers in green and gold long sleeves. */
const KITS = {
  home: { top: 'tshirt', outfit: 'blue', bottom: 'shorts', bottomColor: 'white', shoes: 'sneakers', shoeColor: 'white' },
  away: { top: 'tshirt', outfit: 'red', bottom: 'shorts', bottomColor: 'black', shoes: 'sneakers', shoeColor: 'black' },
  homeKeeper: { top: 'longsleeve', outfit: 'green', bottom: 'shorts', bottomColor: 'black', shoes: 'sneakers', shoeColor: 'black' },
  awayKeeper: { top: 'longsleeve', outfit: 'gold', bottom: 'shorts', bottomColor: 'black', shoes: 'sneakers', shoeColor: 'black' },
} as const;
/** Mixed teams: bodies, skin and hair vary by shirt number. */
const PEOPLE: Array<Partial<Look>> = [
  { body: 'male', skin: 'deep', hair: 'black', hairStyle: 'buzzed' },
  { body: 'female', skin: 'light', hair: 'blonde', hairStyle: 'buns' },
  { body: 'male', skin: 'olive', hair: 'dark', hairStyle: 'parted', facialHair: 'beard' },
  { body: 'female', skin: 'brown', hair: 'black', hairStyle: 'pixie' },
  { body: 'male', skin: 'porcelain', hair: 'ginger', hairStyle: 'parted' },
  { body: 'female', skin: 'warm', hair: 'auburn', hairStyle: 'long' },
  { body: 'male', skin: 'brown', hair: 'black', hairStyle: 'buzzed' },
  { body: 'male', skin: 'light', hair: 'brown', hairStyle: 'parted' },
  { body: 'female', skin: 'deep', hair: 'black', hairStyle: 'buns' },
  { body: 'male', skin: 'warm', hair: 'dark', hairStyle: 'buzzed' },
];

export function kitFor(player: Pick<MatchPlayer, 'team' | 'role'>, index: number): Look {
  const kit = player.role === 'keeper' ? (player.team === 'home' ? KITS.homeKeeper : KITS.awayKeeper) : KITS[player.team];
  return normalizeLook({ ...PEOPLE[index % PEOPLE.length], ...kit });
}

type Body = { holder: TransformNode; idle: AnimationGroup; walk: AnimationGroup; run: AnimationGroup; heading: number; entries: { dispose(): void } };

/** The nine AI players' bodies (you are the tenth), animated from the match simulation. */
export async function loadFootballPlayers(scene: Scene, players: ReadonlyArray<MatchPlayer>, shadows?: ShadowGenerator) {
  const ai = players.filter(p => !p.human);
  const looks = ai.map((p, i) => kitFor(p, i));
  const models = [...new Set(looks.map(look => modelFor(look)))];
  const loaded = await Promise.all(models.map(model => SceneLoader.LoadAssetContainerAsync('/models/', model, scene).catch(() => null)));
  const containers = new Map<string, AssetContainer | null>(models.map((model, i) => [model, loaded[i]]));
  if (scene.isDisposed || !containers.get('human.glb')) { for (const c of loaded) c?.dispose(); return null; }
  const bodies = new Map<string, Body>();
  ai.forEach((player, i) => {
    const container = containers.get(modelFor(looks[i])) ?? containers.get('human.glb')!;
    const entries = container.instantiateModelsToScene(name => `footballer ${player.id} ${name}`, true);
    const holder = new TransformNode(`footballer ${player.id}`, scene);
    const visual = new TransformNode(`footballer ${player.id} visual`, scene);
    for (const node of entries.rootNodes) node.parent = visual;
    normalizeRiggedVisual(visual);
    visual.parent = holder;
    const clip = (name: string) => entries.animationGroups.find(g => g.name.endsWith(name))!;
    const idle = clip('Idle'); const walk = clip('Walk'); const run = clip('Run');
    for (const group of entries.animationGroups) group.stop();
    for (const group of [idle, walk, run]) { group.start(true); group.setWeightForAllAnimatables(group === idle ? 1 : 0); }
    const materials = [...new Set(holder.getChildMeshes().map(mesh => mesh.material).filter((m): m is Material => Boolean(m)))];
    dressCharacter(materials, holder.getChildMeshes(), looks[i]);
    for (const mesh of holder.getChildMeshes()) { mesh.isPickable = false; shadows?.addShadowCaster(mesh, false); }
    holder.position.set(player.x, 0, player.z);
    bodies.set(player.id, { holder, idle, walk, run, heading: player.heading, entries });
  });

  return {
    update(state: ReadonlyArray<MatchPlayer>, seconds: number) {
      for (const p of state) {
        const body = bodies.get(p.id);
        if (!body) continue;
        body.holder.position.set(p.x, 0, p.z);
        const speed = Math.hypot(p.vx, p.vz);
        body.heading = smoothHumanHeading(body.heading, p.heading, seconds, 10);
        body.holder.rotation.y = body.heading;
        // Blend idle → walk → run by speed, and match the stride.
        const run = Math.max(0, Math.min(1, (speed - HUMAN_WALK_SPEED) / (HUMAN_RUN_SPEED - HUMAN_WALK_SPEED)));
        const walk = Math.max(0, Math.min(1, speed / HUMAN_WALK_SPEED)) * (1 - run);
        body.idle.setWeightForAllAnimatables(Math.max(0, 1 - walk - run));
        body.walk.setWeightForAllAnimatables(walk);
        body.run.setWeightForAllAnimatables(run);
        body.walk.speedRatio = Math.max(0.6, Math.min(1.6, speed / HUMAN_WALK_SPEED));
        body.run.speedRatio = Math.max(0.6, Math.min(1.6, speed / HUMAN_RUN_SPEED));
      }
    },
    dispose() {
      for (const body of bodies.values()) { body.entries.dispose(); body.holder.dispose(); }
      for (const c of loaded) c?.dispose();
    },
  };
}
