import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type CSSProperties } from 'react';
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight,
  MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { isNearSchool, movementVector, stepPosition, type PlanarPosition } from './movement.mjs';
import { LOOKS, colorFor, readLook, writeLook, type Look } from './appearance.mjs';

type WorldProps = { characterId: string; displayName: string; onSchoolEnter: () => void };
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
  return { root, jacket, face, hair, legs, arms };
}

/** The WebGL view is optional: login and school actions remain usable if 3D fails. */
export default function WorldScene({ characterId, displayName, onSchoolEnter }: WorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressed = useRef(new Set<string>());
  const [error, setError] = useState('');
  const [nearSchool, setNearSchool] = useState(false);
  const [look, setLook] = useState<Look>(() => readLook(characterId));
  const avatarRef = useRef<ReturnType<typeof createAvatar> | null>(null);

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
      createNeighborhood(scene);
      const avatarParts = createAvatar(scene);
      avatarRef.current = avatarParts;
      const { root: avatar } = avatarParts;
      avatarParts.jacket.diffuseColor = Color3.FromHexString(colorFor('outfit', look.outfit));
      avatarParts.face.diffuseColor = Color3.FromHexString(colorFor('skin', look.skin));
      avatarParts.hair.diffuseColor = Color3.FromHexString(colorFor('hair', look.hair));
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
        if (document.activeElement !== canvas) return;
        const key = normalizeKey(event.key);
        if (MOVE_KEYS.has(key)) {
          event.preventDefault();
          pressed.current.add(key);
        }
      };
      const onKeyUp = (event: KeyboardEvent) => {
        const key = normalizeKey(event.key);
        if (MOVE_KEYS.has(key)) pressed.current.delete(key);
      };
      const clear = () => pressed.current.clear();
      const focus = () => canvas.focus();
      const resize = () => engine?.resize();
      canvas.addEventListener('pointerdown', focus);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', clear);
      window.addEventListener('resize', resize);

      let previousNear = false;
      let elapsed = 0;
      engine.runRenderLoop(() => {
        const delta = Math.min(engine!.getDeltaTime() / 1000, 0.05);
        const next = stepPosition(position, pressed.current, delta, pressed.current.has('Shift') ? 6 : 4);
        const direction = movementVector(pressed.current);
        const moving = next.x !== position.x || next.z !== position.z;
        position = next;
        avatar.position.x = position.x;
        avatar.position.z = position.z;
        if (moving) {
          avatar.rotation.y = Math.atan2(direction.x, -direction.z);
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
        if (nextNear !== previousNear) {
          previousNear = nextNear;
          setNearSchool(nextNear);
        }
        camera.setTarget(Vector3.Lerp(camera.getTarget(), new Vector3(position.x, 1.25, position.z), 0.12));
        scene.render();
      });
      engine.resize();

      return () => {
        pressed.current.clear();
        canvas.removeEventListener('pointerdown', focus);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', clear);
        window.removeEventListener('resize', resize);
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
    const parts = avatarRef.current;
    if (parts) {
      parts.jacket.diffuseColor = Color3.FromHexString(colorFor('outfit', look.outfit));
      parts.face.diffuseColor = Color3.FromHexString(colorFor('skin', look.skin));
      parts.hair.diffuseColor = Color3.FromHexString(colorFor('hair', look.hair));
    }
  }, [characterId, look]);

  const touch = (key: string, down: boolean, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (down) {
      event.currentTarget.setPointerCapture(event.pointerId);
      pressed.current.add(key);
    } else {
      pressed.current.delete(key);
    }
  };
  const keyboardTouch = (key: string, down: boolean, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (down) pressed.current.add(key);
      else pressed.current.delete(key);
    }
  };
  const directionButton = (symbol: string, key: string, label: string) =>
    <button key={key} type="button" aria-label={label} className="world-pad-key"
      onPointerDown={event => touch(key, true, event)}
      onPointerUp={event => touch(key, false, event)}
      onPointerCancel={event => touch(key, false, event)}
      onLostPointerCapture={() => pressed.current.delete(key)}
      onKeyDown={event => keyboardTouch(key, true, event)}
      onKeyUp={event => keyboardTouch(key, false, event)}>{symbol}</button>;

  return <div className="world-root" aria-label="Playable 3D neighborhood">
    <div className="world-viewport">
      {!error && <canvas ref={canvasRef} tabIndex={0} aria-label={`3D world for ${displayName}; click to focus, use WASD or arrow keys to move`} />}
      {error ? <p className="world-fallback" role="status">{error}</p> : <>
        <div className="world-caption"><strong>{displayName}</strong> · Neighborhood demo</div>
        {nearSchool && <button type="button" className="world-enter" onClick={onSchoolEnter}>Enter school</button>}
      </>}
    </div>
    {!error && <div className="world-controls">
      <p>Click the world, then move with WASD or arrow keys. Hold Shift to run. Drag to rotate the camera. Walk to the school entrance.</p>
      <div className="world-pad" aria-label="Touch movement controls">
        <div className="world-pad-top">{directionButton('▲', 'ArrowUp', 'Move forward')}</div>
        <div className="world-pad-bottom">
          {directionButton('◀', 'ArrowLeft', 'Move left')}
          {directionButton('▼', 'ArrowDown', 'Move backward')}
          {directionButton('▶', 'ArrowRight', 'Move right')}
        </div>
      </div>
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
      <p>Outfit and appearance choices are saved in this browser only. Server-synced customization is coming later.</p>
    </section>}
  </div>;
}
