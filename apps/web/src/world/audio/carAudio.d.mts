export type CarSynthDeps = {
  context: AudioContext; output: AudioNode;
  register: (source: AudioScheduledSourceNode, gain: GainNode, category: string, extra?: AudioNode[]) => unknown;
  release: (voice: unknown) => void; ramp: (param: AudioParam, value: number) => void; noise: () => AudioBuffer;
};
export type CarSynth = {
  reset(): void;
  update(state: { time: number; driving: boolean; speed: number; car?: { rpm?: number; frequency?: number; throttle?: number; slip?: number } | null; horn: boolean }): boolean;
};
export declare function createCarSynth(deps: CarSynthDeps): CarSynth;
