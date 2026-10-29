import { Color3, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';

/** Decorative details for the neighborhood preview; keep meshes lightweight for mobile browsers. */
export function addNeighborhoodDetails(scene: Scene) {
  const mat = (name: string, color: string, emissive = false) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    if (emissive) m.emissiveColor = Color3.FromHexString(color).scale(0.28);
    return m;
  };
  const glass = mat('window-glass', '#9bd0df', true);
  const trim = mat('window-trim', '#f3f0e6');
  const wood = mat('porch-wood', '#94705a');
  const flowers = [mat('flower-pink', '#e8759c'), mat('flower-yellow', '#f7c65c')];
  const bush = mat('hedge', '#357e54');
  const lampMetal = mat('lamp-metal', '#354153');
  const lampGlow = mat('lamp-glow', '#ffe2a0', true);
  const crosswalk = mat('crosswalk', '#f1f0e7');
  const houses: [number, number][] = [[-12,-18],[12,-17],[-12,-2],[12,1],[-12,15],[12,17]];
  houses.forEach(([x,z], i) => {
    const streetFacing = x < 0 ? 1 : -1;
    const frontX = x + streetFacing * 3.25;
    for (const dz of [-1.8, 1.8]) {
      for (const floorY of [1.55, 3.25]) {
        const frame = MeshBuilder.CreateBox('window-frame', {width: 0.19,height:1.22,depth:1.3}, scene);
        frame.position.set(frontX + streetFacing * 0.025, floorY, z + dz);
        frame.material = trim;
        const pane = MeshBuilder.CreateBox('window-pane', {width:0.21,height:0.98,depth:1.05},scene);
        pane.position.set(frontX + streetFacing * 0.05,floorY,z+dz);
        pane.material = glass;
      }
    }
    const porch = MeshBuilder.CreateBox('porch-step', {width:1.7,height:0.18,depth:2.1},scene);
    porch.position.set(frontX + streetFacing * 0.7,0.12,z);
    porch.material = wood;
    for (const dz of [-2.8,2.8]) {
      const hedge = MeshBuilder.CreateSphere('front-hedge', {diameter:1.25,segments:6},scene);
      hedge.scaling.y = 0.55;
      hedge.position.set(frontX + streetFacing * 1.2,0.48,z+dz);
      hedge.material = bush;
    }
    const planter = MeshBuilder.CreateCylinder('flower-planter',{diameter:0.55,height:0.42,tessellation:8},scene);
    planter.position.set(frontX + streetFacing * 0.75,0.27,z + (i%2 ? 1.35 : -1.35));
    planter.material = wood;
    for (let j=0;j<3;j++) {
      const bloom = MeshBuilder.CreateSphere('flower', {diameter:0.23,segments:6},scene);
      bloom.position.set(planter.position.x,0.59,planter.position.z+(j-1)*0.16);
      bloom.material = flowers[(i+j)%2];
    }
  });
  for (const z of [-11,10]) {
    for (let n=-3;n<=3;n++) {
      const stripe = MeshBuilder.CreateGround('pedestrian-crossing',{width:0.6,height:1.4},scene);
      stripe.position.set(n*1.05,0.075,z);
      stripe.material = crosswalk;
    }
  }
  for (const x of [-6.7,6.7]) for (const z of [-22,0,22]) {
    const post = MeshBuilder.CreateCylinder('street-lamp-post',{diameter:0.13,height:5.4,tessellation:8},scene);
    post.position.set(x,2.7,z); post.material = lampMetal;
    const head = MeshBuilder.CreateSphere('street-lamp-head',{diameter:0.64,segments:10},scene);
    head.position.set(x,5.5,z); head.material = lampGlow;
  }
  for (const x of [-19,19]) for (let z=-24;z<26;z+=10) {
    for (let j=0;j<4;j++) {
      const cluster = MeshBuilder.CreateSphere('tree-leaf-cluster',{diameter:2.2,segments:7},scene);
      cluster.position = new Vector3(x + Math.sin(j*1.7)*1.2,4.3+Math.cos(j*2.1)*0.65,z+Math.cos(j*1.7)*1.1);
      cluster.material = bush;
    }
  }
}
