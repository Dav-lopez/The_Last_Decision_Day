import { useRef, useState, type ChangeEvent, type MutableRefObject } from 'react';
import { SceneLoader, TransformNode, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/SPLAT';
import { SCAN_SPOT, fitScan, scanFormat } from './scanPlacement.mjs';

/**
 * "Bring your own 3D scan": a Gaussian splat (.spz, .ply, .splat, .sog from
 * phone apps such as Scaniverse, Polycam or Luma) or a glTF model (.glb from
 * Meshy, Tripo, Polycam…) appears on the lawn across from home. Read in the
 * browser; nothing is uploaded. Lasts for this visit.
 */
export function ScanImport({ sceneRef }: { sceneRef: MutableRefObject<Scene | null> }) {
  const input = useRef<HTMLInputElement>(null);
  const placed = useRef<{ root: TransformNode; meshes: AbstractMesh[] } | null>(null);
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);

  const remove = () => {
    if (!placed.current) return;
    for (const mesh of placed.current.meshes) mesh.dispose();
    placed.current.root.dispose();
    placed.current = null;
    setLoaded(null);
  };
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const scene = sceneRef.current;
    if (!file || !scene) return;
    const ext = scanFormat(file.name);
    if (!ext) { setStatus('Use a .spz, .ply, .splat, .sog, .glb or .gltf file.'); return; }
    if (file.size > 150 * 1024 * 1024) { setStatus('That scan is over 150 MB. Export a smaller one.'); return; }
    setStatus('Loading your scan…');
    try {
      const result = await SceneLoader.ImportMeshAsync('', '', file, scene, undefined, ext);
      remove();
      const root = new TransformNode('your scan', scene);
      for (const mesh of result.meshes) if (!mesh.parent) mesh.parent = root;
      for (const mesh of result.meshes) mesh.isPickable = false;
      const { min, max } = root.getHierarchyBoundingVectors(true);
      const fit = fitScan({ min, max });
      if (!fit) throw new Error('empty scan');
      root.scaling.setAll(fit.scale);
      root.position = new Vector3(fit.position.x, fit.position.y, fit.position.z);
      placed.current = { root, meshes: result.meshes };
      setLoaded(file.name);
      setStatus(`Placed on the lawn across from your house (${SCAN_SPOT.maxSize} m across). Turn it or flip it if it's sideways.`);
    } catch (error) {
      console.warn('Scan import failed', error);
      setStatus("Couldn't read that scan. Try exporting it again as .spz or .glb.");
    }
  };
  const turn = () => { if (placed.current) placed.current.root.rotation.y += Math.PI / 2; };
  const flip = () => {
    const scan = placed.current;
    if (!scan) return;
    scan.root.rotation.x = scan.root.rotation.x ? 0 : Math.PI;
    // Stand it back on the ground after flipping.
    scan.root.computeWorldMatrix(true);
    const { min } = scan.root.getHierarchyBoundingVectors(true);
    scan.root.position.y -= min.y;
  };

  return <div className="house-paint" aria-label="Bring your own 3D scan">
    <input ref={input} type="file" accept=".spz,.ply,.splat,.sog,.glb,.gltf" hidden onChange={onFile} />
    <button type="button" onClick={() => input.current?.click()}>🧊 Add your 3D scan (splat or .glb)</button>
    {loaded && <>
      <button type="button" onClick={turn}>Turn 90°</button>
      <button type="button" onClick={flip}>Flip upright</button>
      <button type="button" onClick={remove}>Remove</button>
    </>}
    {status && <small role="status" className="house-paint-status">{status}</small>}
  </div>;
}
