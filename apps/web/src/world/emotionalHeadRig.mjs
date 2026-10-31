import { Quaternion } from '@babylonjs/core';

/**
 * Add emotional pitch/roll to the animated Head bone without replacing the
 * skeleton's Idle, Walk, Run or action poses. Restore our additive rotation
 * before the next animation evaluation, preventing cumulative head drift.
 */
export function createEmotionalHeadRig(scene, holder) {
  const head = holder.getChildTransformNodes(false).find(node =>
    /(?:^| )Head$/.test(node.name) && node.rotationQuaternion !== null);
  if (!head) return { setPose: () => {}, dispose: () => {} };

  const turn = Quaternion.Identity();
  let pitch = 0, roll = 0, base = null;
  const restore = () => {
    if (base && head.rotationQuaternion) head.rotationQuaternion.copyFrom(base);
    base = null;
  };
  const before = scene.onBeforeAnimationsObservable.add(restore);
  const after = scene.onAfterAnimationsObservable.add(() => {
    if (!holder.isEnabled() || !head.rotationQuaternion ||
        (Math.abs(pitch) < 0.00001 && Math.abs(roll) < 0.00001)) return;
    base = head.rotationQuaternion.clone();
    Quaternion.RotationYawPitchRollToRef(0, pitch, roll, turn);
    head.rotationQuaternion.multiplyInPlace(turn);
  });
  return {
    setPose(next) {
      pitch = Number.isFinite(next?.pitch) ? Math.max(-0.12, Math.min(0.12, next.pitch)) : 0;
      roll = Number.isFinite(next?.roll) ? Math.max(-0.07, Math.min(0.07, next.roll)) : 0;
    },
    dispose() {
      scene.onBeforeAnimationsObservable.remove(before);
      scene.onAfterAnimationsObservable.remove(after);
      restore();
    },
  };
}
