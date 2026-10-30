import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode } from '@babylonjs/core';
import { loadRiggedAvatar, type RiggedAvatar } from '../riggedAvatar';
import { smoothHumanHeading } from '../humanMotion.mjs';
import { EMOTE_LABELS, type RoomState } from './roomClient.mjs';

/** Remote bodies are presentation only: never obstacles or sources of rewards. */
export function createRemotePlayers(scene: Scene, shadows: ShadowGenerator) {
  let active: { id: string; root: TransformNode; body: Mesh; label: Mesh; texture: DynamicTexture; labelMaterial: StandardMaterial; bodyMaterial: StandardMaterial; rig: RiggedAvatar | null; caption: string; placed: boolean; bubble: Mesh; bubbleTexture: DynamicTexture; bubbleMaterial: StandardMaterial; bubbleText: string; bubbleUntil: number; lastMessage: string; lastEmoteAt: number } | null = null;
  let clock = 0;
  let disposed = false;
  function clear() {
    if (!active) return;
    for (const mesh of active.root.getChildMeshes()) shadows.removeShadowCaster(mesh);
    active.rig?.dispose(); active.root.dispose(); active.texture.dispose(); active.labelMaterial.dispose(); active.bodyMaterial.dispose(); active.bubbleTexture.dispose(); active.bubbleMaterial.dispose(); active = null;
  }
  return {
    update(room: RoomState | undefined, location: string, delta: number) {
      const peer = room?.status === 'connected' ? room.players.find(player => player.characterId !== room.selfId) : undefined;
      if (!peer) { clear(); return; }
      if (active?.id !== peer.characterId) {
        clear();
        const root = new TransformNode('online friend', scene);
        const body = MeshBuilder.CreateCapsule('online friend fallback', { height: 1.7, radius: .25 }, scene); body.parent = root; body.position.y = .85; body.isPickable = false;
        const bodyMaterial = new StandardMaterial('friend fallback material', scene); bodyMaterial.diffuseColor = Color3.FromHexString('#6cdad1'); body.material = bodyMaterial;
        const texture = new DynamicTexture('friend name', { width: 512, height: 96 }, scene, false); texture.hasAlpha = true;
        const labelMaterial = new StandardMaterial('friend name material', scene); labelMaterial.diffuseTexture = texture; labelMaterial.emissiveColor = Color3.White(); labelMaterial.disableLighting = true; labelMaterial.backFaceCulling = false;
        const label = MeshBuilder.CreatePlane('friend nameplate', { width: 3.4, height: .64 }, scene); label.parent = root; label.position.y = 2.25; label.billboardMode = Mesh.BILLBOARDMODE_ALL; label.material = labelMaterial; label.isPickable = false;
        // A speech bubble for chat lines and emotes, above the name.
        const bubbleTexture = new DynamicTexture('friend speech', { width: 768, height: 160 }, scene, false); bubbleTexture.hasAlpha = true;
        const bubbleMaterial = new StandardMaterial('friend speech material', scene); bubbleMaterial.diffuseTexture = bubbleTexture; bubbleMaterial.emissiveColor = Color3.White(); bubbleMaterial.disableLighting = true; bubbleMaterial.backFaceCulling = false; bubbleMaterial.useAlphaFromDiffuseTexture = true;
        const bubble = MeshBuilder.CreatePlane('friend speech bubble', { width: 3.6, height: .75 }, scene); bubble.parent = root; bubble.position.y = 2.95; bubble.billboardMode = Mesh.BILLBOARDMODE_ALL; bubble.material = bubbleMaterial; bubble.isPickable = false; bubble.setEnabled(false);
        const lastMessage = room!.messages.filter(m => m.senderId === peer.characterId).at(-1)?.id ?? '';
        const entry = { id: peer.characterId, root, body, label, texture, labelMaterial, bodyMaterial, rig: null as RiggedAvatar | null, caption: '', placed: false,
          bubble, bubbleTexture, bubbleMaterial, bubbleText: '', bubbleUntil: 0, lastMessage, lastEmoteAt: -Infinity };
        active = entry;
        void loadRiggedAvatar(scene, root).then(rig => {
          if (disposed || active !== entry || scene.isDisposed) { rig?.dispose(); return; }
          entry.rig = rig;
          if (rig) { body.setEnabled(false); for (const mesh of rig.root.getChildMeshes()) { mesh.isPickable = false; shadows.addShadowCaster(mesh); } }
        }).catch(() => { /* Visible fallback remains if the GLB cannot load. */ });
      }
      const entry = active!; const pose = peer.pose;
      clock += delta;
      // New chat line or emote from your friend: show it over their head for a few seconds.
      const said = room!.messages.filter(m => m.senderId === peer.characterId).at(-1);
      const emote = room!.emotes?.filter(e => e.characterId === peer.characterId).at(-1);
      let text = '';
      if (said && said.id !== entry.lastMessage) { entry.lastMessage = said.id; text = said.text.length > 60 ? said.text.slice(0, 59) + '…' : said.text; }
      if (emote && emote.at !== entry.lastEmoteAt) { entry.lastEmoteAt = emote.at; text = EMOTE_LABELS[emote.emote] ?? emote.emote; }
      if (text) {
        entry.bubbleText = text; entry.bubbleUntil = clock + 6;
        const ctx = entry.bubbleTexture.getContext() as unknown as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, 768, 160);
        entry.bubbleTexture.drawText(text, null, 96, 'bold 40px sans-serif', '#1b2433', 'rgba(255,255,255,0.92)', true);
      }
      entry.bubble.setEnabled(clock < entry.bubbleUntil);
      entry.root.setEnabled(Boolean(pose && pose.location === location));
      if (!pose || pose.location !== location) { entry.placed = false; return; }
      const snap = !entry.placed || Math.hypot(entry.root.position.x - pose.x, entry.root.position.z - pose.z) > 12;
      const blend = snap ? 1 : 1 - Math.exp(-12 * delta);
      entry.root.position.x += (pose.x - entry.root.position.x) * blend;
      entry.root.position.z += (pose.z - entry.root.position.z) * blend;
      entry.root.rotation.y = snap ? pose.rotation : smoothHumanHeading(entry.root.rotation.y, pose.rotation, delta);
      entry.placed = true;
      const walking = pose.mode === 'walking';
      entry.rig?.root.setEnabled(walking); entry.body.setEnabled(walking && !entry.rig);
      entry.rig?.update(walking ? pose.speed : 0, delta);
      const caption = `${peer.name}${pose.mode === 'driving' ? ' · driving' : pose.mode === 'busy' ? ' · busy' : ''}`;
      if (caption !== entry.caption) { entry.caption = caption; entry.texture.drawText(caption, null, 64, 'bold 28px sans-serif', '#ffffff', '#102938cc', true); }
    },
    dispose() { disposed = true; clear(); },
  };
}
