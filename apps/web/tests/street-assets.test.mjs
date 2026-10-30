import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DirectionalLight, HemisphericLight, MeshBuilder, NullEngine, PBRMaterial, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { cloneEnvironmentAtSites } from '../src/world/environmentInstances.mjs';
import { stepPosition } from '../src/world/movement.mjs';
import { PARKED_CARS, CAR_HALF_WIDTH, CAR_HALF_LENGTH } from '../src/world/streetLayout.mjs';
import { createStreetLighting } from '../src/world/streetLighting.mjs';
import { addParkedCarFallbacks } from '../src/world/streetCars.mjs';

function readGlb(filename) {
  const bytes = readFileSync(new URL(`../public/models/environment/${filename}`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const document = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  assert.ok(document.buffers.every(buffer => !buffer.uri), 'no external buffers');
  assert.ok(document.images.every(image => image.bufferView !== undefined && !image.uri), 'textures embedded');
  assert.ok(document.accessors.filter(a=>a.type==='VEC3').every(a=>a.count>0));
  return { bytes, document };
}

test('the shipped GLBs have real geometry, embedded textures, upright metre-scale bounds and a small budget', () => {
  for (const [file,minHeight,maxHeight] of [['oak.glb',3,5.5],['house.glb',3.5,4.8],['sedan.glb',1,1.7]]) {
    const { bytes, document } = readGlb(file);
    assert.ok(bytes.length < 200_000);
    let bottom=Infinity,top=-Infinity,triangles=0;
    for (const primitive of document.meshes.flatMap(mesh=>mesh.primitives)) {
      const positions = document.accessors[primitive.attributes.POSITION];
      bottom = Math.min(bottom,positions.min[1]); top = Math.max(top,positions.max[1]);
      triangles += document.accessors[primitive.indices].count/3;
    }
    assert.ok(Math.abs(bottom) < 1e-6, `${file} rests on the ground`);
    assert.ok(top >= minHeight && top <= maxHeight, `${file} height ${top}`);
    assert.ok(triangles < 2500);
  }
  const oak = readGlb('oak.glb').document;
  assert.ok(oak.materials.some(m=>m.alphaMode==='MASK' && m.doubleSided && m.pbrMetallicRoughness.baseColorTexture));
});

test('environment replacement clones visible descendants and survives disposal of its template', t => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  const template = new TransformNode('asset',scene);
  const nested = new TransformNode('glTF root',scene); nested.parent=template;
  const geometry = MeshBuilder.CreateBox('real geometry',{size:1},scene); geometry.parent=nested;
  template.setEnabled(false);
  const clones=cloneEnvironmentAtSites(template,[[-8,3,1],[8,3,1.1]]);
  assert.equal(clones.length,2);
  template.dispose();
  for (const clone of clones) {
    assert.equal(clone.getChildMeshes().length,1);
    assert.ok(clone.getChildMeshes()[0].getTotalVertices()>0);
    assert.equal(clone.getChildMeshes()[0].isEnabled(),true);
  }
});

test('an empty replacement fails without removing fallback meshes', t => {
  const engine = new NullEngine(); const scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  const template=new TransformNode('empty imported root',scene);
  const fallback=MeshBuilder.CreateBox('home',{size:1},scene);
  assert.throws(()=>cloneEnvironmentAtSites(template,[[0,0]]),/no renderable meshes/);
  assert.equal(fallback.isEnabled(),true);
  assert.equal(scene.transformNodes.length,1,'failed clones disposed');
});

test('Babylon imports every shipped GLB and creates visible clones from the actual hierarchy', async t => {
  const engine=new NullEngine(); const scene=new Scene(engine);
  // This is a geometry/scene test. GPU shaders and texture appearance need a browser.
  const observer=SceneLoader.OnPluginActivatedObservable.add(plugin=>{if(plugin.name==='gltf') plugin.skipMaterials=true;});
  t.after(()=>{SceneLoader.OnPluginActivatedObservable.remove(observer);scene.dispose();engine.dispose();});
  for(const file of ['oak.glb','house.glb','sedan.glb']) {
    const raw=readGlb(file).bytes;
    const loaded=await SceneLoader.ImportMeshAsync('', '', new Uint8Array(raw), scene, undefined, '.glb');
    const template=new TransformNode(`${file} template`,scene);
    for(const mesh of loaded.meshes) if(!mesh.parent) mesh.parent=template;
    const bounds=template.getHierarchyBoundingVectors(true);
    assert.ok(bounds.max.y > 1 && Math.abs(bounds.min.y) < 1e-5);
    template.setEnabled(false);
    const clones=cloneEnvironmentAtSites(template,[[1,2,1],[-1,-2,.9,Math.PI]]);
    template.dispose();
    for(const clone of clones) {
      assert.ok(clone.getChildMeshes().filter(m=>m.getTotalVertices()>0).length>0);
      assert.ok(clone.getChildMeshes().every(m=>m.isEnabled()));
      clone.dispose();
    }
  }
});

test('evening enables real street lights, imported materials receive them, and daylight disables them', async t => {
  const engine=new NullEngine();const scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  const sun=new DirectionalLight('sun',new Vector3(0,-1,0),scene);
  const sky=new HemisphericLight('sky',Vector3.Up(),scene);
  const lighting=createStreetLighting(scene,sun,sky);
  const lamps=scene.lights.filter(light=>light.name.startsWith('street lamp'));
  assert.equal(lamps.length,3);
  assert.ok(lamps.every(light=>!light.isEnabled()));
  const imported=new PBRMaterial('asynchronously imported house',scene);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(imported.maxSimultaneousLights,5);
  lighting.setEvening(true);
  assert.ok(lamps.every(light=>light.isEnabled()&&light.range===6));
  assert.equal(sun.intensity,.42);
  lighting.setEvening(false);
  assert.ok(lamps.every(light=>!light.isEnabled()));
  lighting.dispose();
  assert.equal(scene.lights.length,2);
});

test('parked cars block sprinting pedestrians and leave the central school route open', () => {
  for (const car of PARKED_CARS) {
    // Driveway cars sit side-on to Z, so their Z extent is the car's width.
    const halfZ=Math.abs(Math.cos(car.rotation))>.5?CAR_HALF_LENGTH:CAR_HALF_WIDTH;
    let position={x:car.x,z:car.z+halfZ+1};
    for(let i=0;i<80;i++) position=stepPosition(position,new Set(['w']),.05,4);
    assert.ok(position.z >= car.z+halfZ+.38-1e-8);
    const doc=readGlb('sedan.glb').document;
    for(const primitive of doc.meshes.flatMap(m=>m.primitives)) {
      const bounds=doc.accessors[primitive.attributes.POSITION];
      assert.ok(Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0]))<=CAR_HALF_WIDTH+1e-7);
      assert.ok(Math.max(Math.abs(bounds.min[2]),Math.abs(bounds.max[2]))<=CAR_HALF_LENGTH+1e-7);
    }
  }
  let position={x:0,z:3.8};
  for(let i=0;i<60;i++) position=stepPosition(position,new Set(['w']),.05,4);
  assert.ok(position.z < -5.5,'cars do not block the school approach');
});

test('parked cars have a visible fallback before any network asset can load', t => {
  const engine=new NullEngine();const scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  addParkedCarFallbacks(scene);
  const bodies=scene.meshes.filter(mesh=>mesh.name==='parked car fallback body');
  assert.equal(bodies.length,PARKED_CARS.length);
  for(let i=0;i<bodies.length;i++) {
    bodies[i].computeWorldMatrix(true);
    const position=bodies[i].getAbsolutePosition();
    assert.ok(Math.abs(position.x-PARKED_CARS[i].x)<1e-6);
    assert.ok(Math.abs(position.z-PARKED_CARS[i].z)<1e-6);
    assert.ok(bodies[i].isEnabled()&&bodies[i].getTotalVertices()>0&&bodies[i].checkCollisions);
  }
});
