// Deep imports (with .js so Node's tests resolve them too) keep the rest of the engine out of the bundle.
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';

/**
 * Layer NPC attention and conversation posture on top of the authored Head
 * animation. Restore our previous additive pose BEFORE Babylon evaluates
 * the next clip, then apply the new pose AFTER evaluation. This prevents
 * drift when a clip does not key the head every frame.
 */
export function createNpcHeadRig(scene, holder) {
  const head = holder.getChildTransformNodes(false).find(node =>
    /(?:^| )Head$/.test(node.name) && node.rotationQuaternion !== null);
  if (!head) return { setYaw: _yaw => {}, setPose: _pose => {}, setGesture: _angles => {}, dispose: () => {} };

  const turn = Quaternion.Identity();
  let yaw = 0, pitch = 0, roll = 0;
  // A spoken gesture (19c: nod, head shake, tilt) on top of attention and conversation posture.
  let gesture = { yaw: 0, pitch: 0, roll: 0 };
  let base = null;
  const restore = () => {
    if (base && head.rotationQuaternion) head.rotationQuaternion.copyFrom(base);
    base = null;
  };
  const before = scene.onBeforeAnimationsObservable.add(restore);
  const after = scene.onAfterAnimationsObservable.add(() => {
    if (!holder.isEnabled() || !head.rotationQuaternion ||
        (Math.abs(yaw + gesture.yaw) + Math.abs(pitch + gesture.pitch) + Math.abs(roll + gesture.roll)) < 0.00001) return;
    base = head.rotationQuaternion.clone();
    Quaternion.RotationYawPitchRollToRef(yaw + gesture.yaw, pitch + gesture.pitch, roll + gesture.roll, turn);
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
    setGesture(next) {
      const limit = (value, max) => Number.isFinite(value) ? Math.max(-max, Math.min(max, value)) : 0;
      gesture = { yaw: limit(next?.yaw, 0.3), pitch: limit(next?.pitch, 0.22), roll: limit(next?.roll, 0.12) };
    },
    dispose() {
      scene.onBeforeAnimationsObservable.remove(before);
      scene.onAfterAnimationsObservable.remove(after);
      restore();
    },
  };
}
