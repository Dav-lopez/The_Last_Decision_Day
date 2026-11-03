import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, Vector3,
  type DirectionalLight, type HemisphericLight, type Scene, type ShadowGenerator, type TargetCamera } from '@babylonjs/core';
import { rainDropCount, weatherLook, wetSurface, type WeatherState } from './weather.mjs';

/**
 * Weather in the 3D world (open-world 18a): rain that falls around the camera
 * (with splashes at your feet), wet roads that darken and shine under the sun
 * and street lamps, an overcast sky layer, greyer and thicker haze, a dimmer
 * sun and softer shadows. Loaded the first time the weather isn't clear.
 *
 * The day/evening lighting sets the base values; `rebase()` re-reads them after
 * it changes, and the weather is applied on top as multipliers.
 */

/** Ground materials that get wet (Maple Street, the roads out of town and downtown). */
const WET_MATERIALS = ['street', 'path', 'town asphalt', 'town sidewalk', 'city asphalt', 'city sidewalks', 'city brick pavers'];
const GREY_DAY = new Color3(0.62, 0.65, 0.68);
const GREY_EVENING = new Color3(0.2, 0.22, 0.26);
const RAIN_HEIGHT = 11;
const DROP_SPEED = 17;

export type WeatherView = {
  /** Call after the day/evening lighting ('all') or only the fog density ('fog') changes, so the weather applies on top. */
  rebase(part?: 'all' | 'fog'): void;
  update(state: WeatherState, frame: { evening: boolean; outdoors: boolean; camera: TargetCamera; quality: { scale: number; base: number } }): void;
  /** Rain drops alive right now (the playtest reads it). */
  drops(): number;
  dispose(): void;
};

function streakTexture(scene: Scene) {
  const texture = new DynamicTexture('rain streak', { width: 8, height: 64 }, scene, false);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.clearRect(0, 0, 8, 64);
  context.fillStyle = gradient;
  context.fillRect(3, 0, 2, 64);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

function splashTexture(scene: Scene) {
  const texture = new DynamicTexture('rain splash', { width: 32, height: 32 }, scene, false);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, 32, 32);
  const glow = context.createRadialGradient(16, 16, 4, 16, 16, 15);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(0.7, 'rgba(255,255,255,0.8)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 32, 32);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/** A grey, heavy cloud layer painted for the inside of a sphere (fades out toward the zenith edge, wraps in U). */
function overcastTexture(scene: Scene) {
  const width = 512;
  const height = 256;
  const texture = new DynamicTexture('sky overcast', { width, height }, scene, true);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#7d848c');
  gradient.addColorStop(0.45, '#a7adb2');
  gradient.addColorStop(0.52, '#b9bdc0');
  gradient.addColorStop(1, '#b9bdc0');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  let seed = 11;
  const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 160; i++) {
    const x = next() * width;
    const y = height * (0.05 + next() * 0.44);
    const radius = 18 + next() * 46;
    const shade = next() < 0.5 ? '96,102,110' : '200,204,208';
    for (const offset of [-width, 0, width]) {
      const puff = context.createRadialGradient(x + offset, y, 0, x + offset, y, radius);
      puff.addColorStop(0, `rgba(${shade},0.35)`);
      puff.addColorStop(1, `rgba(${shade},0)`);
      context.fillStyle = puff;
      context.fillRect(x + offset - radius, y - radius, radius * 2, radius * 2);
    }
  }
  texture.update();
  return texture;
}

export function createWeatherView(scene: Scene, lights: { sun: DirectionalLight; sky: HemisphericLight; shadows: ShadowGenerator | null; setSunGlow?: (amount: number) => void }): WeatherView {
  const { sun, sky, shadows } = lights;
  let base = { sun: sun.intensity, sky: sky.intensity, fog: scene.fogDensity, fogColor: scene.fogColor.clone() };
  let lastKey = '';

  // Overcast sky: a second dome just inside the painted sky, faded in by cloud cover.
  const overcastMaterial = new StandardMaterial('sky overcast', scene);
  overcastMaterial.disableLighting = true;
  overcastMaterial.backFaceCulling = false;
  overcastMaterial.fogEnabled = false;
  overcastMaterial.disableDepthWrite = true;
  overcastMaterial.emissiveTexture = overcastTexture(scene);
  overcastMaterial.diffuseColor = Color3.Black();
  overcastMaterial.specularColor = Color3.Black();
  overcastMaterial.alpha = 0;
  const overcast = MeshBuilder.CreateSphere('sky overcast', { diameter: 1560, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  overcast.material = overcastMaterial;
  overcast.infiniteDistance = true;
  overcast.isPickable = false;
  overcast.applyFog = false;
  overcast.setEnabled(false);

  // Rain: stretched streaks falling through a box that follows the camera.
  const emitter = new Vector3(0, RAIN_HEIGHT, 0);
  const rain = new ParticleSystem('rain', 1800, scene);
  rain.particleTexture = streakTexture(scene);
  rain.emitter = emitter;
  rain.createBoxEmitter(new Vector3(-0.08, -1, 0.04), new Vector3(-0.05, -1, 0.06), new Vector3(-13, 0, -13), new Vector3(13, 2, 13));
  rain.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
  rain.minEmitPower = DROP_SPEED * 0.9;
  rain.maxEmitPower = DROP_SPEED * 1.1;
  rain.minSize = 1;
  rain.maxSize = 1;
  rain.minScaleX = 0.018;
  rain.maxScaleX = 0.026;
  rain.minScaleY = 0.45;
  rain.maxScaleY = 0.7;
  rain.color1 = new Color4(0.78, 0.83, 0.9, 0.42);
  rain.color2 = new Color4(0.7, 0.76, 0.84, 0.3);
  rain.colorDead = new Color4(0.7, 0.76, 0.84, 0);
  rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  rain.minLifeTime = rain.maxLifeTime = (RAIN_HEIGHT + 1) / DROP_SPEED;
  rain.emitRate = 0;
  rain.updateSpeed = 1 / 60;
  rain.isLocal = false;

  // Splashes: small rings that flick up where drops land around you.
  const splashAt = new Vector3(0, 0.04, 0);
  const splash = new ParticleSystem('rain splashes', 360, scene);
  splash.particleTexture = splashTexture(scene);
  splash.emitter = splashAt;
  splash.createBoxEmitter(new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(-7, 0, -7), new Vector3(7, 0, 7));
  splash.minEmitPower = 0.2;
  splash.maxEmitPower = 0.5;
  splash.minSize = 0.05;
  splash.maxSize = 0.12;
  splash.addSizeGradient(0, 0.4);
  splash.addSizeGradient(1, 1.6);
  splash.minLifeTime = 0.18;
  splash.maxLifeTime = 0.32;
  splash.color1 = new Color4(0.85, 0.9, 0.95, 0.5);
  splash.color2 = new Color4(0.85, 0.9, 0.95, 0.35);
  splash.colorDead = new Color4(0.85, 0.9, 0.95, 0);
  splash.billboardMode = ParticleSystem.BILLBOARDMODE_Y;
  splash.emitRate = 0;
  splash.updateSpeed = 1 / 60;
  let raining = false;

  // Wet ground: darker, glossier; the dry look is remembered per material.
  const dry = new Map<StandardMaterial, { diffuse: Color3; specular: Color3; power: number }>();
  let wetApplied = -1;
  let wetScan = 0;
  const applyWet = (wet: number, force: boolean) => {
    const level = Math.round(wet * 50) / 50;
    if (!force && level === wetApplied) return;
    wetApplied = level;
    const look = wetSurface(level);
    for (const name of WET_MATERIALS) {
      for (const material of scene.materials) {
        if (material.name !== name || !(material instanceof StandardMaterial)) continue;
        if (!dry.has(material)) dry.set(material, { diffuse: material.diffuseColor.clone(), specular: material.specularColor.clone(), power: material.specularPower });
        const original = dry.get(material)!;
        material.diffuseColor = original.diffuse.scale(look.darken);
        const shine = Math.max(original.specular.r, look.specular);
        material.specularColor = level > 0 ? new Color3(shine, shine * 1.03, shine * 1.08) : original.specular.clone();
        material.specularPower = level > 0 ? look.power : original.power;
      }
    }
  };

  const view: WeatherView = {
    rebase(part = 'all') {
      base = part === 'fog' ? { ...base, fog: scene.fogDensity }
        : { sun: sun.intensity, sky: sky.intensity, fog: scene.fogDensity, fogColor: scene.fogColor.clone() };
      lastKey = '';
    },
    update(state, frame) {
      const look = weatherLook(state, frame.evening);
      const key = `${look.overcast.toFixed(2)}|${state.fog.toFixed(2)}|${state.rain.toFixed(2)}|${frame.evening}|${frame.outdoors}`;
      if (key !== lastKey) {
        lastKey = key;
        sun.intensity = base.sun * look.sun;
        sky.intensity = base.sky * look.sky;
        // Indoors the haze stays as it is: fog belongs outside.
        scene.fogDensity = base.fog * (frame.outdoors ? look.fogScale : 1);
        const haze = Color3.Lerp(base.fogColor, frame.evening ? GREY_EVENING : GREY_DAY, look.grey * 0.85);
        scene.fogColor = haze;
        scene.clearColor = new Color4(haze.r, haze.g, haze.b, 1);
        shadows?.setDarkness(look.shadowDarkness);
        overcastMaterial.alpha = look.overcast * 0.92;
        (overcastMaterial.emissiveTexture as DynamicTexture).level = frame.evening ? 0.32 : 1;
        overcast.setEnabled(look.overcast > 0.01);
        lights.setSunGlow?.(look.sunGlow);
      }
      wetScan -= 1;
      // Downtown's ground materials appear on the first trip there: look again every few hundred frames.
      applyWet(state.wet, wetScan <= 0 && state.wet > 0);
      if (wetScan <= 0) wetScan = 300;

      const camera = frame.camera.globalPosition;
      const drops = frame.outdoors ? rainDropCount(state.rain, frame.quality) : 0;
      if (drops > 0) {
        // A little ahead of the camera, so the view is full of rain and the box isn't seen from outside.
        const ahead = frame.camera.getForwardRay(1).direction;
        emitter.set(camera.x + ahead.x * 5, Math.max(camera.y, 1) + RAIN_HEIGHT - 2, camera.z + ahead.z * 5);
        rain.minLifeTime = rain.maxLifeTime = (emitter.y + 0.5) / DROP_SPEED;
        rain.emitRate = drops / rain.maxLifeTime;
        splashAt.set(camera.x + ahead.x * 4, 0.04, camera.z + ahead.z * 4);
        splash.emitRate = Math.min(500, drops * 0.6);
        if (!raining) { rain.start(); splash.start(); raining = true; }
      } else if (raining) {
        rain.stop();
        splash.stop();
        raining = false;
      }
    },
    drops: () => rain.getActiveCount(),
    dispose() {
      applyWet(0, true);
      rain.dispose();
      splash.dispose();
      overcast.dispose();
      overcastMaterial.emissiveTexture?.dispose();
      overcastMaterial.dispose();
    },
  };
  return view;
}
