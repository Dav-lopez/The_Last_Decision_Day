import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode } from '@babylonjs/core';
import { loadRiggedAvatar, type RiggedAvatar } from '../riggedAvatar';
import { visibleRemotePose, stepRemotePose } from './remotePosePresentation.mjs';
import { initialRemoteFacialReaction, remoteMessageReaction, remoteEmoteReaction, remoteFacialPose, type RemoteFacialReaction } from './remoteFacialReactions.mjs';
import { EMOTE_LABELS, type RoomState } from './roomClient.mjs';

/** Remote bodies are presentation only: never obstacles or sources of rewards. */
export function createRemotePlayers(scene: Scene, shadows: ShadowGenerator) {
  let active: { id: string; root: TransformNode; body: Mesh; label: Mesh; texture: DynamicTexture; labelMaterial: StandardMaterial; bodyMaterial: StandardMaterial; rig: RiggedAvatar | null; caption: string; placed: boolean; bubble: Mesh; bubbleTexture: DynamicTexture; bubbleMaterial: StandardMaterial; bubbleText: string; bubbleUntil: number; lastMessage: string; lastEmoteAt: number; reaction: RemoteFacialReaction } | null = null;
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
          bubble, bubbleTexture, bubbleMaterial, bubbleText: '', bubbleUntil: 0, lastMessage, lastEmoteAt: -Infinity, reaction: initialRemoteFacialReaction() };
        active = entry;
        void loadRiggedAvatar(scene, root).then(rig => {
          if (disposed || active !== entry || scene.isDisposed) { rig?.dispose(); return; }
          entry.rig = rig;
          if (rig) { body.setEnabled(false); for (const mesh of rig.root.getChildMeshes()) { mesh.isPickable = false; shadows.addShadowCaster(mesh); } }
        }).catch(() => { /* Visible fallback remains if the GLB cannot load. */ });
      }
      const entry = active!; const pose = peer.pose;
      // Advance reaction expiry across background-tab resumes, but clamp the
      // animation step so a delayed frame cannot snap the body or face.
      const elapsed = Number.isFinite(delta) ? Math.min(60, Math.max(0, delta)) : 0;
      const dt = Math.min(0.1, elapsed);
      clock += elapsed;
      // New chat line or emote from your friend: show it over their head for a few seconds.
      const said = room!.messages.filter(m => m.senderId === peer.characterId).at(-1);
      const emote = room!.emotes?.filter(e => e.characterId === peer.characterId).at(-1);
      let text = '';
      if (said && said.id !== entry.lastMessage) {
        entry.lastMessage = said.id;
        text = said.text.length > 60 ? said.text.slice(0, 59) + '…' : said.text;
        entry.reaction = remoteMessageReaction(entry.reaction, said.text, clock);
      }
      if (emote && emote.at !== entry.lastEmoteAt) {
        entry.lastEmoteAt = emote.at;
        text = EMOTE_LABELS[emote.emote] ?? emote.emote;
        entry.reaction = remoteEmoteReaction(entry.reaction, emote.emote, clock);
      }
      if (text) {
        entry.bubbleText = text; entry.bubbleUntil = clock + 6;
        const ctx = entry.bubbleTexture.getContext() as unknown as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, 768, 160);
        entry.bubbleTexture.drawText(text, null, 96, 'bold 40px sans-serif', '#1b2433', 'rgba(255,255,255,0.92)', true);
      }
      entry.bubble.setEnabled(clock < entry.bubbleUntil);
      // Keep busy peers visible with an idle body so chat/emotes still animate
      // their face. Drivers retain their nameplate, not an on-foot avatar.
      // Reject malformed network coordinates before they reach Babylon matrices.
      const target = visibleRemotePose(pose, location);
      entry.root.setEnabled(Boolean(target));
      if (!target) { entry.placed = false; return; }
      const next = stepRemotePose({
        x: entry.root.position.x, z: entry.root.position.z, rotation: entry.root.rotation.y,
      }, target, dt, entry.placed);
      entry.root.position.x = next.x;
      entry.root.position.z = next.z;
      entry.root.rotation.y = next.rotation;
      entry.placed = true;
      const face = remoteFacialPose(entry.reaction, clock, target.showBody);
      entry.rig?.setEmotion(face.emotion);
      entry.rig?.setSpeaking(face.speaking);
      entry.rig?.root.setEnabled(target.showBody);
      entry.body.setEnabled(target.showBody && !entry.rig);
      entry.rig?.update(target.speed, dt);
      const caption = `${peer.name}${target.mode === 'driving' ? ' · driving' : target.mode === 'busy' ? ' · busy' : ''}`;
      if (caption !== entry.caption) { entry.caption = caption; entry.texture.drawText(caption, null, 64, 'bold 28px sans-serif', '#ffffff', '#102938cc', true); }
    },
    dispose() { disposed = true; clear(); },
  };
}
