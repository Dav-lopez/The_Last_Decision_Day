import { Color3, DynamicTexture, MeshBuilder, StandardMaterial, type Scene } from '@babylonjs/core';

/** A bus stop: pole with a sign and a small bench, on the grass beside the sidewalk. */
export function buildBusStop(scene: Scene, x: number, z: number, facing = 0) {
  const pole = MeshBuilder.CreateCylinder('bus stop pole', { height: 2.6, diameter: 0.07, tessellation: 10 }, scene);
  pole.position.set(x, 1.3, z);
  const steel = new StandardMaterial('bus stop steel', scene);
  steel.diffuseColor = Color3.FromHexString('#5b646b');
  pole.material = steel;
  const signTexture = new DynamicTexture('bus stop sign', { width: 256, height: 160 }, scene, true);
  const c = signTexture.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = '#1e5aa8';
  c.fillRect(0, 0, 256, 160);
  c.fillStyle = '#ffffff';
  c.fillRect(8, 8, 240, 144);
  c.fillStyle = '#1e5aa8';
  c.fillRect(14, 14, 228, 132);
  signTexture.drawText('BUS', null, 82, 'bold 64px sans-serif', '#ffffff', null, true, false);
  signTexture.drawText('Downtown', null, 132, 'bold 34px sans-serif', '#ffd27a', null, true, false);
  signTexture.update();
  const signMaterial = new StandardMaterial('bus stop sign face', scene);
  signMaterial.diffuseTexture = signTexture;
  signMaterial.emissiveColor = new Color3(0.25, 0.25, 0.25);
  signMaterial.backFaceCulling = false;
  const sign = MeshBuilder.CreatePlane('bus stop sign', { width: 0.62, height: 0.39 }, scene);
  sign.material = signMaterial;
  sign.position.set(x, 2.35, z);
  sign.rotation.y = facing;
  const bench = MeshBuilder.CreateBox('bus stop bench', { width: 1.3, height: 0.06, depth: 0.38 }, scene);
  bench.position.set(x - Math.cos(facing) * 0.9, 0.48, z + Math.sin(facing) * 0.9);
  bench.rotation.y = facing;
  bench.material = steel;
  for (const mesh of [pole, sign, bench]) mesh.isPickable = false;
  return () => { for (const mesh of [pole, sign, bench]) mesh.dispose(); signTexture.dispose(); };
}
