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

- [ ] **1. Automated playtest in CI**: headless Chromium loads the build, plays the guest demo (story scene,
      walking, map, quick travel downtown, pitch, home) and fails on page or console errors. *(in progress)*
- [ ] **2. Game shell**: an in-game menu (Esc / ☰) with Resume, Controls (every key and touch control),
      Settings (audio volumes, graphics quality), Story so far (chapter, objective, decision), Credits & licences,
      and Reset progress. A first-run hint showing the basic controls.
- [ ] **3. Progress saved to the account**: story, career and training record, and neighbour relationships
      synced through the API for signed-in players (guests keep local saves); newest-wins merge; tests on both sides.
- [ ] **4. Football extras**: better goalkeeping, smarter opponents (support runs, marking), a season league
      table that records your match results.
- [ ] **5. Phone and touch pass**: every action reachable by touch (talk, map, range, match, car), layouts that
      fit 360-pixel-wide screens, and a phone-viewport run in the playtest.
- [ ] **6. Loading speed**: compressed models, downtown and range loaded on demand, a loading screen with
      progress, and a bundle-size check in CI.
- [ ] **7. Accessibility**: full keyboard flow, visible focus, reduced-motion option, readable contrast,
      captions for story audio cues.
- [ ] **8. Content polish**: two or three downtown characters to talk to; short playable career tasks
      (patrol route, fire call, route march) instead of a fade-to-black shift.
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
- [ ] **12. Traffic lights and pedestrians downtown**: signal-controlled junctions the traffic obeys; people
      walking downtown sidewalks who cross at lights.
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

- Traffic: a road crossing without a shared OSM node (an overpass or a data gap) lets cars pass through each
  other there; traffic lights (item 12) should add explicit junctions. Cars have no headlights at night yet.
- Fixed: the big map's "you" arrow pointed backwards while walking (walking and driving headings used
  opposite conventions).
- (add bugs and small follow-ups here)
