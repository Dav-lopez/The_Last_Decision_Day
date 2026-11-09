import { type AbstractMesh, Color3, Color4, DynamicTexture, FresnelParameters, Matrix, Mesh, MeshBuilder, MirrorTexture, ParticleSystem, Plane, Quaternion, Ray, StandardMaterial, Vector3,
  type DirectionalLight, type HemisphericLight, type Scene, type ShadowGenerator, type TargetCamera } from '@babylonjs/core';
import { PUDDLES, REFLECTIONS, cloudDrift, puddleLevel, puddlesNear, rainDropCount, weatherLook, wetReflection, wetSurface, type WeatherState } from './weather.mjs';

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
/** Babylon types this as non-null, but a missing Fresnel is what it checks for. */
const NO_FRESNEL = null as unknown as FresnelParameters;
const RAIN_HEIGHT = 11;
const DROP_SPEED = 17;

export type WeatherView = {
  /** Call after the day/evening lighting ('all') or only the fog density ('fog') changes, so the weather applies on top. */
  rebase(part?: 'all' | 'fog'): void;
  update(state: WeatherState, frame: { evening: boolean; outdoors: boolean; camera: TargetCamera; quality: { scale: number; base: number };
    /** Seconds since the last frame (moves the clouds) and where you are (puddles are found again in a new place). */
    seconds?: number; place?: string; player?: { x: number; z: number };
    /** The device can afford mirrored wet roads (20c): a second, smaller view of the street. */
    reflections?: boolean }): void;
  /** Rain drops alive right now (the playtest reads it). */
  drops(): number;
  /** Puddles drawn right now and how full they are (the playtest reads it). */
  puddles(): { count: number; level: number };
  /** Wet-road reflections right now: on or off, their strength on the road and in puddles, and how many meshes are mirrored. */
  reflections(): { on: boolean; road: number; puddle: number; meshes: number };
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
  // Size gradients are sizes in metres, not multipliers of minSize/maxSize: a splash grows from 3 cm to 13 cm.
  splash.addSizeGradient(0, 0.03);
  splash.addSizeGradient(1, 0.13);
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
  const isWetGround = (mesh: { material: { name: string } | null }) => Boolean(mesh.material && WET_MATERIALS.includes(mesh.material.name));
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

  // Puddles (18c): flat glossy pools at fixed spots on the wet ground near you, one thin-instanced mesh.
  const puddleMaterial = new StandardMaterial('rain puddle', scene);
  puddleMaterial.diffuseColor = new Color3(0.05, 0.06, 0.08);
  puddleMaterial.specularColor = new Color3(0.9, 0.93, 0.98);
  puddleMaterial.specularPower = 160;
  puddleMaterial.alpha = 0;
  puddleMaterial.zOffset = -3;
  puddleMaterial.backFaceCulling = false;
  const puddle = MeshBuilder.CreateDisc('rain puddles', { radius: 1, tessellation: 22 }, scene);
  puddle.rotation.x = Math.PI / 2;
  puddle.bakeCurrentTransformIntoVertices();
  puddle.material = puddleMaterial;
  puddle.isPickable = false;
  puddle.receiveShadows = true;
  puddle.alwaysSelectAsActiveMesh = true;
  puddle.setEnabled(false);
  const groundY = new Map<string, number | null>();
  const down = new Ray(new Vector3(), new Vector3(0, -1, 0), 12);
  let puddlePlace = '';
  let puddleCell = '';
  let puddleShown = -1;
  let puddleCount = 0;
  let puddleFill = 0;
  let overcastOffset = 0;
  const layPuddles = (player: { x: number; z: number }, level: number, place: string) => {
    if (place !== puddlePlace) { groundY.clear(); puddlePlace = place; puddleCell = ''; }
    const cell = `${Math.floor(player.x / 4)},${Math.floor(player.z / 4)}`;
    const rounded = Math.round(level * 40) / 40;
    if (cell === puddleCell && rounded === puddleShown) return;
    const near = puddlesNear(player.x, player.z);
    let casts = 0;
    let pending = false;
    const matrices: number[] = [];
    const size = 0.45 + 0.55 * rounded;
    for (const spot of near) {
      if (!groundY.has(spot.key)) {
        // Only look up a few new spots per frame, so walking into fresh ground never stalls a frame.
        if (casts >= 6) { pending = true; continue; }
        casts += 1;
        down.origin.set(spot.x, 6, spot.z);
        const hit = scene.pickWithRay(down, (mesh: AbstractMesh) => isWetGround(mesh));
        groundY.set(spot.key, hit?.hit && hit.pickedPoint ? hit.pickedPoint.y : null);
      }
      const y = groundY.get(spot.key);
      if (y === null || y === undefined) continue;
      const matrix = Matrix.Compose(new Vector3(spot.radius * spot.stretch * size, 1, spot.radius * size),
        Quaternion.RotationAxis(Vector3.Up(), spot.rotation), new Vector3(spot.x, y + 0.025, spot.z));
      matrices.push(...matrix.toArray());
    }
    puddleCount = matrices.length / 16;
    puddle.thinInstanceSetBuffer('matrix', puddleCount ? new Float32Array(matrices) : null, 16, false);
    puddle.setEnabled(puddleCount > 0);
    // Try again next frame while spots are still being looked up.
    puddleCell = pending ? '' : cell;
    puddleShown = rounded;
  };

  // Reflections (20c): one planar mirror of the street at road height, drawn at a fraction of the screen's
  // resolution every other frame, smeared down the screen like light on wet asphalt. Only what stands up off the
  // ground nearby is mirrored (not the ground itself), and only while the device can afford it.
  let mirror: MirrorTexture | null = null;
  let reflecting = { on: false, road: 0, puddle: 0 };
  let reflectKey = '';
  const mirrorView = () => {
    if (mirror) return mirror;
    const texture = new MirrorTexture('wet road reflections', { ratio: REFLECTIONS.ratio }, scene, false);
    texture.mirrorPlane = Plane.FromPositionAndNormal(new Vector3(0, REFLECTIONS.planeY, 0), new Vector3(0, -1, 0));
    texture.refreshRate = REFLECTIONS.refreshRate;
    texture.renderParticles = false;
    texture.renderSprites = false;
    texture.blurKernelX = 3;
    texture.blurKernelY = 24;
    const eye = new Vector3();
    texture.renderListPredicate = (mesh: AbstractMesh) => {
      if (mesh === puddle || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0.05) return false;
      if ((mesh.layerMask & 0x0fffffff) === 0 || isWetGround(mesh)) return false;
      const bounds = mesh.getBoundingInfo();
      if (bounds.boundingBox.maximumWorld.y < REFLECTIONS.minHeight) return false;
      const sphere = bounds.boundingSphere;
      const camera = scene.activeCamera;
      if (camera) eye.copyFrom(camera.globalPosition);
      return Vector3.Distance(sphere.centerWorld, eye) - sphere.radiusWorld < REFLECTIONS.range;
    };
    mirror = texture;
    return texture;
  };
  const fresnel = (strength: number) => new FresnelParameters({
    bias: 0.1, power: 2,
    leftColor: new Color3(strength, strength, strength),
    rightColor: new Color3(strength * REFLECTIONS.facing, strength * REFLECTIONS.facing, strength * REFLECTIONS.facing),
  });
  const applyReflection = (next: { on: boolean; road: number; puddle: number }, force: boolean) => {
    const key = `${next.on}|${next.road}|${next.puddle}`;
    if (!force && key === reflectKey) return;
    reflectKey = key;
    reflecting = next;
    const texture = next.on ? mirrorView() : null;
    for (const material of scene.materials) {
      if (!(material instanceof StandardMaterial) || !WET_MATERIALS.includes(material.name)) continue;
      if (texture && next.road > 0) {
        material.reflectionTexture = texture;
        material.reflectionFresnelParameters = fresnel(next.road);
      } else if (material.reflectionTexture === mirror) {
        material.reflectionTexture = null;
        material.reflectionFresnelParameters = NO_FRESNEL;
      }
    }
    if (texture && next.puddle > 0) {
      puddleMaterial.reflectionTexture = texture;
      puddleMaterial.reflectionFresnelParameters = fresnel(next.puddle);
    } else {
      puddleMaterial.reflectionTexture = null;
      puddleMaterial.reflectionFresnelParameters = NO_FRESNEL;
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
      // Clouds move: the overcast layer drifts a little faster than the painted clouds behind it.
      if (frame.seconds && frame.seconds > 0 && overcast.isEnabled()) {
        overcastOffset = (overcastOffset + Math.min(frame.seconds, 0.25) * cloudDrift(state) * 1.4) % 1;
        (overcastMaterial.emissiveTexture as DynamicTexture).uOffset = overcastOffset;
      }
      const level = frame.outdoors ? puddleLevel(state) : 0;
      puddleFill = level;
      if (level > 0.01 && frame.player) {
        // Puddles pick up the sky's colour (a cheap reflection) and fade in as they fill.
        const sky = scene.fogColor;
        puddleMaterial.emissiveColor.set(sky.r * 0.28, sky.g * 0.3, sky.b * 0.34);
        puddleMaterial.alpha = 0.82 * Math.min(1, level * 1.6);
        if (groundY.size > PUDDLES.max * 40) groundY.clear();
        layPuddles(frame.player, level, frame.place ?? '');
      } else if (puddleCount > 0 || puddleShown !== -1) {
        puddle.thinInstanceSetBuffer('matrix', null, 16, false);
        puddle.setEnabled(false);
        puddleCount = 0;
        puddleShown = -1;
        puddleCell = '';
      }
      wetScan -= 1;
      // Downtown's ground materials appear on the first trip there: look again every few hundred frames.
      applyWet(state.wet, wetScan <= 0 && state.wet > 0);
      applyReflection(wetReflection(state, Boolean(frame.reflections) && frame.outdoors), wetScan <= 0 && reflecting.on);
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
    puddles: () => ({ count: puddleCount, level: Math.round(puddleFill * 100) / 100 }),
    reflections: () => ({ ...reflecting, meshes: reflecting.on ? mirror?.renderList?.length ?? 0 : 0 }),
    dispose() {
      applyWet(0, true);
      applyReflection({ on: false, road: 0, puddle: 0 }, true);
      mirror?.dispose();
      rain.dispose();
      splash.dispose();
      overcast.dispose();
      puddle.dispose();
      puddleMaterial.dispose();
      overcastMaterial.emissiveTexture?.dispose();
      overcastMaterial.dispose();
    },
  };
  return view;
}
