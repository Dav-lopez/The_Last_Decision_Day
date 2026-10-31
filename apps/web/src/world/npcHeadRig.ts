import { Quaternion, Vector3, type Scene, type TransformNode } from '@babylonjs/core';

/**
 * Layer NPC attention on top of the authored Head-bone animation.
 * Remove our previous additive turn BEFORE Babylon evaluates the next clip,
 * then apply the new turn AFTER animation evaluation. This prevents drift
 * when a clip does not key the head every frame and preserves base poses.
 */
export function createNpcHeadRig(scene: Scene, holder: TransformNode) {
  const head = holder.getChildTransformNodes(false).find(node =>
    /(?:^| )Head$/.test(node.name) && node.rotationQuaternion !== null);
  if (!head) return { setYaw: (_yaw: number) => {}, dispose: () => {} };

  const up = Vector3.Up();
  const turn = Quaternion.Identity();
  let yaw = 0;
  let base: Quaternion | null = null;
  const restore = () => {
    if (base && head.rotationQuaternion) head.rotationQuaternion.copyFrom(base);
    base = null;
  };
  const before = scene.onBeforeAnimationsObservable.add(restore);
  const after = scene.onAfterAnimationsObservable.add(() => {
    if (!holder.isEnabled() || !head.rotationQuaternion || Math.abs(yaw) < 0.00001) return;
    base = head.rotationQuaternion.clone();
    Quaternion.RotationAxisToRef(up, yaw, turn);
    head.rotationQuaternion.multiplyInPlace(turn);
  });

  return {
    setYaw(next: number) {
      yaw = Number.isFinite(next) ? Math.max(-0.22, Math.min(0.22, next)) : 0;
    },
    dispose() {
      scene.onBeforeAnimationsObservable.remove(before);
      scene.onAfterAnimationsObservable.remove(after);
      restore();
    },
  };
}
