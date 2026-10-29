import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type CSSProperties } from 'react';
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight,
  MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, SceneLoader, PBRMaterial,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { isNearSchool, movementVector, stepPosition, type PlanarPosition } from './movement.mjs';
import { schoolWaypoint } from './schoolWayfinding.mjs';
import { createMovementInput } from './inputState.mjs';
import { cameraFollowAlpha } from './cameraFollow.mjs';
import { classifyHumanMotion, blendHumanWeights, smoothHumanHeading } from './humanMotion.mjs';
import { LOOKS, colorFor, readLook, writeLook, type Look } from './appearance.mjs';

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
  const road = MeshBuilder.CreateGround('neighborhood road', { width: 4.2, height: 24 }, scene);
  road.position.y = 0.015;
  road.material = street;
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

  for (const x of [-8.4, 8.4]) {
    const house = MeshBuilder.CreateBox('home', { width: 4.2, height: 3.1, depth: 4.9 }, scene);
    house.position.set(x, 1.55, -5.05);
    house.material = houses;
    const houseRoof = MeshBuilder.CreateBox('home roof', { width: 4.6, height: 0.45, depth: 5.2 }, scene);
    houseRoof.position.set(x, 3.35, -5.05);
    houseRoof.material = roof;
  }

  for (const [x, z] of [[-8, 3], [8, 3], [-8, 8], [8, 8], [-4.8, -8.4], [4.8, -8.4]]) {
    const trunk = MeshBuilder.CreateCylinder('tree trunk', { height: 1.8, diameter: 0.42 }, scene);
    trunk.position.set(x, 0.9, z);
    trunk.material = wood;
    const crown = MeshBuilder.CreateSphere('tree canopy', { diameter: 2.3, segments: 8 }, scene);
    crown.position.set(x, 2.3, z);
    crown.material = leaves;
  }
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
  const nearSchoolRef = useRef(false);
  const schoolOpenRef = useRef(false);
  const [error, setError] = useState('');
  const [nearSchool, setNearSchool] = useState(false);
  const [wayfinding, setWayfinding] = useState('');
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [look, setLook] = useState<Look>(() => readLook(characterId));
  const avatarRef = useRef<ReturnType<typeof createAvatar> | null>(null);
  const humanMaterialsRef = useRef<{ skin: PBRMaterial | null; hair: PBRMaterial | null; outfit: PBRMaterial | null } | null>(null);
  const lookRef = useRef(look);
  const [modelStatus, setModelStatus] = useState('Loading human model…');
  const [cameraMode, setCameraMode] = useState<'follow' | 'overhead'>('follow');
  const cameraModeRef = useRef<'follow' | 'overhead'>('follow');
  const toggleCamera = () => {
    const next = cameraModeRef.current === 'follow' ? 'overhead' : 'follow';
    cameraModeRef.current = next;
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
      engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.67, 0.83, 0.96, 1);
      const sun = new HemisphericLight('daylight', new Vector3(0, 1, 0), scene);
      sun.intensity = 0.9;
      const directional = new DirectionalLight('sun', new Vector3(-0.4, -1, -0.6), scene);
      directional.intensity = 0.7;
      const schoolMarker = createNeighborhood(scene);
      const avatarParts = createAvatar(scene);
      avatarRef.current = avatarParts;
      const { root: avatar } = avatarParts;
      avatarParts.jacket.diffuseColor = Color3.FromHexString(colorFor('outfit', look.outfit));
      avatarParts.face.diffuseColor = Color3.FromHexString(colorFor('skin', look.skin));
      avatarParts.hair.diffuseColor = Color3.FromHexString(colorFor('hair', look.hair));
      // Keep the original placeholder visible until a complete rig loads successfully.
      const fallbackMeshes = avatar.getChildMeshes().slice();
      let humanRoot: TransformNode | null = null;
      let humanAnimations: Record<'idle' | 'walk' | 'run', import('@babylonjs/core').AnimationGroup | undefined> = {
        idle: undefined, walk: undefined, run: undefined,
      };
      let activeHumanState: 'idle' | 'walk' | 'run' = 'idle';
      let humanWeights = { idle: 1, walk: 0, run: 0 };
      let humanTransition = { from: { ...humanWeights }, target: activeHumanState, elapsed: 0 };
      let humanLoadCancelled = false;
      void SceneLoader.ImportMeshAsync('', '/models/', 'human.gltf', scene).then(result => {
        if (humanLoadCancelled || scene.isDisposed) return;
        const animations = {
          idle: result.animationGroups.find(g => /^idle$/i.test(g.name)),
          walk: result.animationGroups.find(g => /^walk$/i.test(g.name)),
          run: result.animationGroups.find(g => /^run$/i.test(g.name)),
        };
        if (!result.meshes.some(mesh => mesh.getTotalVertices() > 0) ||
            !animations.idle || !animations.walk || !animations.run) {
          result.meshes.forEach(mesh => mesh.setEnabled(false));
          setModelStatus('Placeholder human · rig or animations unavailable');
          return;
        }
        const root = new TransformNode('rigged player visual', scene);
        root.parent = avatar;
        // Both skinned mesh and bone hierarchy must follow the moving player.
        // Parenting only meshes leaves animated joints behind at world origin.
        for (const node of [...result.transformNodes, ...result.meshes]) {
          if (!node.parent) node.parent = root;
        }
        humanRoot = root;
        humanAnimations = animations;
        for (const group of result.animationGroups) {
          group.stop();
        }
        for (const group of [animations.idle, animations.walk, animations.run]) {
          group.start(true);
          group.setWeightForAllAnimatables(0);
        }
        animations.idle.setWeightForAllAnimatables(1);
        const skin = scene.getMaterialByName('HumanSkin');
        const hair = scene.getMaterialByName('HumanHair');
        const outfit = scene.getMaterialByName('HumanOutfit');
        humanMaterialsRef.current = {
          skin: skin instanceof PBRMaterial ? skin : null,
          hair: hair instanceof PBRMaterial ? hair : null,
          outfit: outfit instanceof PBRMaterial ? outfit : null,
        };
        const selected = lookRef.current;
        if (humanMaterialsRef.current.skin) humanMaterialsRef.current.skin.albedoColor = Color3.FromHexString(colorFor('skin', selected.skin));
        if (humanMaterialsRef.current.hair) humanMaterialsRef.current.hair.albedoColor = Color3.FromHexString(colorFor('hair', selected.hair));
        if (humanMaterialsRef.current.outfit) humanMaterialsRef.current.outfit.albedoColor = Color3.FromHexString(colorFor('outfit', selected.outfit));
        fallbackMeshes.forEach(mesh => mesh.setEnabled(false));
        setModelStatus('Original rigged human · idle / walk / run');
      }).catch(() => {
        if (!humanLoadCancelled) setModelStatus('Placeholder human · model loading failed');
      });
      let position: PlanarPosition = { x: 0, z: 3.8 };
      avatar.position.set(position.x, 0, position.z);
      const camera = new ArcRotateCamera('third-person camera', Math.PI / 2, 1.2, 11,
        new Vector3(0, 1.25, 0), scene);
      camera.lowerRadiusLimit = 7;
      camera.upperRadiusLimit = 15;
      camera.lowerBetaLimit = 0.5;
      camera.upperBetaLimit = 1.45;
      camera.attachControl(canvas, true);

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
        } else if (key === 'e' && nearSchoolRef.current && !event.repeat) {
          event.preventDefault();
          setSchoolOpen(open => !open);
        }
      };
      const onKeyUp = (event: KeyboardEvent) => {
        const key = normalizeKey(event.key);
        if (MOVE_KEYS.has(key)) inputRef.current.release(`keyboard:${key}`);
      };
      const clear = () => inputRef.current.clear();
      const focus = () => canvas.focus();
      const resize = () => engine?.resize();
      canvas.addEventListener('pointerdown', focus);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', clear);
      window.addEventListener('resize', resize);

      let previousNear = false;
      let elapsed = 0;
      let waypointTimer = 0;
      let markerTime = 0;
      engine.runRenderLoop(() => {
        const delta = Math.min(engine!.getDeltaTime() / 1000, 0.05);
        // Controls follow the orbit camera: W always walks away from the viewer.
        const cameraDirection = camera.getForwardRay().direction;
        markerTime += delta;
        schoolMarker.position.y = 4.6 + Math.sin(markerTime * 2.5) * 0.12;
        const cameraForward = { x: cameraDirection.x, z: cameraDirection.z };
        const next = schoolOpenRef.current ? position : stepPosition(position, inputRef.current.pressed, delta, inputRef.current.pressed.has('Shift') ? 6 : 4, cameraForward);
        const direction = movementVector(inputRef.current.pressed, cameraForward);
        const moving = next.x !== position.x || next.z !== position.z;
        const movementSpeed = delta > 0 ? Math.hypot(next.x - position.x, next.z - position.z) / delta : 0;
        position = next;
        waypointTimer += delta;
        if (waypointTimer >= 0.25) {
          waypointTimer = 0;
          const waypoint = schoolWaypoint(position, cameraForward);
          const label = waypoint.distance === null ? ''
            : waypoint.direction === 'at entrance' ? 'School entrance reached'
              : 'School entrance · ' + Math.ceil(waypoint.distance) + ' units · ' + waypoint.direction;
          setWayfinding(previous => previous === label ? previous : label);
        }
        avatar.position.x = position.x;
        avatar.position.z = position.z;
        if (humanRoot) {
          const state = classifyHumanMotion(movementSpeed);
          if (state !== activeHumanState) {
            activeHumanState = state;
            humanTransition = { from: { ...humanWeights }, target: state, elapsed: 0 };
          }
          humanTransition.elapsed = Math.min(0.2, humanTransition.elapsed + delta);
          humanWeights = blendHumanWeights(humanTransition.from, humanTransition.target, humanTransition.elapsed);
          for (const name of ['idle', 'walk', 'run'] as const) {
            humanAnimations[name]?.setWeightForAllAnimatables(humanWeights[name]);
          }
        }
        if (moving) {
          const desiredHeading = Math.atan2(direction.x, -direction.z);
          avatar.rotation.y = humanRoot ? smoothHumanHeading(avatar.rotation.y, desiredHeading, delta) : desiredHeading;
          elapsed += delta * 13;
          avatar.position.y = humanRoot ? 0 : Math.abs(Math.sin(elapsed)) * 0.06;
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
        const overhead = cameraModeRef.current === 'overhead';
        const blend = 1 - Math.exp(-5 * delta);
        camera.beta += ((overhead ? 0.3 : 1.2) - camera.beta) * blend;
        camera.radius += ((overhead ? 22 : 11) - camera.radius) * blend;
        camera.setTarget(Vector3.Lerp(camera.getTarget(), new Vector3(position.x, 1.25, position.z), cameraFollowAlpha(delta)));
        scene.render();
      });
      engine.resize();

      return () => {
        inputRef.current.clear();
        canvas.removeEventListener('pointerdown', focus);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', clear);
        window.removeEventListener('resize', resize);
        humanLoadCancelled = true;
        engine?.dispose();
        avatarRef.current = null;
        humanMaterialsRef.current = null;
      };
    } catch {
      engine?.dispose();
      avatarRef.current = null;
      setError('Unable to load the 3D world. Your character and school activities are still available below.');
    }
  }, []);

  // Cosmetics are deliberately browser-local during the demo; progression remains on the API.
  useEffect(() => {
    lookRef.current = look;
    const humanMaterials = humanMaterialsRef.current;
    if (humanMaterials?.skin) humanMaterials.skin.albedoColor = Color3.FromHexString(colorFor('skin', look.skin));
    if (humanMaterials?.hair) humanMaterials.hair.albedoColor = Color3.FromHexString(colorFor('hair', look.hair));
    if (humanMaterials?.outfit) humanMaterials.outfit.albedoColor = Color3.FromHexString(colorFor('outfit', look.outfit));
    writeLook(characterId, look);
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
      <p>Click the world, then move relative to the camera with WASD or arrow keys. Hold Shift or the Run button to sprint. Drag to rotate the camera. At the school entrance, press E or tap Enter school; Escape closes the panel.</p>
      <div className="world-control-buttons">
        <div className="world-pad" aria-label="Touch movement controls">
          <div className="world-pad-top">{directionButton('▲', 'ArrowUp', 'Move forward')}</div>
          <div className="world-pad-bottom">
            {directionButton('◀', 'ArrowLeft', 'Move left')}
            {directionButton('▼', 'ArrowDown', 'Move backward')}
            {directionButton('▶', 'ArrowRight', 'Move right')}
          </div>
        </div>
        <div className="world-run">{directionButton('RUN', 'Shift', 'Hold to sprint')}</div>
      </div>
    </div>}
    {!error && <p role="status" style={{ fontSize: '0.8rem', opacity: 0.8 }}>{modelStatus}</p>}
    {!error && <div className="world-camera-toggle" style={{ margin: '0.75rem 0' }}>
      <button type="button" onClick={toggleCamera} aria-label="Switch camera view">
        Camera: {cameraMode === 'follow' ? 'Third person' : 'Overhead'} · Switch (C)
      </button>
    </div>}
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
