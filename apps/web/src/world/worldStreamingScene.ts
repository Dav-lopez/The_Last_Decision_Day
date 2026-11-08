import type { AbstractMesh, Scene } from '@babylonjs/core';
import type { StreamShown } from './worldStreaming.mjs';

/** The layer bit a hidden place's meshes move to; the camera never draws it (the default camera mask is 0x0FFFFFFF). */
const HIDDEN_LAYER = 0x10000000;
/** Babylon's default mesh layer: every camera draws it. */
const SHOWN_LAYER = 0x0fffffff;

export type StreamGroup = 'town' | 'city';
export type WorldStreaming = {
  /** Run a builder and file every mesh it adds under `group`. Only static scenery belongs here. */
  capture<T>(group: StreamGroup, build: () => T): T;
  /** Show or hide each place's scenery (only touches meshes when something changes). */
  apply(shown: StreamShown): void;
  /** For the playtest: what's shown and how many meshes are hidden right now. */
  read(): StreamShown & { hidden: number };
};

/**
 * Hides a place by moving its meshes to a layer the camera doesn't draw. Unlike `setEnabled`, this never fights the
 * game's own switches (lit windows, the town barrier) and it skips the meshes before any culling work, shadows
 * included. Meshes stay loaded, so coming back is instant.
 */
export function createWorldStreaming(scene: Scene): WorldStreaming {
  const groups: Record<StreamGroup, AbstractMesh[]> = { town: [], city: [] };
  let shown: StreamShown = { town: true, city: true };
  const paint = (group: StreamGroup) => {
    const layer = shown[group] ? SHOWN_LAYER : HIDDEN_LAYER;
    const live = groups[group].filter(mesh => !mesh.isDisposed());
    groups[group] = live;
    for (const mesh of live) mesh.layerMask = layer;
  };
  return {
    capture(group, build) {
      const added: AbstractMesh[] = [];
      const watch = scene.onNewMeshAddedObservable.add(mesh => { added.push(mesh); });
      try {
        return build();
      } finally {
        scene.onNewMeshAddedObservable.remove(watch);
        groups[group].push(...added);
        if (!shown[group]) for (const mesh of added) mesh.layerMask = HIDDEN_LAYER;
      }
    },
    apply(next) {
      const changed = (['town', 'city'] as const).filter(group => next[group] !== shown[group]);
      if (!changed.length) return;
      shown = { ...next };
      for (const group of changed) paint(group);
    },
    read() {
      const hidden = (shown.town ? 0 : groups.town.length) + (shown.city ? 0 : groups.city.length);
      return { ...shown, hidden };
    },
  };
}
