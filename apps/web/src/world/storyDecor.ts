import { Color3, DynamicTexture, MeshBuilder, StandardMaterial, type Mesh, type Scene } from '../babylon';
import { STREET_HALF_WIDTH } from './suburbLayout.mjs';

export type Decision = 'garden' | 'crossing' | 'football';

const paint = (scene: Scene, name: string, hex: string) => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = new Color3(0.05, 0.05, 0.05);
  return material;
};

function signPlane(scene: Scene, name: string, text: string, width: number, height: number, background: string, ink: string) {
  const px = Math.round(128 * width / height);
  const texture = new DynamicTexture(name, { width: px, height: 128 }, scene, true);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, px, 128);
  texture.drawText(text, null, 84, `bold ${Math.min(64, Math.floor(px / Math.max(4, text.length) * 1.6))}px sans-serif`, ink, null, true, false);
  texture.update();
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = new Color3(0.3, 0.3, 0.3);
  material.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane(name, { width, height }, scene);
  plane.material = material;
  return { plane, material, texture };
}

/**
 * What your Last Decision Day choice changes on Maple Street. Decorative and
 * placed clear of the road, sidewalks, driveways and walking routes, so it
 * never changes collisions.
 */
export function buildDecisionDecor(scene: Scene, decision: Decision, phase: 'made' | 'notice' | 'saved' = 'made') {
  const meshes: Mesh[] = [];
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends Mesh>(mesh: T) => { mesh.isPickable = false; meshes.push(mesh); return mesh; };

  if (decision === 'garden') {
    const soil = paint(scene, 'garden soil', '#5a3d2b');
    const timber = paint(scene, 'garden timber', '#8a6a46');
    const petals = ['#e85d75', '#f2c14e', '#9b6fd6', '#ffffff'].map((hex, i) => paint(scene, `garden petals ${i}`, hex));
    const leaf = paint(scene, 'garden leaves', '#3f7d3a');
    disposables.push(soil, timber, leaf, ...petals);
    // Raised beds in both front yards, between the driveway car and the tree.
    for (const side of [-1, 1]) {
      for (const [x, z] of [[9.6, 1.8], [6.4, 2.0]]) {
        const bx = side * x;
        const frame = keep(MeshBuilder.CreateBox('garden bed frame', { width: 1.5, height: 0.28, depth: 0.62 }, scene));
        frame.position.set(bx, 0.14, z);
        frame.material = timber;
        const bed = keep(MeshBuilder.CreateBox('garden bed soil', { width: 1.38, height: 0.05, depth: 0.5 }, scene));
        bed.position.set(bx, 0.29, z);
        bed.material = soil;
        for (let i = 0; i < 6; i++) {
          const stem = keep(MeshBuilder.CreateCylinder('garden stem', { height: 0.22, diameter: 0.025 }, scene));
          const fx = bx - 0.55 + i * 0.22, fz = z + (i % 2 ? 0.12 : -0.12);
          stem.position.set(fx, 0.42, fz);
          stem.material = leaf;
          const flower = keep(MeshBuilder.CreateSphere('garden flower', { diameter: 0.11, segments: 6 }, scene));
          flower.position.set(fx, 0.55, fz);
          flower.material = petals[(i + (side > 0 ? 1 : 0)) % petals.length];
        }
      }
    }
  } else if (decision === 'crossing') {
    const white = paint(scene, 'crossing paint', '#f3f3ee');
    disposables.push(white);
    // Zebra stripes where the crosser crosses (z 5.5), running with the traffic.
    const stripes = 7;
    for (let i = 0; i < stripes; i++) {
      const stripe = keep(MeshBuilder.CreateGround('crossing stripe', { width: 0.32, height: 2.2 }, scene));
      stripe.position.set(-STREET_HALF_WIDTH + 0.3 + i * ((STREET_HALF_WIDTH * 2 - 0.6) / (stripes - 1)), 0.022, 5.5);
      stripe.material = white;
    }
    // Slow-zone signs on the lawns at both ends of the street.
    for (const [x, z] of [[3.1, 9.2], [-3.1, -1.9]]) {
      const post = keep(MeshBuilder.CreateCylinder('slow sign post', { height: 2.1, diameter: 0.06 }, scene));
      post.position.set(x, 1.05, z);
      const sign = signPlane(scene, 'slow zone sign', 'SLOW · 15', 0.9, 0.42, '#ffffff', '#c62828');
      sign.plane.position.set(x, 2.0, z);
      sign.plane.rotation.y = x > 0 ? 0 : Math.PI;
      keep(sign.plane);
      disposables.push(sign.material, sign.texture);
    }
  } else {
    const pole = paint(scene, 'club banner pole', '#2b2f36');
    disposables.push(pole);
    // A club banner across the road, clear of the bus shelter by the gate.
    for (const x of [-3.15, 3.15]) {
      const post = keep(MeshBuilder.CreateCylinder('club banner post', { height: 4, diameter: 0.09 }, scene));
      post.position.set(x, 2, 7);
      post.material = pole;
    }
    const banner = signPlane(scene, 'club banner', 'MAPLE STREET FC · TRAINING SATURDAYS', 6.1, 0.75, '#1f5fbf', '#ffffff');
    banner.plane.position.set(0, 3.55, 7);
    banner.plane.rotation.y = Math.PI;
    keep(banner.plane);
    disposables.push(banner.material, banner.texture);
  }
  // Book two: the Fire Safety notice is staked on the lawn until the hearing; afterwards the permit hangs there
  // instead, and the street puts its bunting back up.
  if (phase !== 'made') {
    const saved = phase === 'saved';
    const stake = keep(MeshBuilder.CreateCylinder('street notice post', { height: 1.7, diameter: 0.06 }, scene));
    stake.position.set(-3.1, 0.85, 0.8);
    const board = saved
      ? signPlane(scene, 'street permit', 'PERMIT GRANTED', 2, 0.5, '#1f7a3d', '#ffffff')
      : signPlane(scene, 'street notice', 'NOTICE', 1.2, 0.5, '#ffffff', '#c62828');
    // Faces up the street, towards your house, like the club banner.
    board.plane.position.set(-3.1, 1.6, 0.8);
    board.plane.rotation.y = Math.PI;
    keep(board.plane);
    disposables.push(board.material, board.texture);
    if (saved) {
      const flags = ['#e85d75', '#f2c14e', '#4f9bd9', '#6fbf73'].map((hex, i) => paint(scene, `bunting ${i}`, hex));
      disposables.push(...flags);
      for (let i = 0; i < 13; i++) {
        const flag = keep(MeshBuilder.CreatePlane('bunting flag', { size: 0.3 }, scene));
        // A shallow sag between the two sides of the street, well above the cars and the bus.
        flag.position.set(-3 + i * 0.5, 4.3 - Math.sin((i / 12) * Math.PI) * 0.35, 2.4);
        flag.rotation.z = Math.PI / 4;
        flag.material = flags[i % flags.length];
        flags[i % flags.length].backFaceCulling = false;
        flags[i % flags.length].emissiveColor = flags[i % flags.length].diffuseColor.scale(0.5);
      }
    }
  }
  return { dispose: () => { for (const mesh of meshes) mesh.dispose(); for (const item of disposables) item.dispose(); } };
}
