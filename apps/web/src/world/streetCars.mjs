import { Color3, MeshBuilder, StandardMaterial, TransformNode } from '@babylonjs/core';
import { PARKED_CARS } from './streetLayout.mjs';

/** Visible, collision-sized fallback remains if a sedan download fails. */
export function addParkedCarFallbacks(scene) {
  const paint = new StandardMaterial('fallback sedan blue', scene);
  paint.diffuseColor = Color3.FromHexString('#345e78');
  const glass = new StandardMaterial('fallback sedan glass', scene);
  glass.diffuseColor = Color3.FromHexString('#263a45');
  const tire = new StandardMaterial('fallback sedan tires', scene);
  tire.diffuseColor = Color3.FromHexString('#272c31');
  for (const car of PARKED_CARS) {
    const root = new TransformNode('parked car fallback', scene);
    root.position.set(car.x, 0, car.z); root.rotation.y = car.rotation;
    const body = MeshBuilder.CreateBox('parked car fallback body', {width:1.42,height:.5,depth:3.6}, scene);
    body.parent=root; body.position.y=.55; body.material=paint; body.checkCollisions=true;
    const cabin=MeshBuilder.CreateBox('parked car fallback cabin', {width:1.18,height:.52,depth:1.65}, scene);
    cabin.parent=root; cabin.position.set(0,1.03,-.3); cabin.material=glass; cabin.checkCollisions=true;
    for(const x of [-.69,.69]) for(const z of [-1.12,1.12]) {
      const wheel=MeshBuilder.CreateCylinder('parked car fallback wheel', {diameter:.6,height:.12,tessellation:12},scene);
      wheel.parent=root; wheel.rotation.z=Math.PI/2; wheel.position.set(x,.3,z); wheel.material=tire;
    }
  }
}
