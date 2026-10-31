import { DEFAULT_LOOK, modelFor, withBody } from '../appearance.mjs';

/**
 * Select the correct rig for a remote peer without trusting arbitrary model
 * paths from the network. Older peers with no body field remain compatible.
 * The local wardrobe is not yet replicated; use body-appropriate defaults.
 */
export function remoteAvatarPresentation(pose) {
  const body = pose?.body === 'female' ? 'female' : 'male';
  const look = withBody(DEFAULT_LOOK, body);
  return { model: modelFor(look), look };
}
