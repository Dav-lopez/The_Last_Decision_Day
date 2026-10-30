import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type CSSProperties } from 'react';
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, Engine, HemisphericLight,
  MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { createRemotePlayers } from './multiplayer/remotePlayers';
import type { RoomClient } from './multiplayer/roomClient.mjs';
import { loadRiggedAvatar, type RiggedAvatar } from './riggedAvatar';
import type { Emotion } from './facialEmotions';
import { resolveCharacterEmotion } from './characterEmotion.mjs';
import { loadSchoolEnvironment } from './schoolEnvironment';
import { smoothHumanHeading } from './humanMotion.mjs';
import { HUMAN_HEIGHT, movementHeading } from './riggedPresentation.mjs';
import { SCHOOL_DOOR, isNearSchool, type PlanarPosition } from './movement.mjs';
import { stepLocomotion } from './locomotion.mjs';
import { createCameraControls } from './cameraControls.mjs';
import { createStreetLighting } from './streetLighting.mjs';
import { addParkedCarFallbacks } from './streetCars.mjs';
import { schoolWaypoint } from './schoolWayfinding.mjs';
import { createMovementInput } from './inputState.mjs';
import { addPlayableNeighborhoodDetails } from './neighborhoodEnvironment';
import { upgradeNeighborhoodAssets } from './realEnvironmentAssets';
import { createHousePainter, type HousePainter } from './housePaint';
import { HousePhotoPaint } from './HousePhotoPaint';
import { ScanImport } from './ScanImport';
import { readHouseStyle } from './photoPalette.mjs';
import { colorFor, modelFor, readLook, writeLook, type Look } from './appearance.mjs';
import { Wardrobe } from './Wardrobe';
import { WorldMap, type MapMarker, type MapSnapshot, type TravelTarget } from './WorldMap';
import { TrainingRange, type RangeOutcome } from './TrainingRange';
import { RANGE_DRILLS, TRAINING_MINUTES, canTrain, finishTraining } from './trainingRange.mjs';
import { AudioPanel } from './audio/AudioPanel';
import type { GameAudio } from './audio/director.mjs';
import { KICK, PITCH, facingOf, kickBall, newBall, stepBall, touchBall, type Ball } from './football.mjs';
import { buildFootballPitch } from './footballScene';
import { createMatch, formatClock as formatMatchClock, stepMatch, type MatchState } from './footballMatch.mjs';
import { loadFootballPlayers } from './footballPlayers';
import { CAREERS, SHIFT_HOURS, joinCareer, quitCareer, rankOf, readCareer, workShift, writeCareer, type CareerId, type CareerState } from './careers.mjs';
import { buildWorkplaces, createLightBar, createSiren } from './careersScene';
import { CareersPanel } from './CareersPanel';
import { bindActions, loadActionClips } from './characterActions';
import { bodyLean, headingDelta, jumpFor, jumpHeight } from './actionMixer.mjs';
import { PARKED_CARS } from './streetLayout.mjs';
import { addWorldProps } from './polyHavenProps';
import { buildHomeScene } from './homeScene';
import './story.css';
import { CAST, advanceStory, currentStep, markSceneSeen, pendingScene, readStory, writeStory,
  type StoryEvent, type StoryLine, type StoryState } from './storyChapters.mjs';
import { buildSurroundings } from './worldSurroundings';
import { createAtmosphere } from './sceneAtmosphere';
import { createCameraOcclusionGuard, createRenderPipeline, pickRenderQuality } from './renderQuality';
import { createQuality, stepQuality } from './adaptiveQuality.mjs';
import { loadNeighbors, type Neighbors, type Person } from './npcPeople';
import { NPC_DIALOGUES, nearbyNpc, beginNpcConversation, chooseNpcReply, readNpcRelations, writeNpcRelations,
  type NpcId, type NpcConversation, type NpcReply, type NpcRelations } from './npcConversations.mjs';
import { buildSchoolScene } from './schoolScene';
import { BUS_RIDE_MINUTES, MAPLE_BUS_STOP, atBusStop, cameraClearance, createCityCollider, findBusStop, readCity, stepCityLocomotion, toLocal, toWorld, type City } from './cityLayout.mjs';
import { buildBusStop, buildCityScene } from './cityScene';
import { buildCityLights } from './cityLights';
import { CLASSROOM, CLASSROOM_SPAWN, SCHOOL_ORIGIN, atClassroomExit, deskInReach, nearTeacher, stepClassroomLocomotion } from './schoolInterior.mjs';
import { attendLesson, currentEntry, isSchoolOpen, joinableLesson, schoolStatus } from './schoolSchedule.mjs';
import { advanceLife, canSleep, eat, FOOD, lifeTotalMinutes, chooseStartingLife, formatClock, isEvening, isExhausted, nearBed, normalizeLife, readLife,
  sleepUntilMorning, TIRED_ENERGY, toServerLife, writeLife, type Life, type LifeActivity, type ServerLife } from './lifeClock.mjs';

/** Account save for the player's day; absent in the guest preview, which keeps the browser copy only. */
export type LifeSync = {
  load: () => Promise<ServerLife>;
  save: (life: ServerLife) => Promise<{ status: 'saved' | 'rejected'; life: ServerLife }>;
};
import { BED_SIDE, FRONT_DOORS, HOME_SPAWN, atHomeExit, nearFridge, nearStove, wallsToFadeFor, stepHomeLocomotion, streetDoorAt, streetSpawnFor, wallsToFade } from './homeInterior.mjs';
import { TOWN_EXIT, canExitVehicle, chaseCameraAlpha, driveInput, footprintPoints, leavingTown, speedKmh, stepVehicle, vehicleExitPosition, type CarState } from './vehicleDrive.mjs';
import { closestInteraction, transitionInteraction, type InteractionState } from './worldInteractions.mjs';

type SchoolActivityView = { id: string; title: string; description: string; timeCost: number };
type SchoolPreview = { activityId: string; before: Record<string, number>; after: Record<string, number> };
type WorldProps = {
  online?: { current: RoomClient | null };
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
  lifeSync?: LifeSync;
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

/** The placeholder body is modelled ~2.45 units tall; scale it to the same adult height as the rigged human. */
const PLACEHOLDER_HEIGHT = 2.45;

function createAvatar(scene: Scene) {
  const root = new TransformNode('player', scene);
  const body = new TransformNode('placeholder body', scene);
  body.parent = root;
  body.scaling.setAll(HUMAN_HEIGHT / PLACEHOLDER_HEIGHT);
  const jacket = surface(scene, 'character jacket', '#5f83d8');
  const face = surface(scene, 'character skin', '#996b4f');
  const trousers = surface(scene, 'character trousers', '#28334a');
  const hair = surface(scene, 'character hair', '#25202a');

  const torso = MeshBuilder.CreateCapsule('character body', { height: 1.1, radius: 0.37 }, scene);
  torso.position.y = 1.15;
  torso.material = jacket;
  torso.parent = body;

  const head = MeshBuilder.CreateSphere('character head', { diameter: 0.68, segments: 12 }, scene);
  head.position.y = 2.02;
  head.material = face;
  head.parent = body;
  const cap = MeshBuilder.CreateSphere('character hair', { diameterX: 0.72, diameterY: 0.25, diameterZ: 0.7, segments: 10 }, scene);
  cap.position.y = 2.31;
  cap.material = hair;
  cap.parent = body;
  const legs = [-0.2, 0.2].map(x => {
    const leg = MeshBuilder.CreateCapsule('character leg', { height: 0.7, radius: 0.14 }, scene);
    leg.position.set(x, 0.38, 0);
    leg.material = trousers;
    leg.parent = body;
    return leg;
  });
  const arms = [-0.49, 0.49].map(x => {
    const arm = MeshBuilder.CreateCapsule('character arm', { height: 0.84, radius: 0.15 }, scene);
    arm.position.set(x, 1.23, 0);
    arm.material = jacket;
    arm.parent = body;
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
    eye.parent = body;
  }
  const nose = MeshBuilder.CreateSphere('character nose', { diameter: 0.13, segments: 8 }, scene);
  nose.position.set(0, 1.98, -0.345);
  nose.material = face;
  nose.parent = body;
  const mouth = MeshBuilder.CreateBox('character mouth', { width: 0.16, height: 0.025, depth: 0.025 }, scene);
  mouth.position.set(0, 1.87, -0.31);
  mouth.material = eyes;
  mouth.parent = body;

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
  pack.parent = body;

  return { root, jacket, face, hair, legs, arms };
}

/** The WebGL view is optional: login and school actions remain usable if 3D fails. */
export default function WorldScene({
  characterId, displayName, demoMode = false, onSchoolEnter, activities, timeRemaining, busy,
  canExecuteActivity, onPreviewActivity, onExecuteActivity, preview, lifeSync, online,
}: WorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef(createMovementInput());
  const audioRef = useRef<GameAudio | null>(null);
  const [sprintEnabled, setSprintEnabled] = useState(false);
  const sprintEnabledRef = useRef(false);
  const nearSchoolRef = useRef(false);
  const schoolOpenRef = useRef(false);
  const [error, setError] = useState('');
  const [nearSchool, setNearSchool] = useState(false);
  const [nearNpc, setNearNpc] = useState<NpcId | null>(null);
  const nearNpcRef = useRef<NpcId | null>(null);
  const npcSceneRef = useRef<Neighbors | null>(null);
  const [wayfinding, setWayfinding] = useState('');
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [look, setLook] = useState<Look>(() => readLook(characterId));
  const lookRef = useRef(look);
  const avatarRef = useRef<ReturnType<typeof createAvatar> | null>(null);
  const riggedRef = useRef<RiggedAvatar | null>(null);
  const swapBodyRef = useRef<((model: string) => void) | null>(null);
  // The map (N) reads a live snapshot; quick travel goes through the scene.
  const [mapOpen, setMapOpen] = useState(false);
  const mapReadRef = useRef<() => MapSnapshot>(() => ({ location: 'street', you: null, city: null, street: [], downtown: [], canTravel: false }));
  const travelRef = useRef<(to: TravelTarget) => void>(() => {});
  // Career training range (an overlay): open while you're at your own workplace.
  const [rangeOpen, setRangeOpen] = useState<CareerId | null>(null);
  const rangeOpenRef = useRef<CareerId | null>(null);
  const rangeRef = useRef<{ open: () => void; finish: (score: number) => RangeOutcome; canRetry: () => boolean }>({
    open: () => {}, finish: () => null, canRetry: () => false,
  });
  const closeRange = useCallback(() => { rangeOpenRef.current = null; setRangeOpen(null); }, []);
  const kickRef = useRef<(chip: boolean) => void>(() => {});
  const [career, setCareer] = useState<CareerState>(() => readCareer(characterId));
  const careerRef = useRef(career);
  const [workPrompt, setWorkPrompt] = useState<CareerId | null>(null);
  const saveCareer = (next: CareerState) => { careerRef.current = next; writeCareer(characterId, next); setCareer(next); };
  const sirenRef = useRef<ReturnType<typeof createSiren> | null>(null);
  const [ballPrompt, setBallPrompt] = useState(false);
  // Five-a-side: the scoreboard while a match is on, and whether you can start one.
  const [scoreboard, setScoreboard] = useState<string | null>(null);
  const [matchPrompt, setMatchPrompt] = useState(false);
  const matchRef = useRef<{ start: () => void; pass: () => void; leave: () => void }>({ start: () => {}, pass: () => {}, leave: () => {} });
  const emoteRef = useRef<(emote: 'jump' | 'dance') => void>(() => {});
  const housePainterRef = useRef<HousePainter | null>(null);
  const sceneRef = useRef<Scene | null>(null);
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
  const [propCredit, setPropCredit] = useState(false);
  const [busPrompt, setBusPrompt] = useState<'downtown' | 'home' | null>(null);
  const [inCity, setInCity] = useState<string | null>(null);
  const [riding, setRiding] = useState<string | null>(null);
  const busAction = busPrompt === 'downtown' ? 'Take the bus downtown (E)' : busPrompt === 'home' ? 'Take the bus home (E)' : null;
  const interactRef = useRef<() => void>(() => {});
  const [inHome, setInHome] = useState(false);
  const [doorPrompt, setDoorPrompt] = useState<'enter' | 'locked' | 'exit' | 'bed' | 'cook' | 'snack' | 'school' | 'school-closed' | 'leave-school' | 'desk' | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [atSchool, setAtSchool] = useState(false);
  const [inClass, setInClass] = useState<string | null>(null);
  const [lifeView, setLifeView] = useState<Life>(() => readLife(characterId));
  const [sleeping, setSleeping] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const lifeSyncRef = useRef(lifeSync);
  lifeSyncRef.current = lifeSync;
  const locationRef = useRef<'street' | 'home' | 'school' | 'city'>('street');
  // Latest props for the scene's long-lived callbacks (attendance is recorded with the server activity).
  const classActionRef = useRef({ demoMode, canExecuteActivity, onExecuteActivity });
  classActionRef.current = { demoMode, canExecuteActivity, onExecuteActivity };
  // Story: progress, the open dialogue scene and a brief "chapter complete" banner.
  const [story, setStory] = useState<StoryState>(() => readStory(characterId));
  const storyRef = useRef(story);
  const [dialogue, setDialogue] = useState<{ lines: ReadonlyArray<StoryLine>; index: number } | null>(null);
  const dialogueRef = useRef(false);
  const [storyBanner, setStoryBanner] = useState('');
  const saveStory = (next: StoryState) => { storyRef.current = next; writeStory(characterId, next); setStory(next); };
  const openPendingScene = () => {
    const scene = pendingScene(storyRef.current);
    if (!scene || dialogueRef.current) return;
    saveStory(markSceneSeen(storyRef.current));
    dialogueRef.current = true;
    inputRef.current.clear();
    setDialogue({ lines: scene, index: 0 });
  };
  const advanceDialogue = () => {
    setDialogue(current => {
      if (!current) return current;
      if (current.index + 1 < current.lines.length) return { ...current, index: current.index + 1 };
      dialogueRef.current = false;
      return null;
    });
  };
  const reportStory = (event: StoryEvent) => {
    const result = advanceStory(storyRef.current, event);
    if (!result.completed) return;
    saveStory(result.state);
    if (result.chapterDone) setStoryBanner(`${result.chapterDone.title} — complete`);
    openPendingScene();
  };
  const storyActionsRef = useRef({ reportStory, openPendingScene, advanceDialogue });
  storyActionsRef.current = { reportStory, openPendingScene, advanceDialogue };
  // Choice-based, playable NPC interactions; persisted per character.
  type NpcChat = { conversation: NpcConversation; outcome: NpcReply | null };
  const [npcRelations, setNpcRelations] = useState<NpcRelations>(() => readNpcRelations(characterId));
  const npcRelationsRef = useRef(npcRelations);
  const [npcChat, setNpcChat] = useState<NpcChat | null>(null);
  const npcChatRef = useRef<NpcChat | null>(null);
  const npcActiveRef = useRef(false);
  const openNpcChat = (id: NpcId) => {
    if (dialogueRef.current || npcActiveRef.current) return;
    const conversation = beginNpcConversation(id, npcRelationsRef.current);
    if (!conversation) return;
    setSchoolOpen(false);
    schoolOpenRef.current = false;
    inputRef.current.clear();
    npcActiveRef.current = true;
    const chat: NpcChat = { conversation, outcome: null };
    npcChatRef.current = chat;
    setNpcChat(chat);
    npcSceneRef.current?.setConversation(conversation.resident, 'neutral');
    // Match the player's visible Talk action to the NPC dialogue overlay.
    // The rigged avatar supplies timed jaw/lip morphs while the action plays.
    riggedRef.current?.playAction('Talk');
  };
  const chooseNpc = (choiceId: string) => {
    const current = npcChatRef.current;
    if (!current || current.outcome) return;
    const outcome = chooseNpcReply(npcRelationsRef.current, current.conversation.id, choiceId);
    if (!outcome) return;
    npcRelationsRef.current = outcome.state;
    setNpcRelations(outcome.state);
    writeNpcRelations(characterId, outcome.state);
    const chat: NpcChat = { ...current, outcome };
    npcChatRef.current = chat;
    npcSceneRef.current?.setConversation(current.conversation.resident, outcome.mood);
    setNpcChat(chat);
  };
  const closeNpcChat = () => {
    const current = npcChatRef.current;
    if (!current) return;
    npcActiveRef.current = false;
    npcChatRef.current = null;
    npcSceneRef.current?.setConversation(null);
    if (riggedRef.current?.action === 'Talk') riggedRef.current.stopAction();
    setNpcChat(null);
    if (current.outcome) storyActionsRef.current.reportStory(current.outcome.event);
  };
  const npcActionsRef = useRef({ open: openNpcChat, choose: chooseNpc, close: closeNpcChat });
  npcActionsRef.current = { open: openNpcChat, choose: chooseNpc, close: closeNpcChat };
  const toggleCamera = () => {
    // Indoors the camera stays in its cutaway view; the street mode returns on leaving.
    if (locationRef.current === 'home' || locationRef.current === 'school') return;
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
      // Nothing in the world is clicked: skip ray-picking on every pointer move.
      scene.skipPointerMovePicking = true;
      sceneRef.current = scene;
      scene.clearColor = new Color4(0.67, 0.83, 0.96, 1);
      const sun = new HemisphericLight('daylight', new Vector3(0, 1, 0), scene);
      sun.intensity = 0.65;
      // A lower, warmer sun gives longer shadows and more shape to buildings and faces.
      const directional = new DirectionalLight('sun', new Vector3(-0.5, -0.78, -0.42), scene);
      directional.intensity = 1.35;
      directional.position.set(12, 22, 10);
      const schoolMarker = createNeighborhood(scene);
      // The bus stop at the north end of Maple Street; the bus runs to a real downtown (OpenStreetMap).
      const disposeMapleStop = buildBusStop(scene, MAPLE_BUS_STOP.x - 1.05, MAPLE_BUS_STOP.z, Math.PI / 2);
      let cityLights: ReturnType<typeof buildCityLights> | null = null;
      // Downtown views run hundreds of metres down real streets: thinner haze there than on Maple Street.
      const applyFog = () => { scene.fogDensity = locationRef.current === 'city' ? 0.0032 : 0.009; };
      let eveningNow = false;
      let workDoors = new Map<CareerId, PlanarPosition>();
      const workplaceAt = (at: PlanarPosition) => [...workDoors].find(([, door]) => Math.hypot(door.x - at.x, door.z - at.z) <= 2)?.[0] ?? null;
      // A shift: a short fade, then the clock jumps SHIFT_HOURS and you're paid.
      let pendingShift: { result: Extract<ReturnType<typeof workShift>, { ok: true }>; timer: number } | null = null;
      const startShift = (id: CareerId) => {
        const current = careerRef.current;
        if (current.career !== id) {
          const next = joinCareer(current, id);
          saveCareer(next);
          const job = CAREERS[id];
          notify(`Welcome aboard: you're a ${rankOf(next)!.title} (${job.title}). Shifts here, E at this sign. Your uniform is in the Career panel.`);
          return;
        }
        const result = workShift(current, { minute: life.minute, totalMinutes: lifeTotalMinutes(life), energy: life.energy });
        if (!result.ok) { notify(result.reason); return; }
        pendingShift = { result, timer: 0 };
        inputRef.current.clear();
        avatar.setEnabled(false);
        setLook(look => ({ ...look, ...CAREERS[id].uniform }));
        setBusyLabel(`On duty: ${result.duty}…`);
      };
      let football: { pitch: ReturnType<typeof buildFootballPitch>; ball: Ball; goals: number; resetIn: number } | null = null;
      let downtown: { city: City; collider: ReturnType<typeof createCityCollider>; stop: PlanarPosition & { rotation: number; street: string; dx: number; dz: number; awayX: number; awayZ: number }; dispose: () => void } | null = null;
      const loadDowntown = async () => {
        const index = await fetch('/city/index.json').then(response => response.ok ? response.json() : null);
        const entry = Array.isArray(index?.cities) ? index.cities[0] : null;
        if (!entry?.file) return;
        const city = readCity(await fetch('/city/' + entry.file).then(response => response.ok ? response.json() : null));
        if (!city || disposed) return;
        const collider = createCityCollider(city);
        const local = findBusStop(city, collider);
        if (!local) return;
        const world = toWorld([local.x, local.z]);
        const disposeCity = buildCityScene(scene, city);
        // Street lamps on every downtown street (clustered lights at night).
        const lights = buildCityLights(scene, city, collider);
        lights.setEvening(eveningNow);
        cityLights = lights;
        // A caged five-a-side pitch in Central Park.
        const pitch = buildFootballPitch(scene);
        football = { pitch, ball: newBall(), goals: 0, resetIn: 0 };
        // Police station, army recruiting office and fire station, at real downtown buildings.
        const workplaces = buildWorkplaces(scene, city, collider);
        workDoors = workplaces.doors;
        // A link with ?play=football takes the bus straight to the pitch.
        if (playFootball) window.setTimeout(() => { if (!disposed && locationRef.current === 'street') boardBus('downtown'); }, 600);
        pitch.show(football.ball);
        const disposeStop = buildBusStop(scene, world.x + local.awayX * 0.9, world.z + local.awayZ * 0.9, local.heading);
        downtown = { city, collider, stop: { ...world, rotation: movementHeading(local.dx, local.dz), dx: local.dx, dz: local.dz, awayX: local.awayX, awayZ: local.awayZ, street: local.street }, dispose: () => { disposeCity(); disposeStop(); lights.dispose(); pitch.dispose(); workplaces.dispose(); } };
      };
      loadDowntown().catch(() => { /* Downtown is optional; Maple Street plays without it. */ });
      // The town around the street, so the world reaches the horizon instead of ending at a cliff edge.
      buildSurroundings(scene);
      // The barrier at the north end lifts for a car: the road out of town leads downtown.
      const gateMeshes = scene.meshes.filter(mesh => mesh.name === 'town barricade stripe' || mesh.name === 'town road closed sign');
      let gateOpen = false;
      const setGate = (open: boolean) => {
        if (open === gateOpen) return;
        gateOpen = open;
        for (const mesh of gateMeshes) mesh.setEnabled(!open);
      };
      const home = buildHomeScene(scene);
      const school = buildSchoolScene(scene);
      let schoolAsset: Awaited<ReturnType<typeof loadSchoolEnvironment>> = null;
      let schoolAssetCancelled = false;
      addPlayableNeighborhoodDetails(scene);
      // Your house wears the colours from your photo (re-applied when the detailed house model arrives).
      const housePainter = createHousePainter(scene);
      housePainterRef.current = housePainter;
      housePainter.paint(readHouseStyle(characterId));
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
      // Car body: pitches under acceleration and braking and rolls out of turns.
      const carBody = { pitch: 0, roll: 0 };
      const tiltCar = (index: number, pitch: number, roll: number, seconds: number) => {
        const ease = 1 - Math.exp(-seconds * 6);
        carBody.pitch += (pitch - carBody.pitch) * ease;
        carBody.roll += (roll - carBody.roll) * ease;
        for (const node of carRoots[index] ?? []) { node.rotation.x = carBody.pitch; node.rotation.z = carBody.roll; }
      };
      // The driver stays visible behind the wheel (left seat), playing the Drive clip.
      const DRIVER_SEAT = { x: -0.3, y: -0.3, z: -0.12 }; // seated pose: head below the roof line
      const seatDriver = (car: CarState) => {
        const c = Math.cos(car.rotation); const sn = Math.sin(car.rotation);
        avatar.position.set(car.x + DRIVER_SEAT.x * c + DRIVER_SEAT.z * sn, DRIVER_SEAT.y, car.z - DRIVER_SEAT.x * sn + DRIVER_SEAT.z * c);
        avatar.rotation.y = car.rotation;
      };
      const lightBar = createLightBar(scene);
      const siren = createSiren();
      sirenRef.current = siren;
      const streetLighting = createStreetLighting(scene, directional, sun);
      // Painted sky with clouds and a sun glow; fog fades the town into the horizon colour.
      const atmosphere = createAtmosphere(scene, directional.direction);
      const lighting = {
        ...streetLighting,
        setEvening(evening: boolean) {
          eveningNow = evening;
          streetLighting.setEvening(evening);
          atmosphere.setEvening(evening);
          cityLights?.setEvening(evening);
          applyFog();
        },
      };
      lighting.setEvening(false);
      lightingRef.current = lighting;
      const environmentLoad = { cancelled: false };
      const shadows = new ShadowGenerator(1024, directional);
      shadows.useBlurExponentialShadowMap = true;
      shadows.blurKernel = 12;
      shadows.bias = 0.0005;
      shadows.normalBias = 0.02;
      shadows.setDarkness(0.3);
      // Neighbours walking the sidewalks; the street stays empty if the shared human model fails.
      let neighbors: Neighbors | null = null;
      let peopleOut: Person[] = [];
      void loadNeighbors(scene, shadows).then(loaded => {
        if (environmentLoad.cancelled || scene.isDisposed) loaded?.dispose();
        else { neighbors = loaded; npcSceneRef.current = loaded; }
      }).catch(error => console.warn('Neighbours unavailable', error));
      void addWorldProps(scene, environmentLoad, shadows)
        .then(manifest => { if (manifest && !environmentLoad.cancelled) setPropCredit(true); })
        .catch(error => console.warn('Street props unavailable', error));
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
      // The body type is its own model: changing it swaps the character in place.
      let loadedModel = '';
      let loadToken = 0;
      const loadHuman = (model: string) => {
        if (model === loadedModel) return;
        loadedModel = model;
        const token = ++loadToken;
        void loadRiggedAvatar(scene, avatar, model).then(human => {
          if (humanLoadCancelled || scene.isDisposed || token !== loadToken) { human?.dispose(); return; }
          if (!human) return;
          const previous = riggedRef.current;
          if (previous) {
            for (const mesh of previous.root.getChildMeshes()) shadows.removeShadowCaster(mesh, false);
            previous.dispose();
          }
          riggedRef.current = human;
          human.applyLook(lookRef.current);
          // Talk, sit, drive, interact, jump, dance… arrive a moment later (a separate download).
          void loadActionClips(scene, model).then(clips => {
            if (clips && riggedRef.current === human) human.setActions(bindActions(clips, human.bones, 'player'));
          });
          human.setEmotion(resolveCharacterEmotion(previewEmotionRef.current, 0));
          avatar.position.y = 0;
          for (const mesh of placeholderMeshes) {
            mesh.setEnabled(false);
            shadows.removeShadowCaster(mesh, false);
          }
          for (const mesh of human.root.getChildMeshes()) shadows.addShadowCaster(mesh, false);
          setModelStatus('Character ready · Idle, walk and run');
        }).catch(() => {
          if (humanLoadCancelled || token !== loadToken) return;
          loadedModel = '';
          if (!riggedRef.current) setModelStatus('Basic character in use. Reload to retry loading the human character.');
        });
      };
      loadHuman(modelFor(lookRef.current));
      swapBodyRef.current = loadHuman;
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
      // Filmic tone mapping, bloom, anti-aliasing and (on capable devices) ambient occlusion.
      const renderPipeline = createRenderPipeline(scene, camera, pickRenderQuality(scene));
      // Dynamic resolution keeps the frame rate up on slower devices.
      let quality = createQuality(1 / Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)));
      // Never let walls, roofs or trees come between the camera and the player (or their car).
      const occlusion = createCameraOcclusionGuard(camera, scene, mesh =>
        mesh.isDescendantOf(avatar) || carRoots.some(roots => roots.some(root => mesh.isDescendantOf(root))));

      let interaction: InteractionState = { mode: 'walking', targetId: null };
      let clock = 0;
      const remotePlayers = createRemotePlayers(scene, shadows);
      let onlineElapsed = 0;
      let previousOnlinePosition = { ...position };
      // Day clock and energy: browser-saved per character until the daily-loop save lands on the server.
      let life = readLife(characterId);
      let lifeHudTimer = 0;
      let lifeSaveTimer = 0;
      let lastEvening: boolean | null = null;
      let warnedExhausted = false;
      let sleepTimer = 0;
      let accountSaveTimer = 0;
      let saveInFlight = false;
      let lifeLoaded = !lifeSyncRef.current;
      let disposed = false;
      // The account copy wins when the server says this save isn't possible (another device is ahead, or
      // the browser copy drifted); adopting it keeps every device on the same day.
      const adoptAccountLife = (server: ServerLife) => {
        life = normalizeLife(server);
        writeLife(characterId, life);
        syncLighting();
        setLifeView({ ...life });
      };
      const saveToAccount = () => {
        const sync = lifeSyncRef.current;
        if (!sync || !lifeLoaded || saveInFlight || disposed) return;
        saveInFlight = true;
        setSyncStatus('saving');
        // The account stores home or street; the classroom saves as street (you leave school by its door).
        sync.save(toServerLife(life, locationRef.current === 'home' ? 'home' : 'street')).then(result => {
          if (disposed) return;
          if (result.status === 'rejected') {
            adoptAccountLife(result.life);
            notify('Your day was synced from your account.');
          }
          setSyncStatus('saved');
        }).catch(() => { if (!disposed) setSyncStatus('offline'); })
          .finally(() => { saveInFlight = false; });
      };
      const syncLighting = () => {
        const nowEvening = isEvening(life.minute);
        // Follow the clock only when day turns to evening (or back), so the manual switch still works in between.
        if (nowEvening !== lastEvening) {
          lastEvening = nowEvening;
          lighting.setEvening(nowEvening);
          setEvening(nowEvening);
        }
      };
      syncLighting();
      const tickLife = (seconds: number, activity: LifeActivity) => {
        // Time stands still while reading a panel or a story scene.
        if (schoolOpenRef.current || dialogueRef.current || npcActiveRef.current) return;
        life = advanceLife(life, seconds, activity);
        syncLighting();
        lifeHudTimer += seconds;
        lifeSaveTimer += seconds;
        if (lifeHudTimer >= 0.25) {
          lifeHudTimer = 0;
          const shown = { ...life };
          setLifeView(previous => Math.floor(previous.minute) === Math.floor(shown.minute) &&
            Math.round(previous.energy) === Math.round(shown.energy) && previous.day === shown.day ? previous : shown);
        }
        if (lifeSaveTimer >= 5) { lifeSaveTimer = 0; writeLife(characterId, life); }
        accountSaveTimer += seconds;
        if (accountSaveTimer >= 20) { accountSaveTimer = 0; saveToAccount(); }
        if (isExhausted(life) && !warnedExhausted) {
          warnedExhausted = true;
          notify("You're exhausted and can't run. Go home and sleep.");
        }
      };
      let noticeAt = -Infinity;
      const notify = (message: string) => { noticeAt = clock; setDriveNotice(message); audioRef.current?.cue('notice'); };
      const carTargets = () => cars.map((car, index) => ({ id: `car-${index}`, type: 'vehicle' as const, x: car.x, z: car.z }));
      const drivenIndex = () => interaction.mode === 'driving' && interaction.targetId ? Number(interaction.targetId.slice(4)) : -1;
      const snapCamera = (to: PlanarPosition, alpha: number) => {
        camera.alpha = alpha;
        camera.inertialAlphaOffset = 0;
        camera.setTarget(new Vector3(to.x, 1.25, to.z), false, false, true);
      };
      const placePlayer = (to: PlanarPosition & { rotation: number }) => {
        position = { x: to.x, z: to.z };
        avatar.position.set(to.x, 0, to.z);
        avatar.rotation.y = to.rotation;
        inputRef.current.clear();
      };
      // The bus: a short fade, BUS_RIDE_MINUTES of game time, then you step off at the other stop.
      let rideTimer = 0;
      let pendingRide: 'downtown' | 'home' | null = null;
      // Driving between Maple Street and downtown: a short fade on the road.
      let pendingDrive: { to: 'downtown' | 'home'; index: number; timer: number } | null = null;
      const startDrive = (to: 'downtown' | 'home', index: number) => {
        if (!downtown) { notify('The road downtown is still loading. Try again in a moment.'); return; }
        pendingDrive = { to, index, timer: 0 };
        setRiding(to === 'downtown' ? `Driving to ${downtown.city.name}…` : 'Driving home to Maple Street…');
      };
      const trainingCheck = () => {
        const job = careerRef.current.career ? CAREERS[careerRef.current.career] : null;
        return canTrain(careerRef.current, { minute: life.minute, energy: life.energy, hours: job?.hours });
      };
      rangeRef.current = {
        open: () => {
          const id = careerRef.current.career;
          if (!id || interaction.mode !== 'walking' || workplaceAt(position) !== id) { notify('Training ranges are at your own workplace downtown.'); return; }
          const check = trainingCheck();
          if (!check.ok) { notify(check.reason); return; }
          inputRef.current.clear();
          rangeOpenRef.current = id;
          setRangeOpen(id);
          setLook(look => ({ ...look, ...CAREERS[id].uniform }));
        },
        // An hour of hard practice: the clock moves on and it's tiring.
        finish: (score) => {
          const result = finishTraining(careerRef.current, { score, totalMinutes: lifeTotalMinutes(life) });
          if (!result) return null;
          for (let minute = 0; minute < TRAINING_MINUTES; minute++) life = advanceLife(life, 1, 'run');
          writeLife(characterId, life);
          syncLighting();
          setLifeView({ ...life });
          saveCareer(result.state);
          saveToAccount();
          return { grade: result.grade, pay: result.pay, practice: result.practice, personalBest: result.personalBest };
        },
        canRetry: () => trainingCheck().ok,
      };
      // Quick travel from the map: a taxi, ten game minutes, on foot only.
      let pendingTaxi: { to: TravelTarget; timer: number } | null = null;
      travelRef.current = (to) => {
        if (pendingTaxi || pendingDrive || pendingRide || interaction.mode !== 'walking') { notify('Quick travel works on foot.'); return; }
        if (locationRef.current !== 'street' && locationRef.current !== 'city') { notify('Head outside first.'); return; }
        if (to !== 'maple' && !downtown) { notify('Downtown is still loading.'); return; }
        pendingTaxi = { to, timer: 0 };
        inputRef.current.clear();
        avatar.setEnabled(false);
        setRiding('Taking a taxi…');
        audioRef.current?.cue('horn');
      };
      const finishTaxi = () => {
        const { to } = pendingTaxi!;
        pendingTaxi = null;
        for (let minute = 0; minute < 10; minute++) life = advanceLife(life, 1, 'idle');
        writeLife(characterId, life);
        syncLighting();
        setLifeView({ ...life });
        avatar.setEnabled(true);
        setRiding(null);
        if (to === 'maple' || !downtown) {
          locationRef.current = 'street';
          matchRef.current.leave();
          placePlayer(streetSpawnFor(FRONT_DOORS.find(door => door.own)!));
          snapCamera(position, -Math.PI / 2);
          setInCity(null);
        } else {
          locationRef.current = 'city';
          const work = careerRef.current.career ? workDoors.get(careerRef.current.career) : undefined;
          const spot = to === 'pitch' ? { x: PITCH.x - 6, z: PITCH.z - 2, rotation: Math.PI / 2 }
            : to === 'work' && work ? { ...work, rotation: 0 } : downtown.stop;
          placePlayer(spot);
          snapCamera(position, Math.PI);
          cityCameraRadius = null;
          setInCity(downtown.city.name);
        }
        applyFog();
        saveToAccount();
      };
      mapReadRef.current = () => {
        const inCityNow = locationRef.current === 'city';
        const local = inCityNow ? toLocal(position) : [position.x, position.z];
        const street: MapMarker[] = [
          { id: 'home', label: 'Home', x: -8.4, z: -5.05, kind: 'home' },
          { id: 'school', label: 'School', x: SCHOOL_DOOR.x, z: SCHOOL_DOOR.z, kind: 'school' },
          { id: 'bus', label: 'Bus stop', x: MAPLE_BUS_STOP.x, z: MAPLE_BUS_STOP.z, kind: 'bus' },
          { id: 'gate', label: 'Road to downtown', x: 0, z: 11.2, kind: 'gate' },
        ];
        const downtownPins: MapMarker[] = [];
        if (downtown) {
          const [bx, bz] = toLocal(downtown.stop);
          downtownPins.push({ id: 'bus', label: 'Bus stop', x: bx, z: bz, kind: 'bus' });
          const [px, pz] = toLocal(PITCH);
          downtownPins.push({ id: 'pitch', label: 'Football pitch', x: px, z: pz, kind: 'pitch' });
          for (const [id, door] of workDoors) {
            const [wx, wz] = toLocal(door);
            const yours = careerRef.current.career === id;
            downtownPins.push({ id: yours ? 'your-work' : `work-${id}`, label: CAREERS[id].workplace, x: wx, z: wz, kind: 'work' });
          }
        }
        return {
          location: locationRef.current,
          you: { x: local[0], z: local[1], heading: avatar.rotation.y },
          city: downtown?.city ?? null,
          street, downtown: downtownPins,
          canTravel: interaction.mode === 'walking' && (locationRef.current === 'street' || locationRef.current === 'city'),
        };
      };
      const finishDrive = () => {
        const drive = pendingDrive!;
        pendingDrive = null;
        for (let minute = 0; minute < 10; minute++) life = advanceLife(life, 1, 'drive');
        writeLife(characterId, life);
        syncLighting();
        setLifeView({ ...life });
        setRiding(null);
        if (drive.to === 'downtown' && downtown) {
          const stop = downtown.stop;
          // In the near lane of the stop's street, heading along it.
          const lane = toWorld(toLocal({ x: stop.x - stop.awayX * 2.6, z: stop.z - stop.awayZ * 2.6 }));
          cars[drive.index] = { x: lane.x, z: lane.z, rotation: Math.atan2(stop.dx, stop.dz), speed: 3 };
          locationRef.current = 'city';
          setInCity(downtown.city.name);
          notify(`${downtown.city.name}. Drive around; head for the edge of downtown to drive home.`);
        } else {
          cars[drive.index] = { x: 0, z: TOWN_EXIT.beyond - 2.5, rotation: Math.PI, speed: 3 };
          locationRef.current = 'street';
          matchRef.current.leave();
          setInCity(null);
          notify('Back on Maple Street.');
        }
        applyFog();
        placeCar(drive.index);
        seatDriver(cars[drive.index]);
        camera.alpha = chaseCameraAlpha(cars[drive.index].rotation);
        camera.setTarget(new Vector3(cars[drive.index].x, 1.25, cars[drive.index].z), false, false, true);
        saveToAccount();
      };
      // Downtown streets are narrow: the camera moves in rather than ending up inside a building.
      let cityCameraRadius: number | null = null;
      let cityClampedRadius = -1;
      const boardBus = (to: 'downtown' | 'home') => {
        if (!downtown) { notify('The bus is running late. Try again in a moment.'); return; }
        audioRef.current?.cue('bus');
        pendingRide = to;
        rideTimer = 0;
        inputRef.current.clear();
        avatar.setEnabled(false);
        setBusPrompt(null);
        setRiding(to === 'downtown' ? `Riding the bus to ${downtown.city.name}…` : 'Riding the bus home to Maple Street…');
      };
      const playFootball = new URLSearchParams(window.location.search).get('play') === 'football';
      const arrive = () => {
        const to = pendingRide;
        pendingRide = null;
        for (let minute = 0; minute < BUS_RIDE_MINUTES; minute++) life = advanceLife(life, 1, 'idle');
        writeLife(characterId, life);
        syncLighting();
        setLifeView({ ...life });
        avatar.setEnabled(true);
        setRiding(null);
        if (to === 'downtown' && downtown) {
          locationRef.current = 'city';
          applyFog();
          if (playFootball) {
            placePlayer({ x: PITCH.x - 6, z: PITCH.z - 2, rotation: Math.PI / 2 });
            snapCamera(position, Math.PI);
          } else {
            placePlayer(downtown.stop);
            // Camera behind you, looking down the street.
            snapCamera(position, Math.atan2(-downtown.stop.dz, -downtown.stop.dx));
          }
          cityCameraRadius = null;
          setInCity(downtown.city.name);
          notify(`${downtown.city.name} · ${formatClock(life.minute)}. Walk around; the bus home leaves from this stop.`);
        } else {
          locationRef.current = 'street';
          applyFog();
          matchRef.current.leave();
          placePlayer({ x: MAPLE_BUS_STOP.x + 0.4, z: MAPLE_BUS_STOP.z - 0.8, rotation: Math.PI });
          snapCamera(position, -Math.PI / 2);
          setInCity(null);
          notify(`Back on Maple Street · ${formatClock(life.minute)}`);
        }
        saveToAccount();
      };
      const enterHome = () => {
        audioRef.current?.cue('door');
        locationRef.current = 'home';
        storyActionsRef.current.reportStory('entered-home');
        placePlayer(HOME_SPAWN);
        cameraControls.setMode('indoor', true);
        snapCamera(position, Math.PI / 2);
        setWayfinding('');
        setNearCar(false);
        setDriveNotice('');
        setInHome(true);
        saveToAccount();
      };
      const leaveHome = () => {
        audioRef.current?.cue('door');
        const door = FRONT_DOORS.find(candidate => candidate.own)!;
        locationRef.current = 'street';
        placePlayer(streetSpawnFor(door));
        cameraControls.setMode(cameraModeRef.current, true);
        snapCamera(position, -Math.PI / 2);
        setInHome(false);
        storyActionsRef.current.reportStory('left-home');
        saveToAccount();
      };
      const enterSchool = () => {
        audioRef.current?.cue('door');
        locationRef.current = 'school';
        storyActionsRef.current.reportStory('entered-school');
        placePlayer(CLASSROOM_SPAWN);
        cameraControls.setMode('indoor', true);
        snapCamera(position, Math.PI / 2);
        setWayfinding('');
        setNearCar(false);
        setDriveNotice('');
        setAtSchool(true);
      };
      const leaveSchool = () => {
        audioRef.current?.cue('door');
        locationRef.current = 'street';
        setSchoolOpen(false);
        placePlayer({ x: SCHOOL_DOOR.x, z: SCHOOL_DOOR.z + 0.9, rotation: Math.PI });
        cameraControls.setMode(cameraModeRef.current, true);
        snapCamera(position, -Math.PI / 2);
        setAtSchool(false);
        saveToAccount();
      };
      let classTimer = 0;
      // Kitchen: last meal/snack times (life-total minutes) and the short fade while eating.
      const lastAte: { meal: number | null; snack: number | null } = { meal: null, snack: null };
      let pendingFood: { kind: 'meal' | 'snack'; result: ReturnType<typeof eat> } | null = null;
      let foodTimer = 0;
      const startEating = (kind: 'meal' | 'snack') => {
        const result = eat(life, kind, lastAte[kind]);
        if (!result.ok) { notify(result.reason); return; }
        pendingFood = { kind, result };
        foodTimer = 0;
        inputRef.current.clear();
        setDoorPrompt(null);
        setBusyLabel(kind === 'meal' ? 'Cooking and eating…' : 'Grabbing a snack…');
        riggedRef.current?.playAction(kind === 'meal' ? 'PickUp' : 'Interact');
      };
      let pendingLesson: ReturnType<typeof attendLesson> = null;
      // Continue the account's saved day (and wake up at home if that's where it ended).
      if (lifeSyncRef.current) {
        lifeSyncRef.current.load().then(server => {
          if (disposed) return;
          const start = chooseStartingLife(life, server);
          life = start.life;
          lifeLoaded = true;
          writeLife(characterId, life);
          syncLighting();
          setLifeView({ ...life });
          if (start.location === 'home' && locationRef.current === 'street' && interaction.mode === 'walking') enterHome();
          else if (start.source === 'browser') saveToAccount();
          setSyncStatus('saved');
        }).catch(() => {
          // Keep playing on the browser copy; saves resume once the account answers.
          lifeLoaded = true;
          if (!disposed) setSyncStatus('offline');
        });
      }
      // E (or the on-screen button): car in/out, the home's doors, then the nearest car.
      const interact = () => {
        if (dialogueRef.current) { storyActionsRef.current.advanceDialogue(); return; }
        if (npcActiveRef.current) return;
        // Nothing to do mid-lesson or asleep; the fade finishes on its own.
        if (schoolOpenRef.current || pendingFood || interaction.mode === 'sitting' || interaction.mode === 'sleeping') return;
        const index = drivenIndex();
        if (index < 0 && locationRef.current === 'home') {
          if (atHomeExit(position)) leaveHome();
          else if (nearStove(position)) startEating('meal');
          else if (nearFridge(position)) startEating('snack');
          else if (nearBed(position, BED_SIDE)) {
            const check = canSleep(life);
            if (!check.ok) { notify(check.reason); return; }
            interaction = transitionInteraction(interaction, { id: 'home-bed', type: 'bed', x: BED_SIDE.x, z: BED_SIDE.z });
            inputRef.current.clear();
            avatar.setEnabled(false);
            sleepTimer = 0;
            setDoorPrompt(null);
            setSleeping(true);
          }
          return;
        }
        if (index < 0 && locationRef.current === 'school') {
          if (atClassroomExit(position)) { leaveSchool(); return; }
          const desk = deskInReach(position);
          if (!desk) return;
          const lesson = attendLesson(life);
          if (!lesson) { notify(schoolStatus(life.minute)); return; }
          // Sit down for the lesson: a short fade, then the clock jumps to the end of class.
          interaction = transitionInteraction(interaction, { id: desk.id, type: 'seat', x: desk.chair.x, z: desk.chair.z });
          inputRef.current.clear();
          avatar.setEnabled(false);
          pendingLesson = lesson;
          classTimer = 0;
          setDoorPrompt(null);
          setInClass(lesson.lesson.title);
          return;
        }
        if (index < 0 && locationRef.current === 'street' && nearNpcRef.current) {
          npcActionsRef.current.open(nearNpcRef.current);
          return;
        }
        if (index < 0 && locationRef.current === 'city') {
          if (downtown && atBusStop(position, downtown.stop)) boardBus('home');
          else if (workplaceAt(position)) startShift(workplaceAt(position)!);
          else kick(false);
          return;
        }
        if (index < 0 && atBusStop(position, MAPLE_BUS_STOP)) { boardBus('downtown'); return; }
        if (index < 0 && isNearSchool(position)) {
          if (isSchoolOpen(life.minute)) enterSchool();
          else notify(schoolStatus(life.minute));
          return;
        }
        const door = index < 0 ? streetDoorAt(position) : null;
        if (door) {
          if (door.own) enterHome();
          else { riggedRef.current?.playAction('Interact'); notify("The neighbors' door is locked."); }
          return;
        }
        if (index < 0) {
          const target = closestInteraction(position, carTargets());
          if (!target) return;
          interaction = transitionInteraction(interaction, target);
          audioRef.current?.cue('car');
          inputRef.current.clear();
          // With the action clips loaded, you sit visibly behind the wheel; otherwise the car hides you.
          if (!riggedRef.current?.playAction('Drive')) avatar.setEnabled(false);
          jumpTimer = 0;
          setNearCar(false);
          setDriveNotice('');
          setDriveSpeed(0);
          setDriving(true);
          return;
        }
        const car = cars[index];
        if (!canExitVehicle(car)) { notify('Stop the car before getting out.'); return; }
        const exit = locationRef.current === 'city' && downtown
          ? vehicleExitPosition(car, cars, point => !downtown!.collider.blockedLocal(...toLocal(point)))
          : vehicleExitPosition(car, cars);
        if (!exit) { notify('No room to open a door here. Move the car a little.'); return; }
        car.speed = 0;
        position = exit;
        avatar.position.set(exit.x, 0, exit.z);
        avatar.rotation.y = car.rotation;
        audioRef.current?.cue('car');
        interaction = transitionInteraction(interaction, 'exit');
        inputRef.current.clear();
        riggedRef.current?.stopAction();
        tiltCar(index, 0, 0, 10);
        lightBar.update(0, false);
        siren.stop();
        avatar.setEnabled(true);
        setDriveNotice('');
        setDriving(false);
      };
      interactRef.current = interact;
      // Football: E or F kicks, Shift+F chips, the way you face.
      const kick = (chip: boolean) => {
        if (!football || locationRef.current !== 'city') return;
        if (match) { matchActions = { ...matchActions, shoot: !chip, chip }; return; }
        const kicked = kickBall(football.ball, position, facingOf(avatar.rotation.y), chip);
        if (kicked) { football.ball = kicked; audioRef.current?.cue('kick'); }
      };
      kickRef.current = kick;
      // Five-a-side match: you up front for Blue with four AI teammates against five AI Reds.
      let match: MatchState | null = null;
      let matchPlayers: Awaited<ReturnType<typeof loadFootballPlayers>> = null;
      let matchLoading = false;
      let matchActions: { shoot?: boolean; chip?: boolean; pass?: boolean } = {};
      let matchEndsIn = 0;
      let lastPhase = '';
      const youInMatch = () => match?.players.find(p => p.human) ?? null;
      const endMatch = () => {
        match = null;
        matchPlayers?.dispose();
        matchPlayers = null;
        matchEndsIn = 0;
        setScoreboard(null);
        if (football) { football.ball = newBall(); football.pitch.show(football.ball); }
      };
      matchRef.current = {
        start: () => {
          if (match || matchLoading || !football || locationRef.current !== 'city') return;
          matchLoading = true;
          notify('Picking teams…');
          const fresh = createMatch();
          void loadFootballPlayers(scene, fresh.players, shadows).then(bodies => {
            matchLoading = false;
            if (!bodies || locationRef.current !== 'city') { bodies?.dispose(); notify("Couldn't get the teams together. Try again."); return; }
            matchPlayers = bodies;
            match = fresh;
            lastPhase = '';
            notify('Five-a-side! You play up front for Blue. Run into the ball to dribble · F shoots · Shift+F chips · Q passes.');
          });
        },
        pass: () => { if (match) matchActions = { ...matchActions, pass: true }; },
        leave: () => { if (match) { notify('You walked off. Match abandoned.'); endMatch(); } },
      };
      // Jump (Space) and dance (G): on foot only.
      let jumpTimer = 0;
      let jump = jumpFor();
      let lastSpeed = 0;
      emoteRef.current = (emote) => {
        const human = riggedRef.current;
        if (!human || interaction.mode !== 'walking' || schoolOpenRef.current || dialogueRef.current || npcActiveRef.current) return;
        if (emote === 'jump') {
          if (jumpTimer > 0) return;
          jumpTimer = 1e-4;
          // Running jumps go higher and further; an exhausted one barely leaves the ground.
          jump = jumpFor({ speed: lastSpeed, energy: life.energy });
          audioRef.current?.cue('jump');
          human.playAction('JumpAir');
        } else if (human.action === 'Dance') human.stopAction();
        else human.playAction('Dance');
      };
      const normalizeKey = (key: string) => key.length === 1 ? key.toLowerCase() : key;
      const onKeyDown = (event: KeyboardEvent) => {
        // Escape must also work when a button inside the school overlay has focus.
        if (event.key === 'Escape' && schoolOpenRef.current) {
          event.preventDefault();
          setSchoolOpen(false);
          return;
        }
        if (npcActiveRef.current) {
          const chat = npcChatRef.current;
          if (event.key === 'Escape') {
            event.preventDefault(); npcActionsRef.current.close();
          } else if (!chat?.outcome && /^[1-3]$/.test(event.key) && !event.repeat) {
            event.preventDefault();
            const option = chat?.conversation.choices[Number(event.key) - 1];
            if (option) npcActionsRef.current.choose(option.id);
          } else if (chat?.outcome && ['Enter', 'e', ' '].includes(event.key) && !event.repeat) {
            event.preventDefault(); npcActionsRef.current.close();
          } else if (MOVE_KEYS.has(event.key)) event.preventDefault();
          return;
        }
        if (rangeOpenRef.current) return;
        if (document.activeElement !== canvas) return;
        const key = normalizeKey(event.key);
        if (MOVE_KEYS.has(key)) {
          event.preventDefault();
          inputRef.current.press(`keyboard:${key}`, key);
        } else if (key === 'c' && !event.repeat) {
          event.preventDefault();
          toggleCamera();
        } else if (dialogueRef.current && (key === 'e' || key === 'Enter' || key === ' ') && !event.repeat) {
          // E, Enter or Space moves the story scene on.
          event.preventDefault();
          storyActionsRef.current.advanceDialogue();
        } else if (key === 'h' && !event.repeat && interaction.mode === 'driving' && careerRef.current.career === 'police') {
          event.preventDefault();
          notify(siren.toggle() ? 'Siren on (H to switch off).' : 'Siren off.');
        } else if (key === 'n' && !event.repeat) {
          event.preventDefault();
          setMapOpen(open => !open);
          audioRef.current?.cue('map');
        } else if (key === 'q' && !event.repeat) {
          event.preventDefault();
          matchRef.current.pass();
        } else if (key === 'm' && !event.repeat) {
          event.preventDefault();
          matchRef.current.start();
        } else if (key === 'f' && !event.repeat) {
          event.preventDefault();
          kickRef.current(inputRef.current.pressed.has('Shift'));
        } else if (key === ' ' && !event.repeat) {
          event.preventDefault();
          emoteRef.current('jump');
        } else if (key === 't' && !event.repeat) {
          event.preventDefault();
          rangeRef.current.open();
        } else if (key === 'g' && !event.repeat) {
          event.preventDefault();
          emoteRef.current('dance');
        } else if (key === 'e' && !event.repeat) {
          event.preventDefault();
          // Inside the classroom the teacher opens the school activities; everywhere else E is the action button.
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
        quality = createQuality(1 / Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)));
        engine?.setHardwareScalingLevel(quality.scale);
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
      let lastAudioPosition = { ...position };
      engine.runRenderLoop(() => {
        const frameSeconds = engine!.getDeltaTime() / 1000;
        const delta = Math.min(frameSeconds, 0.05);
        const tuned = stepQuality(quality, frameSeconds);
        quality = tuned.state;
        if (tuned.changed) {
          engine!.setHardwareScalingLevel(quality.scale);
          renderPipeline.setAmbientOcclusion(quality.ambientOcclusion);
        }
        const audioDistance = Math.hypot(position.x-lastAudioPosition.x, position.z-lastAudioPosition.z);
        lastAudioPosition = { ...position };
        const audioCar = drivenIndex();
        const atPitch = locationRef.current === 'city' && (Boolean(match) || Math.hypot(position.x - PITCH.x, position.z - PITCH.z) < PITCH.halfLength + 8);
        audioRef.current?.update({ location: atPitch ? 'pitch' : locationRef.current,
          match: Boolean(match && match.phase !== 'fulltime'),
          speed: delta>0 && audioDistance<1 ? audioDistance/delta : 0,
          drivingSpeed: audioCar>=0 ? cars[audioCar].speed : null,
          reading: schoolOpenRef.current || dialogueRef.current || npcActiveRef.current || Boolean(rangeOpenRef.current),
          paused: Boolean(pendingRide || pendingFood || pendingShift || pendingTaxi || pendingDrive || interaction.mode==='sleeping' || interaction.mode==='sitting'),
          evening: isEvening(life.minute) });
        // The training range covers the screen: freeze the world (and its clock) underneath.
        if (rangeOpenRef.current) return;
        // Controls follow the orbit camera: W always walks away from the viewer.
        const cameraDirection = camera.getForwardRay().direction;
        markerTime += delta;
        clock += delta;
        const conversationalNeighbor = interaction.mode === 'walking'
          ? nearbyNpc(position, locationRef.current, life.minute, neighbors?.positions()) : null;
        if (conversationalNeighbor !== nearNpcRef.current) {
          nearNpcRef.current = conversationalNeighbor;
          setNearNpc(conversationalNeighbor);
        }
        schoolMarker.position.y = 4.6 + Math.sin(markerTime * 2.5) * 0.12;
        const cameraForward = { x: cameraDirection.x, z: cameraDirection.z };
        remotePlayers.update(online?.current?.read(), locationRef.current, delta);
        onlineElapsed += delta;
        if (onlineElapsed >= 0.2) {
          const index = drivenIndex();
          const currentPosition = index >= 0 ? cars[index] : position;
          const distance = Math.hypot(currentPosition.x - previousOnlinePosition.x, currentPosition.z - previousOnlinePosition.z);
          online?.current?.publish({ x: currentPosition.x, z: currentPosition.z,
            rotation: index >= 0 ? cars[index].rotation : avatar.rotation.y, location: locationRef.current,
            speed: Math.min(35, distance > 5 ? 0 : distance / onlineElapsed),
            mode: index >= 0 ? 'driving' : pendingRide || pendingShift || interaction.mode !== 'walking' ? 'busy' : 'walking' });
          previousOnlinePosition = { ...currentPosition }; onlineElapsed = 0;
        }
        if (pendingShift) {
          pendingShift.timer += delta;
          if (pendingShift.timer >= 2.4) {
            const { result } = pendingShift;
            pendingShift = null;
            // Four hours on your feet: the clock jumps and the day's walking drains energy.
            for (let minute = 0; minute < SHIFT_HOURS * 60; minute++) life = advanceLife(life, 1, 'walk');
            writeLife(characterId, life);
            syncLighting();
            setLifeView({ ...life });
            saveCareer(result.state);
            avatar.setEnabled(true);
            setBusyLabel(null);
            notify(result.promoted ? `Promoted to ${result.promoted}! Shift done: +$${result.pay}.` : `Shift done: ${result.duty}. +$${result.pay}.`);
            audioRef.current?.cue(result.promoted ? 'promotion' : 'shift');
            saveToAccount();
          }
          scene.render();
          return;
        }
        if (pendingTaxi) {
          pendingTaxi.timer += delta;
          if (pendingTaxi.timer >= 1.6) finishTaxi();
          scene.render();
          return;
        }
        if (pendingDrive) {
          pendingDrive.timer += delta;
          if (pendingDrive.timer >= 2) finishDrive();
          scene.render();
          return;
        }
        if (pendingRide) {
          rideTimer += delta;
          if (rideTimer >= 2.2) arrive();
          scene.render();
          return;
        }
        if (interaction.mode === 'sleeping') {
          // A short fade stands in for the night; the clock jumps to 7:00 when it ends.
          sleepTimer += delta;
          if (sleepTimer >= 2.2) {
            const rest = sleepUntilMorning(life);
            life = rest.life;
            warnedExhausted = false;
            writeLife(characterId, life);
            syncLighting();
            setLifeView({ ...life });
            saveToAccount();
            interaction = transitionInteraction(interaction, 'exit');
            avatar.setEnabled(true);
            setSleeping(false);
            audioRef.current?.cue('wake');
            storyActionsRef.current.reportStory('slept');
            notify(`Good morning! Day ${life.day} · ${formatClock(life.minute)} · slept ${Math.round(rest.hoursSlept)} h · energy ${Math.round(life.energy)}%`);
          }
          home.setFadedWalls(wallsToFade(camera.position), delta);
          scene.render();
          return;
        }
        if (pendingFood) {
          foodTimer += delta;
          if (foodTimer >= (pendingFood.kind === 'meal' ? 2 : 0.9)) {
            const { kind, result } = pendingFood;
            pendingFood = null;
            life = result.life;
            lastAte[kind] = result.ateAt ?? null;
            warnedExhausted = false;
            writeLife(characterId, life);
            syncLighting();
            setLifeView({ ...life });
            setBusyLabel(null);
            audioRef.current?.cue('food');
            notify(kind === 'meal' ? `That hit the spot. +${FOOD.meal.energy} energy` : `A quick bite. +${FOOD.snack.energy} energy`);
            saveToAccount();
          }
          home.setFadedWalls(wallsToFade(camera.position), delta);
          scene.render();
          return;
        }
        if (interaction.mode === 'sitting' && pendingLesson) {
          classTimer += delta;
          if (classTimer >= 2.4) {
            const { lesson, life: after } = pendingLesson;
            pendingLesson = null;
            life = after;
            writeLife(characterId, life);
            syncLighting();
            setLifeView({ ...life });
            interaction = transitionInteraction(interaction, 'exit');
            avatar.setEnabled(true);
            setInClass(null);
            audioRef.current?.cue('bell');
            const action = classActionRef.current;
            if (action.demoMode) notify(`${lesson.title} done! Sign in to have lessons count toward your grades.`);
            else if (!action.canExecuteActivity(1)) notify(`${lesson.title} done, but you have no school time left today, so it wasn't counted.`);
            else { action.onExecuteActivity('attend-class'); notify(`${lesson.title} done! Attendance recorded.`); }
            storyActionsRef.current.reportStory('attended-class');
            saveToAccount();
          }
          school.setFadedWalls(wallsToFadeFor(SCHOOL_ORIGIN, CLASSROOM, camera.position), delta);
          scene.render();
          return;
        }
        const driven = drivenIndex();
        // People give way to the player on foot; cars (including a driven one) block their next step.
        peopleOut = neighbors
          ? neighbors.update(delta, life.minute, driven < 0 && locationRef.current !== 'home' ? position : null, cars)
          : [];
        if (driven >= 0) {
          tickLife(delta, 'drive');
          // Car-relative controls: W/S accelerate, brake and reverse; A/D steer.
          const keys = schoolOpenRef.current || dialogueRef.current || npcActiveRef.current || rangeOpenRef.current ? new Set<string>() : inputRef.current.pressed;
          const others = cars.filter((_, index) => index !== driven);
          const before = cars[driven];
          // Downtown, the real buildings are what the car runs into.
          const cityBlock = locationRef.current === 'city' && downtown
            ? (candidate: CarState) => footprintPoints(candidate).some(point => downtown!.collider.blockedLocal(...toLocal(point)))
            : undefined;
          const next = stepVehicle(before, driveInput(keys), delta, locationRef.current === 'city' ? [] : others, locationRef.current === 'city' ? [] : peopleOut, cityBlock);
          cars[driven] = { x: next.x, z: next.z, rotation: next.rotation, speed: next.speed };
          if (locationRef.current === 'street') {
            setGate(Math.hypot(next.x, next.z - TOWN_EXIT.beyond) < TOWN_EXIT.gateRange);
            if (leavingTown(next)) startDrive('downtown', driven);
          } else if (locationRef.current === 'city' && downtown) {
            const [lx, lz] = toLocal(next);
            const [hx, hz] = downtown.city.halfSize;
            if (Math.abs(lx) > hx - 14 || Math.abs(lz) > hz - 14) startDrive('home', driven);
          }
          placeCar(driven);
          const tilt = bodyLean({ kind: 'car', speed: next.speed, yawRate: delta > 0 ? headingDelta(before.rotation, next.rotation) / delta : 0,
            acceleration: delta > 0 ? (next.speed - before.speed) / delta : 0 });
          tiltCar(driven, tilt.pitch, tilt.roll, delta);
          // Police: a light bar on the car you drive (H toggles the siren).
          const cop = careerRef.current.career === 'police';
          if (cop) {
            lightBar.bar.position.set(next.x - Math.sin(next.rotation) * 0.1, 1.48, next.z - Math.cos(next.rotation) * 0.1);
            lightBar.bar.rotation.set(tilt.pitch, next.rotation, tilt.roll);
          }
          lightBar.update(delta, cop);
          sirenRef.current?.update(delta);
          if (avatar.isEnabled()) seatDriver(cars[driven]);
          // Someone you bump flinches.
          if (next.collided && Math.abs(before.speed) > 0.6) neighbors?.react(next.x, next.z);
          // Swing the camera behind the car while moving; parked, the player may orbit freely.
          if (Math.abs(next.speed) > 1) camera.alpha = smoothHumanHeading(camera.alpha, chaseCameraAlpha(next.rotation), delta, 2.5);
          hudTimer += delta;
          if (hudTimer >= 0.15) {
            hudTimer = 0;
            const kmh = speedKmh(next.speed);
            setDriveSpeed(previous => previous === kmh ? previous : kmh);
            if (next.collided) notify(peopleOut.some(person => Math.hypot(person.x - next.x, person.z - next.z) < 2.6)
              ? 'Careful, someone is in the way! Give them a moment to step aside.'
              : 'Bump! Reverse with S to back away.');
            else if (clock - noticeAt > 2.5) setDriveNotice(previous => previous ? '' : previous);
            const waypoint = schoolWaypoint(next, cameraForward);
            const label = locationRef.current === 'city' && downtown
              ? `${downtown.city.name} · drive to the edge of downtown to go home · map: N`
              : waypoint.distance === null ? '' : 'School · ' + Math.ceil(waypoint.distance) + ' m · ' + waypoint.direction + ' · road to downtown: north';
            setWayfinding(previous => previous === label ? previous : label);
          }
          if (previousNear) { previousNear = false; nearSchoolRef.current = false; setNearSchool(false); }
          riggedRef.current?.update(0, delta);
          cameraControls.update(delta);
          cameraControls.follow(next, delta);
          occlusion.update(delta);
          scene.render();
          return;
        }
        const atHome = locationRef.current === 'home';
        const inSchool = locationRef.current === 'school';
        const city = locationRef.current === 'city' ? downtown : null;
        const tired = isExhausted(life);
        const pressed = schoolOpenRef.current || dialogueRef.current || npcActiveRef.current || rangeOpenRef.current ? new Set<string>() : inputRef.current.pressed;
        // Exhausted players can still walk home, but not run.
        const walkKeys = tired ? new Set([...pressed].filter(key => key !== 'Shift')) : pressed;
        const locomotion = atHome
          ? stepHomeLocomotion(position, walkKeys, delta, sprintEnabledRef.current && !tired, cameraForward)
          : city ? stepCityLocomotion(city.collider, position, walkKeys, delta, sprintEnabledRef.current && !tired, cameraForward)
          : inSchool ? stepClassroomLocomotion(position, walkKeys, delta, sprintEnabledRef.current && !tired, cameraForward, peopleOut)
          : stepLocomotion(position, walkKeys, delta, sprintEnabledRef.current && !tired, cameraForward, cars, peopleOut);
        tickLife(delta, locomotion.motion);
        const { position: next, moving, speed: movementSpeed } = locomotion;
        lastSpeed = movementSpeed;
        if (city && football && match) {
          const velocity = delta > 0 ? { x: (next.x - position.x) / delta, z: (next.z - position.z) / delta } : { x: 0, z: 0 };
          const heading = Math.hypot(velocity.x, velocity.z) > 0.2 ? Math.atan2(velocity.x, velocity.z) : avatar.rotation.y;
          match = stepMatch(match, delta, { x: next.x, z: next.z, vx: velocity.x, vz: velocity.z, heading }, matchActions);
          matchActions = {};
          football.ball = match.ball;
          football.pitch.show(match.ball);
          matchPlayers?.update(match.players, delta);
          for (const event of match.events) {
            if (event.type === 'shot' || event.type === 'pass') audioRef.current?.cue('kick');
            else if (event.type === 'save') audioRef.current?.cue('save');
            else if (event.type === 'goal' || event.type === 'fulltime') audioRef.current?.cue(event.type === 'goal' ? 'goal' : 'whistle');
            if (event.type === 'goal') {
              notify(event.team === 'home' ? `GOAL for Blue! ${match.score.home}–${match.score.away}` : `Red score. ${match.score.home}–${match.score.away}`);
              if (event.team === 'home') riggedRef.current?.playAction('Dance');
            } else if (event.type === 'save' && event.team === 'away') notify('Saved by the Red keeper!');
            else if (event.type === 'fulltime') {
              const { home, away } = match.score;
              notify(`Full time: Blue ${home}–${away} Red. ${home > away ? 'You win!' : home < away ? 'Red win this one.' : "It's a draw."}`);
              matchEndsIn = 5;
            }
          }
          // At each kick-off you're put back on your spot.
          if (match.phase === 'kickoff' && lastPhase !== 'kickoff') audioRef.current?.cue('whistle');
          if (match.phase === 'kickoff' && lastPhase !== 'kickoff') {
            const me = youInMatch();
            if (me) { next.x = me.x; next.z = me.z; avatar.rotation.y = me.heading; }
          }
          lastPhase = match.phase;
          if (matchEndsIn > 0 && (matchEndsIn -= delta) <= 0) endMatch();
        } else if (city && football) {
          // Run into the ball to dribble it; the ball rolls, bounces off the boards and finds the net.
          const velocity = delta > 0 ? { x: (next.x - position.x) / delta, z: (next.z - position.z) / delta } : { x: 0, z: 0 };
          football.ball = touchBall(football.ball, next, velocity);
          const result = stepBall(football.ball, delta);
          football.ball = result.ball;
          if (result.goal && football.resetIn <= 0) {
            football.goals += 1;
            football.resetIn = 2.5;
            notify(`GOOOAL! That's ${football.goals} ${football.goals === 1 ? 'goal' : 'goals'} on the Central Park pitch.`);
            riggedRef.current?.playAction('Dance');
          }
          if (football.resetIn > 0) {
            football.resetIn -= delta;
            if (football.resetIn <= 0) football.ball = newBall();
          }
          football.pitch.show(football.ball);
        }
        const headingBefore = avatar.rotation.y;
        if (moving) avatar.rotation.y = smoothHumanHeading(avatar.rotation.y, movementHeading(next.x - position.x, next.z - position.z), delta);
        position = next;
        const human = riggedRef.current;
        if (human) {
          const lean = bodyLean({ yawRate: delta > 0 ? headingDelta(headingBefore, avatar.rotation.y) / delta : 0, speed: movementSpeed, tired });
          human.setLean(lean.roll, lean.pitch);
          if (moving && human.action === 'Dance') human.stopAction();
        }
        if (jumpTimer > 0) {
          jumpTimer += delta;
          avatar.position.y = jumpHeight(jumpTimer, jump);
          if (jumpTimer >= jump.duration) { jumpTimer = 0; avatar.position.y = 0; human?.playAction('JumpLand'); audioRef.current?.cue('land'); }
        }
        waypointTimer += delta;
        if (waypointTimer >= 0.25) {
          waypointTimer = 0;
          if (clock - noticeAt > 2.5) setDriveNotice(previous => previous ? '' : previous);
          if (atHome) {
            const prompt = atHomeExit(position) ? 'exit' : nearStove(position) ? 'cook' : nearFridge(position) ? 'snack'
              : nearBed(position, BED_SIDE) ? 'bed' : null;
            setDoorPrompt(previous => previous === prompt ? previous : prompt);
          } else if (city) {
            const bus = atBusStop(position, city.stop) ? 'home' : null;
            setBusPrompt(previous => previous === bus ? previous : bus);
            const metres = Math.ceil(Math.hypot(position.x - city.stop.x, position.z - city.stop.z));
            const toPitch = Math.ceil(Math.hypot(position.x - PITCH.x, position.z - PITCH.z));
            const nearBall = football ? Math.hypot(football.ball.x - position.x, football.ball.z - position.z) <= KICK.reach : false;
            const onPitchNow = Math.abs(position.x - PITCH.x) <= PITCH.halfLength + 2 && Math.abs(position.z - PITCH.z) <= PITCH.halfWidth + 2;
            const canStart = onPitchNow && !match;
            setMatchPrompt(previous => previous === canStart ? previous : canStart);
            if (match && toPitch > 45) matchRef.current.leave();
            const board = match ? `Blue ${match.score.home} – ${match.score.away} Red · ${match.phase === 'fulltime' ? 'Full time' : formatMatchClock(match.clock)}` : null;
            setScoreboard(previous => previous === board ? previous : board);
            setBallPrompt(previous => previous === nearBall ? previous : nearBall);
            const work = workplaceAt(position);
            setWorkPrompt(previous => previous === work ? previous : work);
            const job = careerRef.current.career ? CAREERS[careerRef.current.career] : null;
            const jobDoor = careerRef.current.career ? workDoors.get(careerRef.current.career) : undefined;
            const toWork = job && jobDoor ? ` · ${job.workplace} ${Math.ceil(Math.hypot(position.x - jobDoor.x, position.z - jobDoor.z))} m` : '';
            const label = toPitch > PITCH.halfLength + 4
              ? `${city.city.name} · bus stop ${metres} m${toWork} · football pitch ${toPitch} m`
              : `Central Park pitch · goals ${football?.goals ?? 0} · bus stop ${metres} m`;
            setWayfinding(previous => previous === label ? previous : label);
            setNearCar(previous => previous ? false : previous);
          } else if (inSchool) {
            const prompt = atClassroomExit(position) ? 'leave-school' : deskInReach(position) ? 'desk' : null;
            setDoorPrompt(previous => previous === prompt ? previous : prompt);
            const status = schoolStatus(life.minute);
            setWayfinding(previous => previous === status ? previous : status);
          } else {
            const waypoint = schoolWaypoint(position, cameraForward);
            const label = waypoint.distance === null ? ''
              : waypoint.direction === 'at entrance' ? 'School entrance reached'
                : 'School entrance · ' + Math.ceil(waypoint.distance) + ' m · ' + waypoint.direction;
            setWayfinding(previous => previous === label ? previous : label);
            const carInReach = closestInteraction(position, carTargets()) !== null;
            setNearCar(previous => previous === carInReach ? previous : carInReach);
            if (isNearSchool(position)) storyActionsRef.current.reportStory('reached-school');
            const door = streetDoorAt(position);
            const prompt = door ? (door.own ? 'enter' : 'locked')
              : isNearSchool(position) ? (isSchoolOpen(life.minute) ? 'school' : 'school-closed') : null;
            setDoorPrompt(previous => previous === prompt ? previous : prompt);
            const bus = atBusStop(position, MAPLE_BUS_STOP) ? 'downtown' : null;
            setBusPrompt(previous => previous === bus ? previous : bus);
          }
          const entry = currentEntry(life.minute);
          const joinable = joinableLesson(life.minute);
          school.setBoard(joinable?.title ?? entry?.title ?? (isSchoolOpen(life.minute) ? 'Welcome!' : 'Closed'), schoolStatus(life.minute));
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
        // The school activity panel now opens from the teacher inside the classroom.
        const nextNear = inSchool && nearTeacher(position);
        nearSchoolRef.current = nextNear;
        if (nextNear !== previousNear) {
          previousNear = nextNear;
          setNearSchool(nextNear);
        }
        if (city) {
          if (cityCameraRadius === null || Math.abs(camera.radius - cityClampedRadius) > 0.01) cityCameraRadius = camera.radius;
          const along = camera.position.subtract(camera.target).normalize().scale(cityCameraRadius);
          const clear = cameraClearance(city.collider, camera.target, { x: camera.target.x + along.x, z: camera.target.z + along.z });
          const fit = clear / Math.max(0.25, Math.sin(camera.beta));
          camera.radius = Math.min(cityCameraRadius, Math.max(camera.lowerRadiusLimit ?? 1.5, fit));
          cityClampedRadius = camera.radius;
        }
        cameraControls.update(delta);
        cameraControls.follow(position, delta);
        occlusion.update(delta);
        home.setFadedWalls(atHome ? wallsToFade(camera.position) : [], delta);
        school.setFadedWalls(inSchool ? wallsToFadeFor(SCHOOL_ORIGIN, CLASSROOM, camera.position) : [], delta);
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
        writeLife(characterId, life);
        saveToAccount();
        disposed = true;
        remotePlayers.dispose();
        lightBar.dispose();
        siren.dispose();
        sirenRef.current = null;
        disposeMapleStop();
        downtown?.dispose();
        neighbors?.dispose();
        npcSceneRef.current = null;
        renderPipeline.dispose();
        atmosphere.dispose();
        lighting.dispose();
        housePainter.dispose();
        housePainterRef.current = null;
        lightingRef.current = null;
        environmentLoad.cancelled = true;
        schoolAssetCancelled = true;
        schoolAsset?.dispose();
        humanLoadCancelled = true;
        sceneRef.current = null;
        swapBodyRef.current = null;
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
    swapBodyRef.current?.(modelFor(look));
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
    if (schoolOpen) { inputRef.current.clear(); storyActionsRef.current.reportStory('talked-teacher'); }
  }, [schoolOpen]);

  // The opening scene plays once the world has had a moment to appear.
  useEffect(() => {
    const timer = window.setTimeout(() => storyActionsRef.current.openPendingScene(), 1800);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!storyBanner) return;
    audioRef.current?.cue('achievement');
    const timer = window.setTimeout(() => setStoryBanner(''), 5000);
    return () => window.clearTimeout(timer);
  }, [storyBanner]);

  useEffect(() => {
    if (!dialogue) return;
    const line = dialogue.lines[dialogue.index];
    audioRef.current?.cue(line.speaker==='mom' ? 'message' : 'talk');
  }, [dialogue]);

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
  const readMap = useCallback(() => mapReadRef.current(), []);
  const travelTo = useCallback((to: TravelTarget) => travelRef.current(to), []);
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

  const workAction = workPrompt && inCity
    ? (career.career === workPrompt ? `Start shift at the ${CAREERS[workPrompt].workplace} (E)` : `Apply: ${CAREERS[workPrompt].title} (E)`)
    : null;
  const actionLabel = driving ? 'Get out of car (E)'
    : nearNpc && !inHome && !atSchool ? `Talk to ${NPC_DIALOGUES[nearNpc].name} (E)`
    : doorPrompt === 'exit' ? 'Go outside (E)'
      : doorPrompt === 'bed' ? 'Sleep (E)'
      : doorPrompt === 'cook' ? 'Cook a meal (E)'
      : doorPrompt === 'snack' ? 'Grab a snack (E)'
      : doorPrompt === 'leave-school' ? 'Leave school (E)'
      : doorPrompt === 'desk' ? 'Sit down for class (E)'
      : doorPrompt === 'school' ? 'Go into school (E)'
      : doorPrompt === 'school-closed' ? 'School (closed)'
      : doorPrompt === 'enter' ? 'Go inside your home (E)'
        : doorPrompt === 'locked' ? "Neighbors' house (E)"
          : nearCar && !inHome && !atSchool ? 'Get in car (E)' : '';
  return <div className="world-root" aria-label="Playable 3D neighborhood">
    <div className="world-viewport">
      {!error && <canvas ref={canvasRef} tabIndex={0} aria-label={`3D world for ${displayName}; click to focus, use WASD or arrow keys to move`} />}
      {error ? <p className="world-fallback" role="status">{error}</p> : <>
        <div className="world-life" role="status" aria-label={`Day ${lifeView.day}, ${formatClock(lifeView.minute)}, energy ${Math.round(lifeView.energy)} percent`}>
          <span>Day {lifeView.day} · {formatClock(lifeView.minute)}{lifeSync && syncStatus !== 'idle' &&
            <small className="world-sync"> · {syncStatus === 'offline' ? 'Saved in this browser' : syncStatus === 'saving' ? 'Saving…' : 'Saved to your account'}</small>}</span>
          <span className="world-energy" data-low={lifeView.energy <= TIRED_ENERGY ? 'true' : undefined}>
            Energy <span className="world-energy-bar" aria-hidden="true"><span style={{ width: `${Math.round(lifeView.energy)}%` }} /></span> {Math.round(lifeView.energy)}%
          </span>
        </div>
        {sleeping && <div className="world-sleep" role="status" aria-live="polite"><span>Sleeping…</span></div>}
        {busyLabel && <div className="world-sleep world-kitchen" role="status" aria-live="polite"><span>{busyLabel}</span></div>}
        {inClass && <div className="world-sleep world-class" role="status" aria-live="polite"><span>{inClass} class…</span></div>}
        <div className="world-caption"><strong>{displayName}</strong> · {inHome ? 'At home' : atSchool ? 'At school' : inCity ? inCity : demoMode ? 'Guest preview · progress not saved' : 'Neighborhood demo'}</div>
        {wayfinding && <div className="world-wayfinding" aria-label="School directions">{wayfinding}</div>}
        <WorldMap open={mapOpen} onClose={() => setMapOpen(false)} read={readMap} travel={travelTo} />
        {scoreboard && <div className="world-scoreboard" role="status" aria-live="polite"><strong>{scoreboard}</strong><small>F shoot · Shift+F chip · Q pass</small>
          <button type="button" onClick={event => { matchRef.current.pass(); focusWorld(event); }}>Pass (Q)</button></div>}
        {(() => {
          const { chapter, step } = currentStep(story);
          return <div className="story-objective" aria-live="polite"><small>{chapter.title}</small><strong>{step.objective}</strong></div>;
        })()}
        {storyBanner && <div className="story-banner" role="status">{storyBanner}</div>}
        {dialogue && (() => {
          const current = dialogue.lines[dialogue.index];
          const cast = CAST[current.speaker];
          return <div className="story-scene" role="dialog" aria-label="Story scene" onClick={() => advanceDialogue()}>
            <div className="story-letterbox story-letterbox-top" />
            <div className="story-letterbox story-letterbox-bottom" />
            <div className={`story-box story-${cast.tone}`}>
              {cast.name && <span className="story-speaker">{cast.name}</span>}
              <p>{current.text}</p>
              <span className="story-continue">{dialogue.index + 1}/{dialogue.lines.length} · E, Enter or click to continue ▸</span>
            </div>
          </div>;
        })()}
        {rangeOpen && <TrainingRange drill={RANGE_DRILLS[rangeOpen]} energy={lifeView.energy}
          onFinish={score => rangeRef.current.finish(score)} canRetry={() => rangeRef.current.canRetry()}
          onLeave={() => { closeRange(); canvasRef.current?.focus(); }}
          cue={name => audioRef.current?.cue(name)} />}
        {npcChat && <div className="npc-chat-backdrop" role="dialog" aria-modal="true"
          aria-label={`Conversation with ${npcChat.conversation.name}`}>
          <section className="npc-chat-card">
            <div className="npc-chat-heading"><strong>{npcChat.conversation.name}</strong>
              <button type="button" aria-label="Leave conversation" onClick={() => closeNpcChat()}>Close</button></div>
            <p>{npcChat.outcome ? npcChat.outcome.reply : npcChat.conversation.greeting}</p>
            {npcChat.outcome ? <>
              <div className="npc-chat-result" role="status">
                Relationship {npcChat.outcome.trustDelta > 0 ? '+' : ''}{npcChat.outcome.trustDelta}
                · Trust {npcRelations.people[npcChat.conversation.id].trust}
                <span> · Saved to this browser</span>
              </div>
              <button type="button" onClick={() => closeNpcChat()}>Continue story</button>
            </> : <div className="npc-chat-choices">
              {npcChat.conversation.choices.map((choice, index) => <button type="button" key={choice.id}
                onClick={() => chooseNpc(choice.id)}>{index + 1}. {choice.label}</button>)}
              <small>Choose with 1–3, or tap an answer. Escape to leave.</small>
            </div>}
          </section>
        </div>}
        {driving && <div className="world-drive-hud" role="status" aria-live="polite">
          <strong>{driveSpeed}</strong>km/h · W/S gas, brake, reverse · A/D steer · E to get out when stopped
          {driveNotice && <span className="world-drive-notice">{driveNotice}</span>}
        </div>}
        {!driving && driveNotice && <div className="world-notice" role="status" aria-live="polite">{driveNotice}</div>}
        {workPrompt && inCity && career.career === workPrompt && !rangeOpen && <button type="button" className="world-car-action world-range-start"
          onClick={event => { rangeRef.current.open(); focusWorld(event); }}>{RANGE_DRILLS[workPrompt].title} (T)</button>}
        {matchPrompt && inCity && !scoreboard && <button type="button" className="world-car-action world-match-start"
          onClick={event => { matchRef.current.start(); focusWorld(event); }}>Start a five-a-side match (M)</button>}
        {(busAction ?? workAction ?? (ballPrompt && inCity ? 'Kick (E or F) · Shift+F chips' : null) ?? actionLabel) && <button type="button" className="world-car-action"
          onClick={event => { interactRef.current(); focusWorld(event); }}>
          {busAction ?? workAction ?? (ballPrompt && inCity ? 'Kick (E or F) · Shift+F chips' : null) ?? actionLabel}
        </button>}
        {riding && <div className="world-sleep world-bus" role="status" aria-live="polite"><span>{riding}</span></div>}
        {nearSchool && <button type="button" className="world-enter"
          aria-expanded={schoolOpen} aria-controls="school-game-panel"
          onClick={() => setSchoolOpen(current => !current)}>
          {schoolOpen ? 'Close' : 'Talk to the teacher (E)'}
        </button>}
        {nearSchool && schoolOpen && <section className="world-school-panel" id="school-game-panel" aria-label="School activities in game">
          <h3>School</h3>
          <button type="button" className="npc-teacher-talk" onClick={() => openNpcChat('rivera')}>
            Have a conversation with Ms. Rivera
          </button>
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
      <p>Click the world, then use WASD, arrow keys or the direction pad to move. Hold Shift or switch Run on to move faster. Release the direction to stop. Drag to orbit; scroll, pinch or use the zoom buttons to zoom. Press E at the school entrance to go in (7:30 AM–4 PM), E at a desk to take the current class, and E by the teacher for other school activities; Escape closes the panel. Press E at your front door (the house on the left) to go inside, and E at the inside door to go back out. Cook at the stove or grab a snack from the fridge for energy. Your energy drains as the day goes on; when you're tired or it's evening, press E beside your bed to sleep until 7:00 AM. Press E next to a car to drive it: W/S for gas, brake and reverse, A/D to steer, and E again to get out once stopped.</p>
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
    {!error && <HousePhotoPaint characterId={characterId} painterRef={housePainterRef} />}
    {!error && <ScanImport sceneRef={sceneRef} />}
    {!error && <p role="status" style={{ fontSize: '0.8rem', opacity: 0.8 }}>{modelStatus}</p>}
    {!error && inCity && <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Downtown map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> (ODbL).</p>}
    {!error && propCredit && <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Some 3D props by <a href="https://polyhaven.com" target="_blank" rel="noreferrer">Poly Haven</a> (CC0).</p>}
    {!error && <div className="world-camera-toggle" role="group" aria-label="Camera controls">
      <button type="button" aria-label="Zoom in" onClick={event => { cameraControlsRef.current?.zoom('in'); focusWorld(event); }}>Zoom +</button>
      <button type="button" aria-label="Zoom out" onClick={event => { cameraControlsRef.current?.zoom('out'); focusWorld(event); }}>Zoom −</button>
      <button type="button" onClick={event => { cameraControlsRef.current?.reset(); focusWorld(event); }}>Reset view</button>
      <button type="button" onClick={event => { setMapOpen(open => !open); focusWorld(event); }}>Map (N)</button>
      <button type="button" onClick={event => { emoteRef.current('jump'); focusWorld(event); }}>Jump (Space)</button>
      <button type="button" onClick={event => { emoteRef.current('dance'); focusWorld(event); }}>Dance (G)</button>
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
    <AudioPanel director={audioRef} />
    {!error && <CareersPanel career={career}
      onWearUniform={() => { if (career.career) setLook(current => ({ ...current, ...CAREERS[career.career!].uniform })); }}
      onQuit={() => saveCareer(quitCareer(career))} />}
    {!error && <Wardrobe look={look} setLook={setLook}
      note={`Outfit and appearance choices are saved in this browser only. ${demoMode ? 'Guest appearance is not linked to an account.' : 'Server-synced customization is coming later.'}`} />}
  </div>;
}
