/** Clone descendants, validate visible geometry, and keep fallback geometry until all sites succeed. */
export function cloneEnvironmentAtSites(template, sites) {
  const instances = [];
  try {
    for (const [x, z, scale = 1, rotation = 0] of sites) {
      // The third argument is doNotCloneChildren. `true` produced empty, invisible replacements.
      const clone = template.clone(`${template.name} at ${x},${z}`, null, false);
      if (!clone) throw new Error('Environment clone failed');
      instances.push(clone);
      if (!clone.getChildMeshes().some(mesh => mesh.getTotalVertices() > 0)) {
        throw new Error('Environment clone contains no renderable meshes');
      }
      clone.position.set(x, 0, z);
      clone.scaling.scaleInPlace(scale);
      clone.rotation.y = rotation;
      clone.setEnabled(true);
    }
    return instances;
  } catch (error) {
    for (const instance of instances) instance.dispose();
    throw error;
  }
}
