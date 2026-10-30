export type EyeBlinkPose = { left: number; right: number };
export function composeEyeExpression(name: string, expression: number, blink: EyeBlinkPose | null | undefined): number;
