# Playable NPC conversations (offline-first)

This feature implements real game interactions, not a prompt showcase or an external prompt-library dependency.

## Play

1. Enter the 3D game and walk to the two students standing together on the school lawn during school hours (7:30 a.m. to 4 p.m.).
2. Within approximately 1.8 m, press **E** or tap **Talk to Maya/Jordan**. Select a numbered response (1–3) or tap a response on mobile.
3. Read the character's response and the relationship change, then select **Continue story**.
4. Enter the school, walk to Ms. Rivera, open the school panel with **E**, and select **Have a conversation with Ms. Rivera**.
5. After completing Chapter 1, Chapter 2's note mystery advances through actual conversations with Maya, Jordan, and Ms. Rivera.

## Rules and persistence

- Choices change bounded trust scores (-5 to +5), independent for each NPC.
- Counts and prior choices are stored **per character** in browser localStorage, with validation for corrupt or tampered saved data.
- The game uses deterministic, original persona-based dialogue templates; an online LLM and API key are **not required**.
- Facial animation follows the active speaker and reacts with happy/sad morph targets when compatible 3D models are available.
- Dialogue pauses movement and the life clock. **Escape** cancels without progress if no choice was made.
- Progression events only fire after a dialogue choice, never from simply walking near an NPC.
- This is an offline slice: trust scores are **not yet synchronized between devices or protected on the server**. They do not award server-backed grades or currency.

## Manual acceptance

- Desktop: interact with Maya, choose a positive response, reopen and verify different greeting; select rude responses until trust reaches -5.
- Mobile: confirm Talk button, tap-to-select, scrolling and responsive overlays.
- School: Ms. Rivera conversation coexists with existing school activities.
- Story: Chapter 2 advances only after Maya, then Jordan, then Ms. Rivera interactions.
- Edge cases: cancelling before a choice, restarting the app, missing 3D models, switching browser/character, 4 p.m. departure, and player driving.
- CI: `npm run test:environment`, `npm run test:human`, `npm run build` from `apps/web`.

## Next integration

Optional provider-backed AI dialogue can be added behind a server endpoint with credentials stored only on the API host. Never let a language model apply game-currency, grade, quest or security changes directly. Use a curated prompt registry and validate all model outputs. PromptHero and YouMind are reference sources for art direction, not runtime dependencies.
