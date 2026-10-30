import {
  Color4, DefaultRenderingPipeline, ImageProcessingConfiguration, Ray, SSAO2RenderingPipeline,
  type AbstractMesh, type ArcRotateCamera, type Scene,
} from '@babylonjs/core';

export type RenderQuality = 'high' | 'standard';

/** WebGL version of the scene's engine (the base engine type doesn't declare it). */
function webGLVersion(scene: Scene): number {
  return (scene.getEngine() as unknown as { webGLVersion?: number }).webGLVersion ?? 1;
}

/**
 * Desktop-class GPUs get ambient occlusion; phones, tablets and small screens
 * get everything else. Read once at start-up.
 */
export function pickRenderQuality(scene: Scene): RenderQuality {
  const touchFirst = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && typeof window !== 'undefined' && window.innerWidth < 1100;
  return webGLVersion(scene) >= 2 && !touchFirst ? 'high' : 'standard';
}

/**
 * Cinematic finish for the whole frame: filmic (ACES) tone mapping, a touch of
 * contrast and saturation, soft bloom on bright highlights (lamps, sun glints),
 * anti-aliasing, gentle sharpening and a light vignette. On 'high', screen-space
 * ambient occlusion darkens the contact points (under cars, along walls, in corners).
 */
export function createRenderPipeline(scene: Scene, camera: ArcRotateCamera, quality: RenderQuality) {
  const pipeline = new DefaultRenderingPipeline('cinematic', true, scene, [camera]);
  pipeline.samples = webGLVersion(scene) >= 2 ? 4 : 1;
  pipeline.fxaaEnabled = true;
  pipeline.imageProcessingEnabled = true;
  const image = pipeline.imageProcessing;
  image.toneMappingEnabled = true;
  image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  image.exposure = 1.25;
  image.contrast = 1.12;
  image.colorCurvesEnabled = true;
  if (image.colorCurves) {
    image.colorCurves.globalSaturation = 18;
    image.colorCurves.highlightsHue = 40;
    image.colorCurves.highlightsDensity = 8;
  }
  image.vignetteEnabled = true;
  image.vignetteWeight = 1.4;
  image.vignetteColor = new Color4(0.05, 0.07, 0.12, 0);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.82;
  pipeline.bloomWeight = 0.28;
  pipeline.bloomKernel = 48;
  pipeline.bloomScale = 0.5;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.22;

  let ssao: SSAO2RenderingPipeline | null = null;
  if (quality === 'high' && SSAO2RenderingPipeline.IsSupported) {
    ssao = new SSAO2RenderingPipeline('contact-shadows', scene, { ssaoRatio: 0.5, blurRatio: 1 }, [camera]);
    ssao.radius = 1.1;
    ssao.totalStrength = 0.9;
    ssao.base = 0.12;
    ssao.samples = 16;
    ssao.maxZ = 60;
    ssao.expensiveBlur = true;
  }
  return {
    dispose() {
      ssao?.dispose();
      pipeline.dispose();
    },
  };
}

/**
 * Keeps the third-person camera from ending up inside walls and roofs: each
 * frame it casts a ray from the player out to the camera, and if a building,
 * tree or fence is in the way the camera moves in front of it, then eases back
 * out to the chosen distance once the view is clear. Faded indoor walls are
 * unpickable, so they never pull the camera in.
 */
export function createCameraOcclusionGuard(camera: ArcRotateCamera, scene: Scene, ignore: (mesh: AbstractMesh) => boolean) {
  let desired = camera.radius;
  let pulled = false;
  let presetLowerLimit = camera.lowerRadiusLimit;
  const ray = new Ray(camera.getTarget().clone(), camera.position.clone(), 1);
  const predicate = (mesh: AbstractMesh) => mesh.isPickable && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0.5 && !ignore(mesh);
  return {
    update(seconds: number) {
      if (!pulled) { desired = camera.radius; presetLowerLimit = camera.lowerRadiusLimit; }
      const target = camera.getTarget();
      const direction = camera.position.subtract(target);
      const length = direction.length();
      if (length < 1e-3) return;
      ray.origin.copyFrom(target);
      ray.direction.copyFrom(direction.scaleInPlace(1 / length));
      ray.length = desired;
      const hit = scene.pickWithRay(ray, predicate);
      if (hit?.hit && hit.distance < desired) {
        const radius = Math.max(0.9, hit.distance - 0.35);
        camera.lowerRadiusLimit = Math.min(presetLowerLimit ?? radius, radius);
        camera.radius = radius;
        pulled = true;
      } else if (pulled) {
        camera.radius += (desired - camera.radius) * Math.min(1, Math.max(0, seconds) * 3);
        if (Math.abs(desired - camera.radius) < 0.05) {
          camera.radius = desired;
          camera.lowerRadiusLimit = presetLowerLimit;
          pulled = false;
        }
      }
    },
  };
}
