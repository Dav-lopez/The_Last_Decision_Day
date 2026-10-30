import type { AbstractMesh, MorphTarget } from '@babylonjs/core';
import type { BlinkState, BlinkFrame } from './blinkCycle.mjs';

export type NpcEyelids = { left: MorphTarget[]; right: MorphTarget[] };
export function initialNpcBlink(index: number): BlinkFrame;
export function collectNpcEyelids(meshes: ReadonlyArray<AbstractMesh>): NpcEyelids;
export function advanceNpcBlink(state: BlinkState, seconds: number, eyelids: NpcEyelids): BlinkFrame;
