/**
 * The one door to Babylon.js. Importing from the package's root pulls in the whole engine (about 1.6 MB gzipped);
 * importing each class from its own module lets the bundler leave out everything the game never uses.
 * Game code imports from this file only (babylon-imports.test.mjs checks that).
 *
 * A class that is only reached through another one (instances, collisions, picking, shadows…) is wired in by
 * a side-effect import below. If the playtest reports "X needs to be imported before…", add that module here.
 */
import '@babylonjs/core/Animations/animatable';
import '@babylonjs/core/Collisions/collisionCoordinator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Loading/loadingScreen';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/core/Particles/particleSystemComponent';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';

export { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
export { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
export { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
export type { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
export { Ray } from '@babylonjs/core/Culling/ray';
export { Constants } from '@babylonjs/core/Engines/constants';
export { Engine } from '@babylonjs/core/Engines/engine';
export { ClusteredLightContainer } from '@babylonjs/core/Lights/Clustered/clusteredLightContainer';
export { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
export { PointLight } from '@babylonjs/core/Lights/pointLight';
export { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
export { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
export { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
export { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
export type { Material } from '@babylonjs/core/Materials/material';
export { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
export { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
export type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture';
export { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
export { Texture } from '@babylonjs/core/Materials/Textures/texture';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
export { Plane } from '@babylonjs/core/Maths/math.plane';
export { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
export type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
export { Mesh } from '@babylonjs/core/Meshes/mesh';
export { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
export { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
export { TransformNode } from '@babylonjs/core/Meshes/transformNode';
export { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
export { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
export { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
export type { AssetContainer } from '@babylonjs/core/assetContainer';
export type { Node } from '@babylonjs/core/node';
export { Scene } from '@babylonjs/core/scene';
