# MVP roadmap: The Last Decision Day

This file is the shared to-do list for getting the game to MVP. Automated work sessions read it, take the
first unchecked item, ship it as one pull request based on `main`, and tick it off in that same PR.

## What "MVP" means here

A new player can:

1. Open the site, start as a guest or with an account, and learn the controls inside the game.
2. Play the story (chapters 1–5) to one of its three endings in about one to two hours, with driving,
   careers, the training range, football and neighbour conversations as side activities.
3. Close the tab and come back to the same progress (synced to the account when signed in).
4. Play at a usable frame rate on a mid-range laptop and a recent phone.
5. Hit no runtime errors in the automated playtest, and see every third-party licence credited.

## Ground rules for every PR

- Branch from the latest `main`; one item (or one slice of a big item) per PR; never merge or deploy.
- CI must be green, including the **web-playtest** job (headless browser plays the guest demo).
- Add or update tests for any rule or logic change (`apps/web/tests/*.test.mjs`, registered in `package.json`).
- Assets: CC0 or properly credited only (Quaternius, Poly Haven, OpenStreetMap © contributors / ODbL).
- Weapons appear only as career training against bullseyes, steel plates or flame boards. Never at school,
  never aimed at people.
- Keep this file current: tick the item, add anything discovered along the way under **Found along the way**.

## Done

- [x] Maple Street, school, home interior, day/night clock, energy, eating and sleeping
- [x] Real downtown Boulder (OpenStreetMap), bus, taxi quick travel, drivable cars, map (N)
- [x] Character creator and wardrobe (male/female, hair, clothes, shoes, uniforms), photo house paint
- [x] Animation set (walk/run/jump/dance/actions), facial expressions, blinking, NPC faces
- [x] Neighbours with schedules, giving way to cars, eight conversable characters with relationships
- [x] Careers (police, soldier, firefighter): shifts, pay, ranks, training range qualifications
- [x] Football: free kick-about and a five-a-side match against the AI
- [x] Music, sound effects and ambience; two-player online rooms with chat, voice and emotes
- [x] Story chapters 1–5 with three endings that change Maple Street
- [x] Adaptive graphics quality, clustered night lights

## To do (in order)

- [x] **1. Automated playtest in CI**: headless Chromium loads the build, plays the guest demo (story scene,
      walking, map, quick travel downtown, pitch, home) and fails on page or console errors.
- [x] **2. Game shell**: an in-game menu (Esc / ☰) with Resume, Controls (every key and touch control),
      Settings (audio volumes, graphics quality), Story so far (chapter, objective, decision), Credits & licences,
      and Reset progress. A first-run hint showing the basic controls.
- [x] **3. Progress saved to the account**: story, career and training record, and neighbour relationships
      synced through the API for signed-in players (guests keep local saves); newest-wins merge; tests on both sides.
- [x] **4. Football extras**: better goalkeeping, smarter opponents (support runs, marking), a season league
      table that records your match results.
  - [x] 4a. Season league table: six local clubs, one round per match you play, other games simulated, saved per character.
  - [x] 4b. Better goalkeeping and smarter opponents: keepers narrow the angle, dive (with a dive animation),
        catch or parry wide, and rush out to smother; forwards make support runs, defenders mark goal-side and cover,
        passers avoid blocked lanes, shooters pick the far post. Save commentary for both keepers.
- [x] **5. Phone and touch pass**: every action reachable by touch (talk, map, range, match, car), layouts that
      fit 360-pixel-wide screens, and a phone-viewport run in the playtest.
  - [x] 5a. Phone playtest (360×640 touch screen, tap-only: story, touch-pad walking, map, downtown, pitch, match)
        that fails on sideways scrolling, overlapping overlays or core buttons under 40 px; phone HUD layout;
        Shoot and Chip buttons for football.
  - [x] 5b. Touch flow through talking to a neighbour, the training range and driving a car in the phone playtest;
        on-screen controls visible without scrolling on a phone (pad right under the view, help text below it,
        and the game scrolls the view to the top of the screen on phones).
- [ ] **6. Loading speed**: compressed models, downtown and range loaded on demand, a loading screen with
      progress, and a bundle-size check in CI.
  - [x] 6a. Loading screen with real progress (Maple Street, character, school, neighbours, props, cars; tips;
        "Start now" after 8 s; never holds you more than 45 s), downtown loading shown as a chip afterwards, and a
        gzipped bundle-size budget (`apps/web/bundle-budget.json`) checked in CI.
  - [x] 6b. Downtown and the training range loaded only when you first go there: the 3D city, street lamps, pitch,
        workplace signs and traffic are built behind the first ride's fade (the map, taxi and workplace pins work
        from the street data at once), and the range is its own download; the playtest checks both halves.
  - [ ] 6c. Compressed models (meshopt/Draco or texture-size cuts for the 1.6 MB human and plant GLBs).
    - [x] 6c-1 (partial slice). Action clips (talk, sit, drive, jump, dance…) slimmed from 711 KB to 255 KB per body
          (278 KB → 75 KB gzipped) by `scripts/slim_clips.py`: redundant keys dropped (≤0.02°, 0.1 mm), rotations
          stored as 16-bit, shared buffer views; Babylon import checked in CI. Still to do: the plant and human GLBs.
    - [x] 6c-2 (partial slice). Poly Haven props slimmed by `scripts/slim_props.py` (numpy + Pillow, runs inside
          `polyhaven_fetch.py`): the porch plant simplified from 69,345 to 37,907 triangles (quadric half-edge
          collapses that never move a vertex, touch a UV seam or flip a face; ≤3 mm, sub-pixel from the street) with
          512 px textures, 1.68 MB → 0.78 MB (1.20 MB → 0.49 MB gzipped); every prop's normals packed to 8 bits;
          all ten props 5.37 MB → 4.27 MB. Checked by `polyhaven-slim.test.mjs`. Still to do: the human GLBs
          (facial-asset pipeline) and meshopt with a self-hosted decoder.
- [ ] **7. Accessibility**: full keyboard flow, visible focus, reduced-motion option, readable contrast,
      captions for story audio cues.
  - [x] 7a. Accessibility settings in the menu: motion (follow the device / reduced / full), sound captions that
        describe every important sound (bell, messages, doors, whistle, horn…) even with the sound muted, and large
        text; visible keyboard focus on every in-game control; the game menu keeps Tab inside it and switches
        tabs with the arrow keys. The playtest drives the menu by keyboard and checks a caption appears.
  - [ ] 7b. Keyboard flow through the other overlays (map, conversations, training range, wardrobe, league table),
        a contrast audit of HUD text, and captions for the story scenes' own audio cues where they differ.
- [ ] **8. Content polish**: two or three downtown characters to talk to; short playable career tasks
      (patrol route, fire call, route march) instead of a fade-to-black shift.
  - [x] 8a. Three downtown regulars to talk to: Priya, a volunteer guide by the bus stop; Coach Dee at the
        Central Park pitch; Captain Brooks outside the fire station. Placed from the real street data (off the
        roads, clear of the bus, workplace and match prompts), out during the day, with relationships saved like
        the neighbours'. The playtest stands beside one, presses E and has a conversation.
  - [ ] 8b. Short playable career tasks (patrol route, fire call, route march) instead of a fade-to-black shift.
- [ ] **9. Release checklist**: page title, icons and share image, an error screen with a reload button,
      a privacy note, a "what's new" list, and a final full playthrough of all three endings in the playtest.

## After MVP: open-world track ("GTA standard")

The aim is GTA's *feel* — a living city, great driving, a phone, missions, polish — within a browser and the
game's own rules (no crime gameplay; weapons only at the training range). Work these in order once the MVP list
above is done or blocked; any item may be split into slices.

- [x] **10. Living downtown traffic**: AI cars driving the real street network, keeping right,
      following each other, yielding to you, and solid to your car.
- [x] **11. Minimap and GPS**: a corner minimap that rotates with you, a waypoint you set on the big map, and a
      route line along the roads to it (story objectives set it automatically).
- [x] **12. Traffic lights and pedestrians downtown**: signal-controlled junctions the traffic obeys; people
      walking downtown sidewalks who cross at lights.
  - [x] 12a. Traffic lights: 22 signalised junctions (wherever a main road meets others), two-way phases with
        yellow and all-red, offsets per junction; traffic stops at the line on red, and on yellow when it can.
  - [x] 12b. Pedestrians: 18 people (male and female, varied outfits) walk the pavements, wait at the kerb on red,
        cross with the traffic that has green, and cars stop for anyone in the road.
- [ ] **13. Driving feel**: body roll and pitch, tyre squeal and skid marks, engine sound by speed and gear,
      cosmetic dents and scratches, a horn; a police cruiser and a fire engine for those careers.
- [ ] **14. Phone**: an in-game phone (Esc-free, key P) with messages from Mom and friends, contacts you've
      met, the map, your career, and a camera / photo mode.
- [ ] **15. Car radio**: three or four original procedural stations with DJ-style station idents.
- [ ] **16. Career missions**: police patrol calls (traffic stop, lost child, noise complaint), fire calls with
      the hose, army route march with checkpoints; timed, scored, and paid better than a plain shift.
- [ ] **17. Seamless road**: drive from Maple Street to downtown and back without a fade (streamed world).
- [ ] **18. Weather and sky**: rain and wet roads, fog, sunsets, clouds; weather changes by day.
- [ ] **19. Cinematic story**: camera-directed cutscenes with letterboxing and character animation for each
      chapter opening and the three endings.
- [ ] **20. Visual quality pass**: better materials and lighting downtown, higher-detail characters (with the
      facial work), screen-space reflections on wet roads where the device can afford it.

## Found along the way

- Software rendering in CI runs at about 2 fps; the game clamps frames to 0.05 s of game time, so on very slow
  devices everything moves in slow motion. Worth a "low-end" check in item 6.
- Traffic: a road crossing without a shared OSM node (an overpass or a data gap) lets cars pass through each
  other there; traffic lights (item 12) should add explicit junctions. Cars have no headlights at night yet.
- Fixed: the big map's "you" arrow pointed backwards while walking (walking and driving headings used
  opposite conventions).
- (add bugs and small follow-ups here)
- The porch plant's pot and soil carried 59,000 of its 69,000 triangles (552 pebbles, each UV-seamed); a third of
  its vertices sit on UV seams, which the simplifier keeps, so a seam-aware collapse (as meshoptimizer does) could
  halve it again. Four porch plants stand on Maple Street; an LOD level would still help frame rate on phones.
- Downtown regulars (8a) have no story steps yet; a later chapter could send the player to Priya, Coach Dee
  or Captain Brooks (their `talked-priya` / `talked-dee` / `talked-brooks` events already reach the story).
- Downtown regulars don't show on the minimap or the big map yet.
- The action-clip GLBs were 40 % JSON (one bufferView per accessor, 1,474 of them) and repeated identical key
  times for every bone; `scripts/slim_clips.py` fixes both and runs inside `build-actions.py`. The same repacking
  would shrink the three locomotion clips inside `human.glb`, but that file belongs to the facial-asset pipeline.
- The sandbox has no meshopt/gltfpack and no npm registry, so geometry compression for the plant and human GLBs
  needs a CI job (like `propose-polyhaven-models.yml`) that runs `gltfpack -cc` and opens a PR with the result,
  plus a self-hosted `meshopt_decoder` so Babylon doesn't fetch it from its CDN.
- 6c note: the Poly Haven props already use 1024 px WebP textures and quantized meshes; the bulk is geometry
  (the plant is 1.3 MB of vertices, the human GLBs carry facial morph targets), so the real win needs meshopt with
  a self-hosted decoder (Babylon fetches it from its CDN by default). Leave the facial GLBs to the facial-asset
  contract job.
- Building downtown on the first trip takes a noticeable moment on slow devices; it happens behind the ride's
  fade, but a later pass could build it in idle frames while the player walks to the bus stop.
- Accessibility settings (motion, captions, text size) live in the browser settings key only; they are
  device preferences, so they are deliberately not part of the account progress document.
- "Reset progress" in the game menu (#190) clears the browser saves only; for signed-in players it should also
  reset the account copy (PUT a fresh progress document with a new `savedAt`), or the account copy comes back.
- The playtest's pitch step failed on `main`: it asked for the trip home while the pitch taxi was still driving
  (quick travel refuses a second trip). The playtest now waits for `travelling` to clear.
- The day/clock (`/me/life`) and progress (`/me/progress`) are synced separately; a later pass could merge them.
- On a phone the direction pad and camera buttons sit below the 3D view, so the player scrolls between them;
  5b should overlay a compact pad on the view itself.
- Wardrobe and character-creator buttons (tabs, skin tones) are under 40 px tall on phones; the phone playtest
  lists them as notices. Worth enlarging in 5b or item 7.
- The start page used to preload the whole Babylon chunk (1.6 MB gzipped) because Rollup put the shared
  lazy-import helper inside it; the helpers now get their own tiny `runtime` chunk, and the budget forbids it.
- Loading progress is per task (with a gentle creep while a file downloads); byte-level progress for the large
  GLBs (Babylon's `onProgress`) would make the bar smoother on slow connections.
- The football league save (`tld-league-v1:`) is local only; add it to the account progress document now that #192 has landed.
- The opponents in a league match still wear the red kit; club colours per opponent would make rounds feel distinct.
- The match AI favoured whichever team was listed first when two players could reach the ball (home won every tie);
  the nearer player now plays it, and a mirrored match plays out identically for both ends.
- A keeper rolling the ball out was logged as a "save", so every goal kick showed "Saved by …" and played the save
  sound; it is a pass now. AI-vs-AI matches used to finish around 6–5; with the new keeping and marking they average ~6 goals.
- Keepers dive by tipping the whole body at the feet; a proper dive clip (Quaternius has none) would look better.
- Playtests can stand the player next to a neighbour, a parked car or a workplace sign (`__tld.place`, only
  with `?playtest`), so touch flows don't depend on walking there in 2 fps software rendering.
- On phones in landscape (640×360) the view and pad still don't fit together; a true overlay pad on the view
  would cover that case (worth doing with item 7's layout work).
