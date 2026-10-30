import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createCameraControls, CAMERA_PRESETS } from '../src/world/cameraControls.mjs';
import { createMovementInput } from '../src/world/inputState.mjs';
import { stepLocomotion } from '../src/world/locomotion.mjs';
import { HUMAN_RUN_SPEED, HUMAN_WALK_SPEED } from '../src/world/humanMotion.mjs';

function cameraFixture(t) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera('test', Math.PI/2, 1.15, 7.5, Vector3.Zero(), scene);
  t.after(() => { scene.dispose(); engine.dispose(); });
  return { camera, scene, controls: createCameraControls(camera) };
}

test('manual zoom and orbit remain stable across subsequent rendered frames', t => {
  const { camera, scene, controls } = cameraFixture(t);
  controls.zoom('in');
  camera.beta = 0.7;
  for (let i=0; i<120; i++) {
    controls.update(1/60);
    controls.follow({x:i*.03,z:-i*.02},1/60);
    scene.render();
  }
  assert.ok(Math.abs(camera.radius - 6) < 1e-8);
  assert.ok(Math.abs(camera.beta - 0.7) < 1e-8);
});

test('overhead transition reaches an angle inside Babylon limits and then stops owning zoom', t => {
  const { camera, scene, controls } = cameraFixture(t);
  controls.setMode('overhead');
  for (let i=0; i<30; i++) { controls.update(1/60); scene.render(); }
  assert.equal(camera.beta, CAMERA_PRESETS.overhead.beta);
  assert.equal(camera.radius, CAMERA_PRESETS.overhead.radius);
  controls.zoom('in');
  for (let i=0; i<60; i++) { controls.update(1/60); scene.render(); }
  assert.ok(Math.abs(camera.radius - 17.6) < 1e-8);
});

test('user gesture can interrupt a camera transition; reset and zoom respect limits', t => {
  const { camera, controls } = cameraFixture(t);
  controls.setMode('overhead');
  controls.update(0.1);
  controls.cancel();
  camera.radius = 15;
  controls.update(1);
  assert.equal(camera.radius, 15);
  for (let i=0; i<100; i++) controls.zoom('in');
  assert.equal(camera.radius, CAMERA_PRESETS.overhead.minRadius);
  for (let i=0; i<100; i++) controls.zoom('out');
  assert.equal(camera.radius, CAMERA_PRESETS.overhead.maxRadius);
  controls.setMode('follow');
  controls.reset();
  controls.update(0.4);
  assert.equal(camera.radius, 7.5);
  assert.equal(camera.beta, 1.15);
});

test('keyboard Shift and touch Run select the running clip at the actual faster speed', () => {
  const start = { x: 0, z: 2 };
  const walk = stepLocomotion(start, new Set(['w']), 1/60, false);
  const keyboardRun = stepLocomotion(start, new Set(['w','Shift']), 1/60, false);
  const touchRun = stepLocomotion(start, new Set(['ArrowUp']), 1/60, true);
  assert.equal(walk.motion, 'walk');
  assert.equal(keyboardRun.motion, 'run');
  assert.equal(touchRun.motion, 'run');
  assert.ok(Math.abs(walk.speed - HUMAN_WALK_SPEED) < 1e-10);
  assert.ok(Math.abs(touchRun.speed - HUMAN_RUN_SPEED) < 1e-10);
  assert.deepEqual(keyboardRun.position, touchRun.position);
});

test('run never injects forward movement and releasing the direction returns to idle', () => {
  const input = createMovementInput();
  const start = { x: 0, z: 2 };
  assert.deepEqual(stepLocomotion(start, input.pressed, 1/60, true).position, start);
  input.press('pointer:1', 'ArrowDown');
  const backwards = stepLocomotion(start, input.pressed, 1/60, true);
  assert.ok(backwards.position.z > start.z);
  input.release('pointer:1');
  const stopped = stepLocomotion(backwards.position, input.pressed, 1/60, true);
  assert.equal(stopped.motion, 'idle');
  assert.equal(stopped.speed, 0);
});

test('running is camera-relative, diagonal-normalized, frame-rate-consistent and collision-safe', () => {
  const start = { x: 0, z: 2 };
  const side = stepLocomotion(start, new Set(['w']), 0.05, true, { x: 1, z: 0 });
  assert.ok(side.position.x > 0);
  const diagonal = stepLocomotion(start, new Set(['w','d']), 0.05, true);
  assert.ok(Math.abs(diagonal.speed - HUMAN_RUN_SPEED) < 1e-10);
  const destinations = [30,60,120].map(fps => {
    let position = { ...start };
    for (let i=0; i<fps; i++) position = stepLocomotion(position, new Set(['w']), 1/fps, true).position;
    return position;
  });
  for (const position of destinations) assert.ok(Math.abs(position.z + 2) < 1e-8);
  const wall = stepLocomotion({x:0,z:-6.37}, new Set(['w']), .05, true);
  assert.equal(wall.motion, 'idle');
});
