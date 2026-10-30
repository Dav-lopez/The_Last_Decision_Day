import { AnimationGroup, SceneLoader, type AssetContainer, type Node, type Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

/** Action clips built for each body's rest pose by scripts/build-actions.py. */
const ACTION_FILES: Record<string, string> = { 'human.glb': 'human-actions.glb', 'human-female.glb': 'human-female-actions.glb' };
const loads = new WeakMap<Scene, Map<string, Promise<AssetContainer | null>>>();

/** One download per body type per scene; resolves null when unavailable (the character simply has no actions). */
export function loadActionClips(scene: Scene, model: string): Promise<AssetContainer | null> {
  const file = ACTION_FILES[model];
  if (!file) return Promise.resolve(null);
  let perScene = loads.get(scene);
  if (!perScene) loads.set(scene, perScene = new Map());
  let load = perScene.get(file);
  if (!load) {
    load = SceneLoader.LoadAssetContainerAsync('/models/', file, scene).then(container => {
      for (const group of container.animationGroups) group.stop();
      return container;
    }).catch(error => { console.warn(`Character actions ${file} unavailable`, error); return null; });
    perScene.set(file, load);
  }
  return load;
}

export type BoundAction = { group: AnimationGroup; duration: number };

/**
 * Bind every clip to a character copy's skeleton nodes by bone name. `unprefix`
 * strips the copy's name prefix (NPC copies are named "npc <id> <bone>").
 */
export function bindActions(clips: AssetContainer, nodes: ReadonlyArray<Node>, owner: string, unprefix: (name: string) => string = name => name) {
  const byName = new Map(nodes.map(node => [unprefix(node.name), node]));
  const bound = new Map<string, BoundAction>();
  for (const source of clips.animationGroups) {
    const group = new AnimationGroup(`${owner} ${source.name}`, source.getScene());
    for (const targeted of source.targetedAnimations) {
      const target = byName.get(targeted.target?.name);
      if (target) group.addTargetedAnimation(targeted.animation, target);
    }
    if (group.targetedAnimations.length === 0) { group.dispose(); continue; }
    group.normalize(source.from, source.to);
    const fps = source.targetedAnimations[0]?.animation.framePerSecond || 60;
    bound.set(source.name, { group, duration: (source.to - source.from) / fps });
  }
  return bound;
}
