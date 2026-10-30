import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type CSSProperties } from 'react';
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, Engine, HemisphericLight,
  MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { loadRiggedAvatar, type RiggedAvatar } from './riggedAvatar';
import type { Emotion } from './facialEmotions';
import { resolveCharacterEmotion } from './characterEmotion.mjs';
import { loadSchoolEnvironment } from './schoolEnvironment';
import { smoothHumanHeading } from './humanMotion.mjs';
import { movementHeading } from './riggedPresentation.mjs';
import { isNearSchool, type PlanarPosition } from './movement.mjs';
import { stepLocomotion } from './locomotion.mjs';
import { createCameraControls } from './cameraControls.mjs';
import { createStreetLighting } from './streetLighting.mjs';
import { addParkedCarFallbacks } from './streetCars.mjs';
import { schoolWaypoint } from './schoolWayfinding.mjs';
import { createMovementInput } from './inputState.mjs';
import { addPlayableNeighborhoodDetails } from './neighborhoodEnvironment';
import { upgradeNeighborhoodAssets } from './realEnvironmentAssets';
import { LOOKS, colorFor, readLook, writeLook, type Look } from './appearance.mjs';
import { PARKED_CARS } from './streetLayout.mjs';
import { canExitVehicle, chaseCameraAlpha, driveInput, speedKmh, stepVehicle, vehicleExitPosition, type CarState } from './vehicleDrive.mjs';
import { closestInteraction, transitionInteraction, type InteractionState } from './worldInteractions.mjs';

type SchoolActivityView = { id: string; title: string; description: string; timeCost: number };
type SchoolPreview = { activityId: string; before: Record<string, number>; after: Record<string, number> };
type WorldProps = {
  characterId: string;
  displayName: string;
  demoMode?: boolean;
  onSchoolEnter: () => void;
  activities: ReadonlyArray<SchoolActivityView>;
  timeRemaining: number | null;
  busy: boolean;
  canExecuteActivity: (timeCost: number) => boolean;
  onPreviewActivity: (activityId: string) => void;
  onExecuteActivity: (activityId: string) => void;
  preview: SchoolPreview | null;
};
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift']);

function surface(scene: Scene, name: string, color: string): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor = new Color3(0.12, 0.12, 0.12);
  return material;
}

/** A deliberately asset-free 3D vertical slice; replace primitives with licensed GLB models later. */
function createNeighborhood(scene: Scene) {
  const grass = surface(scene, 'grass', '#548f64');
  const path = surface(scene, 'path', '#c0b9ab');
  const street = surface(scene, 'street', '#485667');
  const school = surface(scene, 'school', '#e0ba84');
  const roof = surface(scene, 'roof', '#344f75');
  const entrance = surface(scene, 'door', '#455c70');
  const houses = surface(scene, 'houses', '#bf8291');
  const wood = surface(scene, 'wood', '#79553a');
  const leaves = surface(scene, 'leaves', '#318660');

  const ground = MeshBuilder.CreateGround('park', { width: 24, height: 24 }, scene);
  ground.material = grass;
  // Subtle physically based texture variation using a deterministic generated
  // image. No third-party texture licensing or network request is required.
  const lawnTexture = new DynamicTexture('suburban lawn detail', { width: 256, height: 256 }, scene, false);
  const lawnContext = lawnTexture.getContext();
  lawnContext.fillStyle = '#6d9664';
  lawnContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = (i * 73 + Math.floor(i / 17) * 31) % 256;
    const y = (i * 131 + Math.floor(i / 11) * 19) % 256;
    lawnContext.fillStyle = i % 3 === 0 ? '#517e4d' : i % 3 === 1 ? '#86a979' : '#739a68';
    lawnContext.fillRect(x, y, 1 + i % 3, 2 + i % 4);
  }
  lawnTexture.update();
  lawnTexture.uScale = 12;
  lawnTexture.vScale = 12;
  grass.diffuseTexture = lawnTexture;
  grass.diffuseColor = Color3.White();
  const road = MeshBuilder.CreateGround('neighborhood road', { width: 4.2, height: 24 }, scene);
  road.position.y = 0.015;
  road.material = street;
  const asphaltTexture = new DynamicTexture('asphalt grain', { width: 256, height: 256 }, scene, false);
  const asphaltContext = asphaltTexture.getContext();
  asphaltContext.fillStyle = '#5c6063';
  asphaltContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = (i * 89 + Math.floor(i / 13) * 37) % 256;
    const y = (i * 157 + Math.floor(i / 7) * 29) % 256;
    asphaltContext.fillStyle = i % 3 === 0 ? '#464c4f' : i % 3 === 1 ? '#777b7a' : '#686e70';
    asphaltContext.fillRect(x, y, 1 + i % 2, 1 + i % 2);
  }
  asphaltTexture.update();
  asphaltTexture.uScale = 2;
  asphaltTexture.vScale = 10;
  street.diffuseTexture = asphaltTexture;
  street.diffuseColor = Color3.White();
  const walkway = MeshBuilder.CreateGround('school walkway', { width: 2.5, height: 5 }, scene);
  walkway.position.set(0, 0.03, -4.5);
  walkway.material = path;

  const schoolBuilding = MeshBuilder.CreateBox('school building', { width: 7.8, height: 3.7, depth: 4.75 }, scene);
  schoolBuilding.position.set(0, 1.85, -9.12);
  schoolBuilding.material = school;
  const schoolRoof = MeshBuilder.CreateBox('school roof', { width: 8.3, height: 0.45, depth: 5.1 }, scene);
  schoolRoof.position.set(0, 3.9, -9.12);
  schoolRoof.material = roof;
  const door = MeshBuilder.CreateBox('school entrance', { width: 1.7, height: 2.5, depth: 0.12 }, scene);
  door.position.set(0, 1.25, -6.68);
  door.material = entrance;

  // American suburban street: individual facades, pitched roofs, garages,
  // front porches, window frames and short concrete driveways.
  const siding = [
    surface(scene, 'warm ivory siding', '#d8cbb7'),
    surface(scene, 'blue-gray siding', '#899eac'),
  ];
  const trim = surface(scene, 'house white trim', '#e8e8df');
  const windowGlass = surface(scene, 'residential window glass', '#506f81');
  const garageDoor = surface(scene, 'garage panel', '#b5b9b6');
  const porchWood = surface(scene, 'porch front door', '#765643');
  for (const [index, x] of [-8.4, 8.4].entries()) {
    const house = MeshBuilder.CreateBox('home', { width: 4.2, height: 3.1, depth: 4.9 }, scene);
    house.position.set(x, 1.55, -5.05);
    house.material = siding[index];
    // Two sloping roof planes create a recognizable gabled suburban roof.
    for (const side of [-1, 1]) {
      const slope = MeshBuilder.CreateBox('home pitched roof', {
        width: 2.85, height: 0.18, depth: 5.35,
      }, scene);
      slope.position.set(x + side * 1.18, 3.85, -5.05);
      slope.rotation.z = side * -0.49;
      slope.material = roof;
    }
    const entrySide = x < 0 ? 1 : -1;
    const entryX = x + entrySide * 0.85;
    const frontZ = -2.53;
    const frontDoor = MeshBuilder.CreateBox('home front door', {
      width: 0.9, height: 2.05, depth: 0.08,
    }, scene);
    frontDoor.position.set(entryX, 1.03, frontZ);
    frontDoor.material = porchWood;
    const porch = MeshBuilder.CreateBox('home porch landing', {
      width: 1.55, height: 0.16, depth: 0.92,
    }, scene);
    porch.position.set(entryX, 0.09, -2.05);
    porch.material = path;
    for (const offset of [-1.32, 1.32]) {
      const window = MeshBuilder.CreateBox('home front window', {
        width: 0.95, height: 1.05, depth: 0.085,
      }, scene);
      window.position.set(x + offset, 1.8, frontZ);
      window.material = windowGlass;
      for (const edge of [-0.49, 0.49]) {
        const frame = MeshBuilder.CreateBox('home window vertical trim', {
          width: 0.075, height: 1.13, depth: 0.1,
        }, scene);
        frame.position.set(x + offset + edge, 1.8, frontZ + 0.055);
        frame.material = trim;
      }
      const sill = MeshBuilder.CreateBox('home window sill', {
        width: 1.1, height: 0.09, depth: 0.2,
      }, scene);
      sill.position.set(x + offset, 1.23, frontZ + 0.08);
      sill.material = trim;
    }
    const garage = MeshBuilder.CreateBox('home garage door', {
      width: 1.5, height: 1.85, depth: 0.09,
    }, scene);
    garage.position.set(x - entrySide * 1.18, 0.94, frontZ + 0.05);
    garage.material = garageDoor;
    for (let panel = 1; panel <= 3; panel++) {
      const groove = MeshBuilder.CreateBox('garage horizontal seam', {
        width: 1.43, height: 0.025, depth: 0.1,
      }, scene);
      groove.position.set(x - entrySide * 1.18, panel * 0.45, frontZ + 0.11);
      groove.material = trim;
    }
    const driveway = MeshBuilder.CreateGround('home driveway', {
      width: 1.7, height: 2.1,
    }, scene);
    driveway.position.set(x - entrySide * 1.18, 0.034, -1.22);
    driveway.material = path;
  }

  // Organic tree silhouettes: tapered trunks, angled branches and overlapping
  // asymmetric foliage clusters instead of the old cylinder + green ball.
  const leafTones = [
    surface(scene, 'foliage shade', '#315d37'),
    surface(scene, 'foliage midtone', '#477a45'),
    surface(scene, 'foliage sunlit', '#659653'),
    surface(scene, 'foliage deep', '#274d32'),
  ];
  const treeSites: Array<[number, number, number]> = [
    [-8, 3, 1], [8, 3, 1.12], [-8, 8, 0.94],
    [8, 8, 1.06], [-4.8, -8.4, 0.88], [4.8, -8.4, 0.96],
  ];
  treeSites.forEach(([x, z, scale], treeIndex) => {
    const trunk = MeshBuilder.CreateCylinder('tree trunk', {
      height: 2.55 * scale, diameterBottom: 0.5 * scale,
      diameterTop: 0.24 * scale, tessellation: 9,
    }, scene);
    trunk.position.set(x, 1.275 * scale, z);
    trunk.material = wood;
    // Deterministic branches and foliage: no runtime randomization.
    for (let branch = 0; branch < 5; branch++) {
      const angle = branch * Math.PI * 2 / 5 + treeIndex * 0.38;
      const reach = (0.85 + (branch % 2) * 0.24) * scale;
      const bx = Math.cos(angle) * reach;
      const bz = Math.sin(angle) * reach;
      const limb = MeshBuilder.CreateCylinder('tree angled branch', {
        height: 1.7 * scale, diameterBottom: 0.17 * scale,
        diameterTop: 0.075 * scale, tessellation: 6,
      }, scene);
      limb.position.set(x + bx * 0.42, 2.3 * scale, z + bz * 0.42);
      limb.rotation.z = Math.cos(angle) * 0.55;
      limb.rotation.x = -Math.sin(angle) * 0.55;
      limb.material = wood;
      for (let cluster = 0; cluster < 2; cluster++) {
        const canopy = MeshBuilder.CreateSphere('tree foliage cluster', {
          diameter: (1.45 + ((branch + cluster) % 3) * 0.24) * scale,
          segments: 9,
        }, scene);
        canopy.scaling.set(1.12, 0.78 + cluster * 0.1, 0.94);
        canopy.position.set(
          x + bx * (0.65 + cluster * 0.48),
          (2.75 + cluster * 0.38 + (branch % 2) * 0.2) * scale,
          z + bz * (0.65 + cluster * 0.48),
        );
        canopy.material = leafTones[(treeIndex + branch + cluster) % leafTones.length];
      }
    }
    const crownTop = MeshBuilder.CreateSphere('tree irregular crown top', {
      diameter: 1.55 * scale, segments: 9,
    }, scene);
    crownTop.scaling.set(0.94, 0.85, 1.08);
    crownTop.position.set(x, 3.85 * scale, z);
    crownTop.material = leafTones[(treeIndex + 2) % leafTones.length];
  });
  // A glowing doorway marker makes the first destination recognizable without
  // downloading assets or changing server-authoritative school interaction rules.
  const markerMaterial = surface(scene, 'school waypoint gold', '#ffe0a0');
  markerMaterial.emissiveColor = new Color3(0.6, 0.36, 0.08);
  const schoolMarker = MeshBuilder.CreateTorus('school entrance waypoint',
    { diameter: 0.85, thickness: 0.13, tessellation: 24 }, scene);
  schoolMarker.position.set(0, 4.6, -6.55);
  schoolMarker.rotation.x = Math.PI / 2;
  schoolMarker.material = markerMaterial;
  return schoolMarker;
}

function createAvatar(scene: Scene) {
  const root = new TransformNode('player', scene);
  const jacket = surface(scene, 'character jacket', '#5f83d8');
  const face = surface(scene, 'character skin', '#996b4f');
  const trousers = surface(scene, 'character trousers', '#28334a');
  const hair = surface(scene, 'character hair', '#25202a');

  const torso = MeshBuilder.CreateCapsule('character body', { height: 1.1, radius: 0.37 }, scene);
  torso.position.y = 1.15;
  torso.material = jacket;
  torso.parent = root;

  const head = MeshBuilder.CreateSphere('character head', { diameter: 0.68, segments: 12 }, scene);
  head.position.y = 2.02;
  head.material = face;
  head.parent = root;
  const cap = MeshBuilder.CreateSphere('character hair', { diameterX: 0.72, diameterY: 0.25, diameterZ: 0.7, segments: 10 }, scene);
  cap.position.y = 2.31;
  cap.material = hair;
  cap.parent = root;
  const legs = [-0.2, 0.2].map(x => {
    const leg = MeshBuilder.CreateCapsule('character leg', { height: 0.7, radius: 0.14 }, scene);
    leg.position.set(x, 0.38, 0);
    leg.material = trousers;
    leg.parent = root;
    return leg;
  });
  const arms = [-0.49, 0.49].map(x => {
    const arm = MeshBuilder.CreateCapsule('character arm', { height: 0.84, radius: 0.15 }, scene);
    arm.position.set(x, 1.23, 0);
    arm.material = jacket;
    arm.parent = root;
    return arm;
  });
  // Small, lightweight details make the character legible from both the
  // orbit camera and the front without downloading external character assets.
  const eyes = surface(scene, 'character eyes', '#24242b');
  const footwear = surface(scene, 'character shoes', '#262d3b');
  const backpack = surface(scene, 'character backpack', '#46546b');
  for (const x of [-0.13, 0.13]) {
    const eye = MeshBuilder.CreateSphere('character eye', { diameter: 0.095, segments: 8 }, scene);
    eye.position.set(x, 2.07, -0.315);
    eye.material = eyes;
    eye.parent = root;
  }
  const nose = MeshBuilder.CreateSphere('character nose', { diameter: 0.13, segments: 8 }, scene);
  nose.position.set(0, 1.98, -0.345);
  nose.material = face;
  nose.parent = root;
  const mouth = MeshBuilder.CreateBox('character mouth', { width: 0.16, height: 0.025, depth: 0.025 }, scene);
  mouth.position.set(0, 1.87, -0.31);
  mouth.material = eyes;
  mouth.parent = root;

  // Parent extremities to their limbs so the walking animation carries them.
  arms.forEach(arm => {
    const hand = MeshBuilder.CreateSphere('character hand', { diameter: 0.29, segments: 8 }, scene);
    hand.position.set(0, -0.45, 0);
    hand.material = face;
    hand.parent = arm;
  });
  legs.forEach(leg => {
    const shoe = MeshBuilder.CreateBox('character shoe', { width: 0.33, height: 0.21, depth: 0.49 }, scene);
    shoe.position.set(0, -0.26, -0.09);
    shoe.material = footwear;
    shoe.parent = leg;
  });
  const pack = MeshBuilder.CreateBox('character backpack', { width: 0.62, height: 0.84, depth: 0.26 }, scene);
  pack.position.set(0, 1.18, 0.36);
  pack.material = backpack;
  pack.parent = root;

  return { root, jacket, face, hair, legs, arms };
}

/** The WebGL view is optional: login and school actions remain usable if 3D fails. */
export default function WorldScene({
  characterId, displayName, demoMode = false, onSchoolEnter, activities, timeRemaining, busy,
  canExecuteActivity, onPreviewActivity, onExecuteActivity, preview,
}: WorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef(createMovementInput());
  const [sprintEnabled, setSprintEnabled] = useState(false);
  const sprintEnabledRef = useRef(false);
  const nearSchoolRef = useRef(false);
  const schoolOpenRef = useRef(false);
  const [error, setError] = useState('');
  const [nearSchool, setNearSchool] = useState(false);
  const [wayfinding, setWayfinding] = useState('');
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [look, setLook] = useState<Look>(() => readLook(characterId));
  const lookRef = useRef(look);
  const avatarRef = useRef<ReturnType<typeof createAvatar> | null>(null);
  const riggedRef = useRef<RiggedAvatar | null>(null);
  const [previewEmotion, setPreviewEmotion] = useState<Emotion>('neutral');
  const previewEmotionRef = useRef<Emotion>('neutral');
  const [modelStatus, setModelStatus] = useState('Loading character…');
  const [cameraMode, setCameraMode] = useState<'follow' | 'overhead'>('follow');
  const cameraModeRef = useRef<'follow' | 'overhead'>('follow');
  const cameraControlsRef = useRef<ReturnType<typeof createCameraControls> | null>(null);
  const lightingRef = useRef<ReturnType<typeof createStreetLighting> | null>(null);
  const [evening, setEvening] = useState(false);
  const [driving, setDriving] = useState(false);
  const [driveSpeed, setDriveSpeed] = useState(0);
  const [driveNotice, setDriveNotice] = useState('');
  const [nearCar, setNearCar] = useState(false);
  const interactRef = useRef<() => void>(() => {});
  const toggleCamera = () => {
    const next = cameraModeRef.current === 'follow' ? 'overhead' : 'follow';
    cameraModeRef.current = next;
    cameraControlsRef.current?.setMode(next);
    setCameraMode(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!Engine.isSupported()) {
      setError('3D graphics are unavailable on this device. Your school activities remain available below.');
      return;
    }

    let engine: Engine | undefined;
    try {
      engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
      engine.setHardwareScalingLevel(1 / Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)));
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.67, 0.83, 0.96, 1);
      const sun = new HemisphericLight('daylight', new Vector3(0, 1, 0), scene);
      sun.intensity = 0.65;
      const directional = new DirectionalLight('sun', new Vector3(-0.4, -1, -0.6), scene);
      directional.intensity = 1.35;
      directional.position.set(12, 22, 10);
      const schoolMarker = createNeighborhood(scene);
      let schoolAsset: Awaited<ReturnType<typeof loadSchoolEnvironment>> = null;
      let schoolAssetCancelled = false;
      addPlayableNeighborhoodDetails(scene);
      // Live car state: the driven car moves, and walking collides with it wherever it is parked.
      const cars: CarState[] = PARKED_CARS.map(car => ({ x: car.x, z: car.z, rotation: car.rotation, speed: 0 }));
      const carRoots: TransformNode[][] = addParkedCarFallbacks(scene).map(root => [root]);
      const placeCar = (index: number) => {
        for (const node of carRoots[index] ?? []) {
          node.position.x = cars[index].x;
          node.position.z = cars[index].z;
          node.rotation.y = cars[index].rotation;
        }
      };
      const lighting = createStreetLighting(scene, directional, sun);
      lightingRef.current = lighting;
      const environmentLoad = { cancelled: false };
      const shadows = new ShadowGenerator(1024, directional);
      shadows.useBlurExponentialShadowMap = true;
      shadows.blurKernel = 12;
      shadows.bias = 0.0005;
      shadows.normalBias = 0.02;
      shadows.setDarkness(0.3);
      void upgradeNeighborhoodAssets(scene, environmentLoad, shadows, roots => {
        roots.forEach((root, index) => { carRoots[index]?.push(root); placeCar(index); });
      });
      // Limit shadow-map draw calls to the large world silhouettes.
      // Ground and paving receive shadows but do not cast; small facade details
      // are omitted from the shadow pass while remaining visible in the scene.
      const environmentShadowCasters = new Set([
        'school building', 'school roof', 'home', 'home pitched roof', 'tree trunk',
        'tree angled branch', 'tree foliage cluster', 'tree irregular crown top',
        'parked car fallback body', 'parked car fallback cabin',
      ]);
      for (const mesh of scene.meshes) {
        mesh.receiveShadows = true;
        if (environmentShadowCasters.has(mesh.name)) {
          shadows.addShadowCaster(mesh, false);
        }
        if (['school building', 'school roof', 'home', 'home pitched roof'].includes(mesh.name)) mesh.checkCollisions = true;
      }
      void loadSchoolEnvironment(scene).then(asset => {
        if (schoolAssetCancelled || scene.isDisposed) { asset?.dispose(); return; }
        schoolAsset = asset;
        for (const mesh of asset?.meshes ?? []) { shadows.addShadowCaster(mesh, false); mesh.checkCollisions = true; }
      }).catch(error => {
        // Procedural school stays visible if the authored asset fails validation.
        console.warn('School glTF unavailable; using procedural fallback', error);
      });
      const avatarParts = createAvatar(scene);
      avatarRef.current = avatarParts;
      const { root: avatar } = avatarParts;
      avatarParts.jacket.diffuseColor = Color3.FromHexString(colorFor('outfit', look.outfit));
      avatarParts.face.diffuseColor = Color3.FromHexString(colorFor('skin', look.skin));
      avatarParts.hair.diffuseColor = Color3.FromHexString(colorFor('hair', look.hair));
      // Keep the fallback visible until the bundled, validated character is ready.
      const placeholderMeshes = avatar.getChildMeshes();
      for (const mesh of placeholderMeshes) shadows.addShadowCaster(mesh, false);
      let humanLoadCancelled = false;
      void loadRiggedAvatar(scene, avatar).then(human => {
        if (humanLoadCancelled || scene.isDisposed) { human?.dispose(); return; }
        if (!human) return;
        riggedRef.current = human;
        human.applyLook(lookRef.current);
        human.setEmotion(resolveCharacterEmotion(previewEmotionRef.current, 0));
        avatar.position.y = 0;
        for (const mesh of placeholderMeshes) {
          mesh.setEnabled(false);
          shadows.removeShadowCaster(mesh, false);
        }
        for (const mesh of human.root.getChildMeshes()) shadows.addShadowCaster(mesh, false);
        setModelStatus('Character ready · Idle, walk and run');
      }).catch(() => { if (!humanLoadCancelled) setModelStatus('Basic character in use. Reload to retry loading the human character.'); });
      let position: PlanarPosition = { x: 0, z: 3.8 };
      avatar.position.set(position.x, 0, position.z);
      const camera = new ArcRotateCamera('third-person camera', Math.PI / 2, 1.15, 7.5,
        new Vector3(position.x, 1.25, position.z), scene);
      const cameraControls = createCameraControls(camera);
      cameraControlsRef.current = cameraControls;
      // Arrow keys move the player. Babylon's default keyboard orbit input
      // previously rotated/tilted the camera at the same time.
      camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
      camera.panningSensibility = 0;
      camera.wheelDeltaPercentage = 0.015;
      camera.pinchDeltaPercentage = 0.01;
      camera.minZ = 0.1;
      camera.checkCollisions = true;
      camera.collisionRadius = new Vector3(0.25, 0.25, 0.25);
      camera.attachControl(canvas, false);

      let interaction: InteractionState = { mode: 'walking', targetId: null };
      let clock = 0;
      let noticeAt = -Infinity;
      const notify = (message: string) => { noticeAt = clock; setDriveNotice(message); };
      const carTargets = () => cars.map((car, index) => ({ id: `car-${index}`, type: 'vehicle' as const, x: car.x, z: car.z }));
      const drivenIndex = () => interaction.mode === 'driving' && interaction.targetId ? Number(interaction.targetId.slice(4)) : -1;
      // E (or the on-screen button) gets into the nearest car, or out of the driven one once stopped.
      const interact = () => {
        if (schoolOpenRef.current) return;
        const index = drivenIndex();
        if (index < 0) {
          const target = closestInteraction(position, carTargets());
          if (!target) return;
          interaction = transitionInteraction(interaction, target);
          inputRef.current.clear();
          avatar.setEnabled(false);
          setNearCar(false);
          setDriveNotice('');
          setDriveSpeed(0);
          setDriving(true);
          return;
        }
        const car = cars[index];
        if (!canExitVehicle(car)) { notify('Stop the car before getting out.'); return; }
        const exit = vehicleExitPosition(car, cars);
        if (!exit) { notify('No room to open a door here. Move the car a little.'); return; }
        car.speed = 0;
        position = exit;
        avatar.position.set(exit.x, 0, exit.z);
        avatar.rotation.y = car.rotation;
        interaction = transitionInteraction(interaction, 'exit');
        inputRef.current.clear();
        avatar.setEnabled(true);
        setDriveNotice('');
        setDriving(false);
      };
      interactRef.current = interact;
      const normalizeKey = (key: string) => key.length === 1 ? key.toLowerCase() : key;
      const onKeyDown = (event: KeyboardEvent) => {
        // Escape must also work when a button inside the school overlay has focus.
        if (event.key === 'Escape' && schoolOpenRef.current) {
          event.preventDefault();
          setSchoolOpen(false);
          return;
        }
        if (document.activeElement !== canvas) return;
        const key = normalizeKey(event.key);
        if (MOVE_KEYS.has(key)) {
          event.preventDefault();
          inputRef.current.press(`keyboard:${key}`, key);
        } else if (key === 'c' && !event.repeat) {
          event.preventDefault();
          toggleCamera();
        } else if (key === 'e' && !event.repeat) {
          event.preventDefault();
          if (nearSchoolRef.current && interaction.mode === 'walking') setSchoolOpen(open => !open);
          else interact();
        }
      };
      const onKeyUp = (event: KeyboardEvent) => {
        const key = normalizeKey(event.key);
        if (MOVE_KEYS.has(key)) inputRef.current.release(`keyboard:${key}`);
      };
      const clear = () => {
        inputRef.current.clear();
        sprintEnabledRef.current = false;
        setSprintEnabled(false);
      };
      const onVisibilityChange = () => { if (document.hidden) clear(); };
      const focus = () => { cameraControls.cancel(); canvas.focus({ preventScroll: true }); };
      const cancelCameraTransition = () => cameraControls.cancel();
      const resize = () => {
        engine?.setHardwareScalingLevel(1 / Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)));
        engine?.resize();
      };
      canvas.addEventListener('pointerdown', focus);
      canvas.addEventListener('wheel', cancelCameraTransition, { passive: true });
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', clear);
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', onVisibilityChange);

      let previousNear = false;
      let elapsed = 0;
      let waypointTimer = 0;
      let markerTime = 0;
      let hudTimer = 0;
      engine.runRenderLoop(() => {
        const delta = Math.min(engine!.getDeltaTime() / 1000, 0.05);
        // Controls follow the orbit camera: W always walks away from the viewer.
        const cameraDirection = camera.getForwardRay().direction;
        markerTime += delta;
        clock += delta;
        schoolMarker.position.y = 4.6 + Math.sin(markerTime * 2.5) * 0.12;
        const cameraForward = { x: cameraDirection.x, z: cameraDirection.z };
        const driven = drivenIndex();
        if (driven >= 0) {
          // Car-relative controls: W/S accelerate, brake and reverse; A/D steer.
          const keys = schoolOpenRef.current ? new Set<string>() : inputRef.current.pressed;
          const others = cars.filter((_, index) => index !== driven);
          const next = stepVehicle(cars[driven], driveInput(keys), delta, others);
          cars[driven] = { x: next.x, z: next.z, rotation: next.rotation, speed: next.speed };
          placeCar(driven);
          // Swing the camera behind the car while moving; parked, the player may orbit freely.
          if (Math.abs(next.speed) > 1) camera.alpha = smoothHumanHeading(camera.alpha, chaseCameraAlpha(next.rotation), delta, 2.5);
          hudTimer += delta;
          if (hudTimer >= 0.15) {
            hudTimer = 0;
            const kmh = speedKmh(next.speed);
            setDriveSpeed(previous => previous === kmh ? previous : kmh);
            if (next.collided) notify('Bump! Reverse with S to back away.');
            else if (clock - noticeAt > 2.5) setDriveNotice(previous => previous ? '' : previous);
            const waypoint = schoolWaypoint(next, cameraForward);
            const label = waypoint.distance === null ? '' : 'School · ' + Math.ceil(waypoint.distance) + ' units · ' + waypoint.direction;
            setWayfinding(previous => previous === label ? previous : label);
          }
          if (previousNear) { previousNear = false; nearSchoolRef.current = false; setNearSchool(false); }
          riggedRef.current?.update(0, delta);
          cameraControls.update(delta);
          cameraControls.follow(next, delta);
          scene.render();
          return;
        }
        const locomotion = stepLocomotion(position, schoolOpenRef.current ? new Set<string>() : inputRef.current.pressed,
          delta, sprintEnabledRef.current, cameraForward, cars);
        const { position: next, moving, speed: movementSpeed } = locomotion;
        if (moving) avatar.rotation.y = smoothHumanHeading(avatar.rotation.y, movementHeading(next.x - position.x, next.z - position.z), delta);
        position = next;
        waypointTimer += delta;
        if (waypointTimer >= 0.25) {
          waypointTimer = 0;
          const waypoint = schoolWaypoint(position, cameraForward);
          const label = waypoint.distance === null ? ''
            : waypoint.direction === 'at entrance' ? 'School entrance reached'
              : 'School entrance · ' + Math.ceil(waypoint.distance) + ' units · ' + waypoint.direction;
          setWayfinding(previous => previous === label ? previous : label);
          const carInReach = closestInteraction(position, carTargets()) !== null;
          setNearCar(previous => previous === carInReach ? previous : carInReach);
        }
        avatar.position.x = position.x;
        avatar.position.z = position.z;
        if (riggedRef.current) {
          // The neutral preview follows gameplay: sprinting briefly produces
          // exertion, while an explicitly selected emotion remains in control.
          riggedRef.current.setEmotion(resolveCharacterEmotion(previewEmotionRef.current, movementSpeed));
          riggedRef.current.update(movementSpeed, delta);
        }
        if (moving && !riggedRef.current) {
          elapsed += delta * 13;
          avatar.position.y = Math.abs(Math.sin(elapsed)) * 0.06;
          const swing = Math.sin(elapsed) * 0.55;
          avatarParts.legs[0].rotation.x = swing;
          avatarParts.legs[1].rotation.x = -swing;
          avatarParts.arms[0].rotation.x = -swing * 0.6;
          avatarParts.arms[1].rotation.x = swing * 0.6;
        } else {
          avatar.position.y = 0;
          for (const limb of [...avatarParts.legs, ...avatarParts.arms]) limb.rotation.x = 0;
        }
        const nextNear = isNearSchool(position);
        nearSchoolRef.current = nextNear;
        if (nextNear !== previousNear) {
          previousNear = nextNear;
          setNearSchool(nextNear);
        }
        cameraControls.update(delta);
        cameraControls.follow(position, delta);
        scene.render();
      });
      engine.resize();

      return () => {
        inputRef.current.clear();
        canvas.removeEventListener('pointerdown', focus);
        canvas.removeEventListener('wheel', cancelCameraTransition);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', clear);
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        cameraControlsRef.current = null;
        lighting.dispose();
        lightingRef.current = null;
        environmentLoad.cancelled = true;
        schoolAssetCancelled = true;
        schoolAsset?.dispose();
        humanLoadCancelled = true;
        riggedRef.current?.dispose();
        riggedRef.current = null;
        engine?.dispose();
        avatarRef.current = null;
      };
    } catch {
      engine?.dispose();
      avatarRef.current = null;
      setError('Unable to load the 3D world. Your character and school activities are still available below.');
    }
  }, []);

  // Cosmetics are deliberately browser-local during the demo; progression remains on the API.
  useEffect(() => {
    writeLook(characterId, look);
    lookRef.current = look;
    riggedRef.current?.applyLook(look);
    const parts = avatarRef.current;
    if (parts) {
      parts.jacket.diffuseColor = Color3.FromHexString(colorFor('outfit', look.outfit));
      parts.face.diffuseColor = Color3.FromHexString(colorFor('skin', look.skin));
      parts.hair.diffuseColor = Color3.FromHexString(colorFor('hair', look.hair));
    }
  }, [characterId, look]);

  useEffect(() => {
    if (!nearSchool) setSchoolOpen(false);
  }, [nearSchool]);

  useEffect(() => {
    schoolOpenRef.current = schoolOpen;
    if (schoolOpen) inputRef.current.clear();
  }, [schoolOpen]);

  const touch = (key: string, down: boolean, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const source = `pointer:${event.pointerId}`;
    if (down) {
      event.currentTarget.setPointerCapture(event.pointerId);
      inputRef.current.press(source, key);
    } else {
      inputRef.current.release(source);
    }
  };
  const keyboardTouch = (key: string, down: boolean, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const source = `pad:${key}:${event.key}`;
      if (down) inputRef.current.press(source, key);
      else inputRef.current.release(source);
    }
  };
  const focusWorld = (event: { detail: number }) => {
    if (event.detail > 0) canvasRef.current?.focus({ preventScroll: true });
  };
  const directionButton = (symbol: string, key: string, label: string) =>
    <button key={key} type="button" aria-label={label} className="world-pad-key"
      onPointerDown={event => touch(key, true, event)}
      onPointerUp={event => touch(key, false, event)}
      onPointerCancel={event => touch(key, false, event)}
      onLostPointerCapture={event => inputRef.current.release(`pointer:${event.pointerId}`)}
      onKeyDown={event => keyboardTouch(key, true, event)}
      onKeyUp={event => keyboardTouch(key, false, event)}
      onBlur={() => { inputRef.current.release(`pad:${key}: `); inputRef.current.release(`pad:${key}:Enter`); }}>{symbol}</button>;

  return <div className="world-root" aria-label="Playable 3D neighborhood">
    <div className="world-viewport">
      {!error && <canvas ref={canvasRef} tabIndex={0} aria-label={`3D world for ${displayName}; click to focus, use WASD or arrow keys to move`} />}
      {error ? <p className="world-fallback" role="status">{error}</p> : <>
        <div className="world-caption"><strong>{displayName}</strong> · {demoMode ? 'Guest preview · progress not saved' : 'Neighborhood demo'}</div>
        {wayfinding && <div className="world-wayfinding" aria-label="School directions">{wayfinding}</div>}
        {driving && <div className="world-drive-hud" role="status" aria-live="polite">
          <strong>{driveSpeed}</strong>km/h · W/S gas, brake, reverse · A/D steer · E to get out when stopped
          {driveNotice && <span className="world-drive-notice">{driveNotice}</span>}
        </div>}
        {(driving || nearCar) && <button type="button" className="world-car-action"
          onClick={event => { interactRef.current(); focusWorld(event); }}>
          {driving ? 'Get out of car (E)' : 'Get in car (E)'}
        </button>}
        {nearSchool && <button type="button" className="world-enter"
          aria-expanded={schoolOpen} aria-controls="school-game-panel"
          onClick={() => setSchoolOpen(current => !current)}>
          {schoolOpen ? 'Close school' : 'Enter school'}
        </button>}
        {nearSchool && schoolOpen && <section className="world-school-panel" id="school-game-panel" aria-label="School activities in game">
          <h3>School</h3>
          {demoMode ? <p>You've reached the school! This guest preview is for exploring the 3D world only. Sign in with an invitation to access server-verified school activities and save progress.</p> : <>
            <p>{timeRemaining === null ? 'Loading your school time…' : `${timeRemaining} time units remaining today.`}</p>
            {activities.length === 0 && <p>No school activities available yet.</p>}
          </>}
          {!demoMode && <div className="world-school-activities">
            {activities.map(activity =>
              <article key={activity.id}>
                <h4>{activity.title}</h4>
                <p>{activity.description} · {activity.timeCost} time units</p>
                <div className="world-school-actions">
                  <button type="button" disabled={busy} onClick={() => onPreviewActivity(activity.id)}>Preview</button>
                  <button type="button" disabled={busy || !canExecuteActivity(activity.timeCost)}
                    onClick={() => onExecuteActivity(activity.id)}>Do activity</button>
                </div>
                {preview?.activityId === activity.id && <div className="world-school-preview" aria-live="polite">
                  <strong>Projected outcome (not saved)</strong>
                  {Object.entries(preview.after)
                    .filter(([name, value]) => preview.before[name] !== value)
                    .map(([name, value]) => <p key={name}>{name}: {preview.before[name]} → {value}</p>)}
                </div>}
              </article>)}
          </div>}
          {!demoMode && <button type="button" className="world-full-school" onClick={onSchoolEnter}>Open full school dashboard</button>}
        </section>}
      </>}
    </div>
    {!error && <div className="world-controls">
      <p>Click the world, then use WASD, arrow keys or the direction pad to move. Hold Shift or switch Run on to move faster. Release the direction to stop. Drag to orbit; scroll, pinch or use the zoom buttons to zoom. Press E at the school entrance; Escape closes the panel. Press E next to a car to drive it: W/S for gas, brake and reverse, A/D to steer, and E again to get out once stopped.</p>
      <div className="world-control-buttons">
        <div className="world-pad" aria-label="Touch movement controls">
          <div className="world-pad-top">{directionButton('▲', 'ArrowUp', 'Move forward')}</div>
          <div className="world-pad-bottom">
            {directionButton('◀', 'ArrowLeft', 'Move left')}
            {directionButton('▼', 'ArrowDown', 'Move backward')}
            {directionButton('▶', 'ArrowRight', 'Move right')}
          </div>
        </div>
        <div className="world-run"><button type="button" className="world-pad-key" aria-label="Toggle running" aria-pressed={sprintEnabled} onClick={event => {
          sprintEnabledRef.current = !sprintEnabledRef.current;
          setSprintEnabled(sprintEnabledRef.current);
          if (event.detail > 0) canvasRef.current?.focus({ preventScroll: true });
        }}>{sprintEnabled ? 'RUN: ON' : 'RUN: OFF'}</button></div>
      </div>
    </div>}
    {!error && <p role="status" style={{ fontSize: '0.8rem', opacity: 0.8 }}>{modelStatus}</p>}
    {!error && <div className="world-camera-toggle" role="group" aria-label="Camera controls">
      <button type="button" aria-label="Zoom in" onClick={event => { cameraControlsRef.current?.zoom('in'); focusWorld(event); }}>Zoom +</button>
      <button type="button" aria-label="Zoom out" onClick={event => { cameraControlsRef.current?.zoom('out'); focusWorld(event); }}>Zoom −</button>
      <button type="button" onClick={event => { cameraControlsRef.current?.reset(); focusWorld(event); }}>Reset view</button>
      <button type="button" onClick={event => { toggleCamera(); focusWorld(event); }} aria-label="Switch camera view">
        Camera: {cameraMode === 'follow' ? 'Third person' : 'Overhead'} · Switch (C)
      </button>
      <button type="button" aria-pressed={evening} onClick={event => {
        const next = !evening;
        lightingRef.current?.setEvening(next);
        setEvening(next);
        focusWorld(event);
      }}>{evening ? 'Evening lights' : 'Daylight'} · Switch lighting</button>
    </div>}
    {!error && <section aria-label="Preview character expressions" className="world-customize">
      <h3>Expression preview</h3>
      <div className="world-looks" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {(['neutral', 'happy', 'sad', 'angry', 'fear', 'embarrassed', 'exerted'] as const).map(emotion =>
          <button key={emotion} type="button" aria-pressed={previewEmotion === emotion}
            onClick={() => { previewEmotionRef.current = emotion; setPreviewEmotion(emotion); riggedRef.current?.setEmotion(emotion); }}>
            {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
          </button>)}
      </div>
      <p role="status" aria-live="polite">{previewEmotion === 'sad' ? 'Crying preview selected · tears pending detailed face integration' : previewEmotion === 'embarrassed' ? 'Blushing preview selected · cheek shading pending' : previewEmotion === 'exerted' ? 'Exertion preview selected · sweat rendering pending' : `Current expression: ${previewEmotion}`}. When Neutral is selected, sprinting automatically triggers exertion. Facial animation requires a model with compatible blendshapes.</p>
    </section>}
    {!error && <section className="world-customize" aria-label="Customize character appearance">
      <h3>Character appearance</h3>
      <div className="world-looks">
        {(['skin', 'hair', 'outfit'] as const).map(part =>
          <fieldset key={part}>
            <legend>{part === 'skin' ? 'Skin tone' : part === 'hair' ? 'Hair color' : 'Outfit'}</legend>
            <div className="world-swatch-list">
              {LOOKS[part].map(choice =>
                <button key={choice.id} type="button" className="world-swatch"
                  aria-label={`${choice.label} ${part}`}
                  aria-pressed={look[part] === choice.id}
                  title={choice.label}
                  style={{ '--swatch': choice.hex } as CSSProperties}
                  onClick={() => setLook(current => ({ ...current, [part]: choice.id }))}>
                  <span className="world-swatch-dot" aria-hidden="true" /><span>{choice.label}</span>
                </button>)}
            </div>
          </fieldset>)}
      </div>
      <p>Outfit and appearance choices are saved in this browser only. {demoMode ? 'Guest appearance is not linked to an account.' : 'Server-synced customization is coming later.'}</p>
    </section>}
  </div>;
}
