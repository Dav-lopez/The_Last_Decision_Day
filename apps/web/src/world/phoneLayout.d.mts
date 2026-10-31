export interface LayoutRect { x: number; y: number; width: number; height: number }
export interface LayoutElement { name: string; kind: 'hud' | 'target'; rect: LayoutRect }
export const MIN_TOUCH_TARGET: number;
export function overlaps(a: LayoutRect, b: LayoutRect): boolean;
export function layoutProblems(input: {
  viewport: { width: number; height: number };
  documentWidth: number;
  elements: LayoutElement[];
  overlays?: string[];
  minTarget?: number;
}): string[];
