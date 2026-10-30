import { Color3, PBRMaterial, StandardMaterial, type AbstractMesh, type Material, type Scene } from '@babylonjs/core';
import { roleForMaterial, type HouseStyle } from './photoPalette.mjs';

/** The player's house (the left one) on Maple Street, and the walls inside it. */
const OWN_HOUSE = { minX: -10.9, maxX: -5.9, minZ: -7.9, maxZ: -2.2 };
const insideOwnHouse = (mesh: AbstractMesh) => {
  mesh.computeWorldMatrix(true);
  const c = mesh.getBoundingInfo().boundingBox.centerWorld;
  return c.x > OWN_HOUSE.minX && c.x < OWN_HOUSE.maxX && c.z > OWN_HOUSE.minZ && c.z < OWN_HOUSE.maxZ && c.y > 0.05;
};
const INTERIOR = /^home (front|back|left|right) wall plaster$/;

const colourOf = (material: Material): Color3 | null =>
  material instanceof PBRMaterial ? material.albedoColor : material instanceof StandardMaterial ? material.diffuseColor : null;

/**
 * Repaints the player's own house: its materials are cloned on first paint so
 * the neighbours' identical house keeps its colours. Re-run safely whenever
 * new meshes arrive (the authored house model loads after the procedural one).
 */
export function createHousePainter(scene: Scene) {
  const originals = new Map<Material, Color3>();
  const owned = new Map<Material, Material>();
  let style: HouseStyle | null = null;

  const paintMaterial = (material: Material, hex: string | null) => {
    const colour = colourOf(material);
    if (!colour) return;
    if (!originals.has(material)) originals.set(material, colour.clone());
    if (hex) colour.copyFrom(Color3.FromHexString(hex));
    else colour.copyFrom(originals.get(material)!);
  };

  const apply = () => {
    for (const mesh of scene.meshes) {
      const material = mesh.material;
      if (!material) continue;
      if (INTERIOR.test(material.name)) { paintMaterial(material, style?.interior ?? null); continue; }
      const role = roleForMaterial(material.name);
      if (!role || !insideOwnHouse(mesh)) continue;
      let mine = owned.get(material) ?? ([...owned.values()].includes(material) ? material : null);
      if (!mine) {
        if (!style) continue; // never painted: nothing to restore
        mine = material.clone(`${material.name} (your house)`) ?? material;
        owned.set(material, mine);
      }
      mesh.material = mine;
      paintMaterial(mine, style?.[role] ?? null);
    }
  };

  let pending = 0;
  const observer = scene.onNewMeshAddedObservable.add(() => {
    if (!style || pending) return;
    pending = window.setTimeout(() => { pending = 0; apply(); }, 300);
  });

  return {
    paint(next: HouseStyle | null) { style = next; apply(); },
    dispose() {
      window.clearTimeout(pending);
      scene.onNewMeshAddedObservable.remove(observer);
    },
  };
}
export type HousePainter = ReturnType<typeof createHousePainter>;
