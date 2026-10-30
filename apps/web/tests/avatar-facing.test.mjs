import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LoadAssetContainerAsync, Matrix, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { HUMAN_HEIGHT, movementHeading, normalizeRiggedVisual } from '../src/world/riggedPresentation.mjs';

const directions = [[0,-1],[0,1],[1,0],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]];

test('procedural player heading faces its displacement in every direction, including sideways turns', () => {
  for (const [dx,dz] of directions) {
    const actual=Vector3.TransformNormal(Vector3.Backward(),Matrix.RotationY(movementHeading(dx,dz))).normalize();
    const expected=new Vector3(dx,0,dz).normalize();
    assert.ok(Vector3.Dot(actual,expected)>.99999,`wrong facing for ${dx},${dz}`);
  }
  assert.equal(movementHeading(0,0),0);
  assert.equal(movementHeading(NaN,1),0);
  assert.equal(movementHeading(1,Infinity),0);
});

test('actual imported human faces movement and remains grounded after orientation normalization', async t => {
  const engine=new NullEngine();const scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  const bytes=readFileSync(new URL('../public/models/human.glb',import.meta.url));
  const container=await LoadAssetContainerAsync(new Uint8Array(bytes),scene,{
    pluginExtension:'.glb',pluginOptions:{gltf:{skipMaterials:true}},
  });
  t.after(()=>container.dispose());
  container.addAllToScene();
  const visual=new TransformNode('rigged visual',scene);
  for(const node of container.rootNodes) if(!node.parent) node.parent=visual;
  normalizeRiggedVisual(visual);
  const parent=new TransformNode('moving player',scene);
  visual.parent=parent;
  const importedRoot=container.meshes.find(mesh=>mesh.name==='__root__');
  assert.ok(importedRoot);
  const neutral=visual.getHierarchyBoundingVectors(true);
  assert.ok(Math.abs(neutral.min.y)<1e-5,'soles on the ground');
  assert.ok(Math.abs(neutral.max.y-neutral.min.y-HUMAN_HEIGHT)<1e-5,'adult height in metres');
  for(const [dx,dz] of directions) {
    parent.rotation.y=movementHeading(dx,dz);
    parent.computeWorldMatrix(true);visual.computeWorldMatrix(true);importedRoot.computeWorldMatrix(true);
    // The pinned glTF model is authored looking +Z. Check the real import
    // hierarchy, including Babylon's handedness conversion and moving parent.
    const actual=Vector3.TransformNormal(Vector3.Forward(),importedRoot.getWorldMatrix()).normalize();
    const expected=new Vector3(dx,0,dz).normalize();
    assert.ok(Vector3.Dot(actual,expected)>.99999,`imported human faces away from ${dx},${dz}`);
  }
});
