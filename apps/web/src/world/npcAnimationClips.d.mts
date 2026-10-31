import type { AnimationGroup, AssetContainer } from '@babylonjs/core';

export function resolveNpcClips(
  sourceGroups: ReadonlyArray<AnimationGroup>,
  clonedGroups: ReadonlyArray<AnimationGroup>,
): { idle: AnimationGroup; walk: AnimationGroup } | null;

export function resolveNpcBody(
  requestedModel: string,
  containers: ReadonlyMap<string, AssetContainer | null>,
  fallbackModel?: string,
): { model: string; container: AssetContainer } | null;
