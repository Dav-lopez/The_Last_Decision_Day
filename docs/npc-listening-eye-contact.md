# NPC listening eye contact

The resident face rig now adds brief, low-amplitude eye fixations **only** while
a neutral, stationary NPC silently attends to a nearby player. This uses the
existing eyeLookLeft/Right/Down morphs on cloned human bodies, rather than
introducing a new mesh, animation group, shader, or runtime dependency.

- A forward cone and smooth distance falloffs prevent eye movement toward
  players behind the resident or sudden snaps at the interaction boundary.
- Per-resident face clocks desynchronize fixations. A small horizontal glance
  left or right and an occasional downward glance return to a neutral fixation.
- Eye offsets are combined with gaze and per-eye convergence **before** choosing
  one horizontal direction, avoiding simultaneous opposing eye morphs.
- Speech, locomotion, distress, anger, and startle suppress listening fixations;
  the existing facial spring and blink mask own transitions and eyelid closure.
- No audio phoneme sync is implied. This is procedural attention, not new GLB
  facial geometry.

## Verification

Run `cd apps/web && node --test tests/npc-listening-gaze.test.mjs` and
`npm run test:character`; then `npm run typecheck` and `npm run build`.
Inspect both body variants in a browser. Stand directly ahead of a neutral
resident at ~1–2 m, wait for a few fixation cycles, then walk behind, start
a conversation, trigger an emotional reply, and check blink behavior. Verify
that unrelated residents remain independent and the player avatar is unchanged.

The unit tests validate deterministic targets and morph composition; they do
not establish that the visual effect looks natural on a rendered device.
