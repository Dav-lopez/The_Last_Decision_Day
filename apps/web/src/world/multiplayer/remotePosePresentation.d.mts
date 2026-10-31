export type RemoteScenePose = {
  x: number; z: number; rotation: number;
  mode: 'walking' | 'busy' | 'driving';
  showBody: boolean; speed: number;
};
export declare function visibleRemotePose(
  pose: { x: number; z: number; rotation: number; speed: number; mode: string; location: string } | null | undefined,
  location: string,
): RemoteScenePose | null;
export declare function stepRemotePose(
  current: { x: number; z: number; rotation: number },
  target: { x: number; z: number; rotation: number },
  seconds: number,
  placed: boolean,
): { x: number; z: number; rotation: number };
