import type { TransformNode } from '@babylonjs/core';
export declare function cloneEnvironmentAtSites(template: TransformNode,
  sites: ReadonlyArray<readonly [number, number, number?, number?]>): TransformNode[];
