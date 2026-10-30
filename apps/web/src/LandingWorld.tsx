import { useEffect, useRef, useState } from 'react';
import { addNeighborhoodDetails } from './world/neighborhoodDetails';
import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';

/** A lightweight, real-time 3D neighborhood for visitors who have not signed in. */
export default function LandingWorld() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!Engine.isSupported()) { setUnavailable(true); return; }
    let cleanupEngine: Engine | undefined;
    try {
      const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
      cleanupEngine = engine;
      engine.setHardwareScalingLevel(1 / Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)));
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.60, 0.79, 0.94, 1);
      const camera = new ArcRotateCamera('arrival-camera', -Math.PI / 2.7, 1.12, 27, new Vector3(0, 1.5, 0), scene);
      camera.lowerRadiusLimit = 18; camera.upperRadiusLimit = 32;
      camera.attachControl(canvas, true);
      new HemisphericLight('sky', new Vector3(0, 1, 0), scene).intensity = 1.1;
      const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, -0.4), scene);
      sun.intensity = 1.4;
      const material = (name: string, hex: string) => {
        const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex); return m;
      };
      const grass = material('park-grass', '#4c946a');
      const asphalt = material('road', '#344458');
      const pavement = material('sidewalk', '#c3cad0');
      const wallColors = ['#f2c6a0', '#f3e6cb', '#a8c5d1', '#d7b3c9'];
      const roofs = material('roofs', '#465875');
      const trunks = material('tree-trunks', '#73553c');
      const foliage = material('tree-leaves', '#3b7756');
      const skin = material('character-skin', '#b97d57');
      const shirt = material('character-jacket', '#f2b85d');
      const trousers = material('character-trousers', '#233e60');
      const ground = MeshBuilder.CreateGround('grass', { width: 70, height: 60 }, scene); ground.material = grass;
      const road = MeshBuilder.CreateGround('street', { width: 8, height: 60 }, scene); road.position.y = 0.02; road.material = asphalt;
      for (const x of [-5, 5]) {
        const walk = MeshBuilder.CreateGround('sidewalk', { width: 2.1, height: 60 }, scene);
        walk.position.set(x, 0.04, 0); walk.material = pavement;
      }
      for (let z = -25; z < 27; z += 8) {
        const stripe = MeshBuilder.CreateGround('lane-marking', { width: 0.18, height: 3 }, scene);
        stripe.position.set(0, 0.06, z); stripe.material = material('lane-white', '#f4e5b5');
      }
      const houses = [[-12, -18], [12, -17], [-12, -2], [12, 1], [-12, 15], [12, 17]];
      houses.forEach(([x, z], i) => {
        const house = MeshBuilder.CreateBox('home-' + i, { width: 6.4, height: 4.4, depth: 6 }, scene);
        house.position.set(x, 2.2, z); house.material = material('wall-' + i, wallColors[i % wallColors.length]);
        const roof = MeshBuilder.CreateCylinder('roof-' + i, { diameter: 7.6, height: 2.4, tessellation: 4 }, scene);
        roof.rotation.z = Math.PI / 2; roof.position.set(x, 5.1, z); roof.material = roofs;
        const door = MeshBuilder.CreateBox('door-' + i, { width: 1.2, height: 2.3, depth: 0.12 }, scene);
        door.position.set(x + (x < 0 ? 3.25 : -3.25), 1.15, z);
        door.rotation.y = Math.PI / 2; door.material = roofs;
      });
      for (const x of [-19, 19]) for (let z = -24; z < 26; z += 10) {
        const trunk = MeshBuilder.CreateCylinder('tree-trunk', { diameter: 0.55, height: 3.3 }, scene);
        trunk.position.set(x, 1.65, z); trunk.material = trunks;
        const crown = MeshBuilder.CreateSphere('tree-crown', { diameter: 4.2, segments: 8 }, scene);
        crown.position.set(x, 4.1, z); crown.material = foliage;
      }
      addNeighborhoodDetails(scene);
      const pedestrians: { root: TransformNode; offset: number; lane: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const root = new TransformNode('walking-neighbor-' + i, scene);
        const body = MeshBuilder.CreateCapsule('body-' + i, { height: 2, radius: 0.43 }, scene);
        body.position.y = 1.15; body.material = i % 2 ? trousers : shirt; body.parent = root;
        const head = MeshBuilder.CreateSphere('head-' + i, { diameter: 0.68 }, scene);
        head.position.y = 2.45; head.material = skin; head.parent = root;
        const lane = i % 2 ? 5.5 : -5.5;
        root.position.set(lane, 0, i * 12 - 18);
        pedestrians.push({ root, offset: i * 12 - 18, lane });
      }
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let cameraInteracted = false;
      const stopAutoOrbit = () => { cameraInteracted = true; };
      canvas.addEventListener('pointerdown', stopAutoOrbit);
      canvas.addEventListener('wheel', stopAutoOrbit, { passive: true });
      let time = 0;
      engine.runRenderLoop(() => {
        if (!reduceMotion) {
          time += engine.getDeltaTime() / 1000;
          pedestrians.forEach(({ root, offset, lane }, i) => {
            const travel = ((time * (i % 2 ? -1.1 : 1.1) + offset + 30) % 60 + 60) % 60 - 30;
            root.position.set(lane, Math.sin(time * 8 + i) * 0.04, travel);
            root.rotation.y = i % 2 ? Math.PI : 0;
          });
          if (!cameraInteracted) camera.alpha = -Math.PI / 2.7 + Math.sin(time * 0.12) * 0.1;
        }
        scene.render();
      });
      const resize = () => engine.resize();
      window.addEventListener('resize', resize);
      return () => {
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('pointerdown', stopAutoOrbit);
        canvas.removeEventListener('wheel', stopAutoOrbit);
        scene.dispose(); engine.dispose();
      };
    } catch {
      cleanupEngine?.dispose();
      setUnavailable(true);
    }
  }, []);
  return <div className="landing-world hero">
    {!unavailable && <canvas ref={canvasRef} aria-label="Animated 3D neighborhood with houses, trees and walking residents" />}
    <div className="landing-world-copy"><span className="landing-eyebrow">A world shaped by your choices</span>
      <h2>One life. Infinite decisions.</h2>
      <p>Explore your neighborhood, build a future and watch your story unfold.</p>
      <span className="landing-hint" role={unavailable ? 'status' : undefined}>{unavailable ? '3D preview unavailable in this browser. Sign-in and account controls remain available below.' : 'Explore the neighborhood with your mouse or touch'}</span>
    </div>
  </div>;
}
