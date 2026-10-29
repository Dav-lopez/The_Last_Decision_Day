import { Color3, DynamicTexture, MeshBuilder, Scene, StandardMaterial } from '@babylonjs/core';

/** Original, deterministic landscape dressing. No external assets, randomness or network calls. */
export function addLandscapeDesign(scene: Scene): void {
  const material = (name: string, hex: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.06, 0.06, 0.06);
    return m;
  };
  const soil = material('landscape mulched beds', '#6e5140');
  const grass = material('landscape varied lawn', '#648f54');
  const grassLight = material('landscape meadow', '#7da16a');
  const shrubs = [material('landscape shrub dark', '#315f39'), material('landscape shrub mid', '#4b7b42'), material('landscape shrub bright', '#648e4b')];
  const bark = material('landscape tree bark', '#5b4838');
  const flowers = [material('landscape flowers cream', '#eee1b2'), material('landscape flowers lavender', '#9c86bc'), material('landscape flowers coral', '#d78877')];
  const pavement = material('landscape curb concrete', '#b5b4a8');
  const garden = (name: string, x: number, z: number, radius: number, mat: StandardMaterial) => {
    const mesh = MeshBuilder.CreateCylinder(name, { height: 0.035, diameter: radius * 2, tessellation: 12 }, scene);
    mesh.position.set(x, 0.045, z);
    mesh.material = mat;
  };
  // Sidewalks and curbs: keep the drivable road center and the school entrance clear.
  for (const x of [-2.35, 2.35]) {
    const path = MeshBuilder.CreateBox('residential sidewalk', { width: 0.65, height: 0.07, depth: 23.4 }, scene);
    path.position.set(x, 0.06, 0);
    path.material = pavement;
  }
  // Planter beds and layered shrubs soften the block geometry without blocking the street.
  for (const [x, z] of [[-5.1, 2.3], [5.1, 2.3], [-5.1, 6.6], [5.1, 6.6], [-5.25, -4.8], [5.25, -4.8]] as const) {
    garden('mulch planter bed', x, z, 0.92, soil);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      const px = x + Math.cos(angle) * 0.48;
      const pz = z + Math.sin(angle) * 0.48;
      const bush = MeshBuilder.CreateSphere('layered shrub', { diameter: 0.62 + (i % 2) * 0.16, segments: 6 }, scene);
      bush.position.set(px, 0.37, pz);
      bush.material = shrubs[i % shrubs.length];
    }
    for (let i = 0; i < 3; i++) {
      const flower = MeshBuilder.CreateSphere('flower cluster', { diameter: 0.15, segments: 5 }, scene);
      flower.position.set(x + (i - 1) * 0.35, 0.3, z - 0.65);
      flower.material = flowers[i];
    }
  }
  // Clusters of different-size tree crowns create more organic silhouettes than single spheres.
  for (const [x, z, scale] of [[-9.6, 0.3, 0.9], [9.6, 0.3, 1.1], [-9.6, 6, 1], [9.6, 6, 0.9]] as const) {
    garden('tree base', x, z, 0.72, soil);
    const trunk = MeshBuilder.CreateCylinder('landscape mature tree trunk', { height: 2.3 * scale, diameterBottom: 0.38 * scale, diameterTop: 0.22 * scale, tessellation: 7 }, scene);
    trunk.position.set(x, 1.15 * scale, z);
    trunk.material = bark;
    for (const [dx, dy, dz, size, shade] of [[0, 3.1, 0, 1.9, 0], [-0.72, 2.8, 0.2, 1.5, 1], [0.64, 2.8, -0.2, 1.6, 2], [0, 3.6, 0.4, 1.4, 1]] as const) {
      const crown = MeshBuilder.CreateSphere('layered tree canopy', { diameter: size * scale, segments: 7 }, scene);
      crown.position.set(x + dx * scale, dy * scale, z + dz * scale);
      crown.material = shrubs[shade];
    }
  }
  // Softly varied ground patches break up the single flat grass plane.
  for (const [x, z, radius, bright] of [[-5.4, 9, 1.4, true], [5.4, 9, 1.1, false], [-5.8, -9, 1.0, false], [5.8, -9, 1.3, true]] as const) {
    garden('lawn color variation', x, z, radius, bright ? grassLight : grass);
  }
}
