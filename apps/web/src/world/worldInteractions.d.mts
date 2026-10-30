export type InteractionType = 'vehicle' | 'door' | 'bed' | 'seat';
export type InteractionTarget = { id: string; type: InteractionType; x: number; z: number };
export type InteractionMode = 'walking' | 'driving' | 'indoors' | 'sleeping' | 'sitting';
export type InteractionState = { mode: InteractionMode; targetId: string | null };
export declare const INTERACTION_RANGE: number;
export declare const INTERACTION_TYPES: ReadonlyArray<InteractionType>;
export declare function distance2D(a: { x: number; z: number }, b: { x: number; z: number }): number;
export declare function closestInteraction<T extends InteractionTarget>(player: { x: number; z: number },
  targets: ReadonlyArray<T>, maxDistance?: number): T | null;
export declare function transitionInteraction(state: InteractionState,
  action: InteractionTarget | 'exit' | null | undefined): InteractionState;
