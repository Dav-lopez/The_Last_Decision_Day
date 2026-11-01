import { Quaternion } from '@babylonjs/core';

/**
 * Layer NPC attention and conversation posture on top of the authored Head
 * animation. Restore our previous additive pose BEFORE Babylon evaluates
 * the next clip, then apply the new pose AFTER evaluation. This prevents
 * drift when a clip does not key the head every frame.
 */
export function createNpcHeadRig(scene, holder) {
  const head = holder.getChildTransformNodes(false).find(node =>
    /(?:^| )Head$/.test(node.name) && node.rotationQuaternion !== null);
  if (!head) return { setYaw: _yaw => {}, setPose: _pose => {}, dispose: () => {} };

  const turn = Quaternion.Identity();
  let yaw = 0, pitch = 0, roll = 0;
  let base = null;
  const restore = () => {
    if (base && head.rotationQuaternion) head.rotationQuaternion.copyFrom(base);
    base = null;
  };
  const before = scene.onBeforeAnimationsObservable.add(restore);
  const after = scene.onAfterAnimationsObservable.add(() => {
    if (!holder.isEnabled() || !head.rotationQuaternion ||
        (Math.abs(yaw) + Math.abs(pitch) + Math.abs(roll)) < 0.00001) return;
    base = head.rotationQuaternion.clone();
    Quaternion.RotationYawPitchRollToRef(yaw, pitch, roll, turn);
    head.rotationQuaternion.multiplyInPlace(turn);
  });

  return {
    // Preserve the existing yaw-only interface for older call sites.
    setYaw(next) {
      yaw = Number.isFinite(next) ? Math.max(-0.22, Math.min(0.22, next)) : 0;
    },
    setPose(next) {
      yaw = Number.isFinite(next?.yaw) ? Math.max(-0.22, Math.min(0.22, next.yaw)) : 0;
      pitch = Number.isFinite(next?.pitch) ? Math.max(-0.085, Math.min(0.085, next.pitch)) : 0;
      roll = Number.isFinite(next?.roll) ? Math.max(-0.04, Math.min(0.04, next.roll)) : 0;
    },
    dispose() {
      scene.onBeforeAnimationsObservable.remove(before);
      scene.onAfterAnimationsObservable.remove(after);
      restore();
    },
  };
}
