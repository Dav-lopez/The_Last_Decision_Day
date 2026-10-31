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
  - [x] 6a. Loading screen with real progress (Maple Street, character, school, neighbours, props, cars; tips;
        "Start now" after 8 s; never holds you more than 45 s), downtown loading shown as a chip afterwards, and a
        gzipped bundle-size budget (`apps/web/bundle-budget.json`) checked in CI.
  - [ ] 6b. Compressed models (meshopt/Draco or texture-size cuts for the 1.6 MB human and plant GLBs), and
        downtown and the training range loaded only when you first go there.
- [ ] **7. Accessibility**: full keyboard flow, visible focus, reduced-motion option, readable contrast,
      captions for story audio cues.
- [ ] **8. Content polish**: two or three downtown characters to talk to; short playable career tasks
      (patrol route, fire call, route march) instead of a fade-to-black shift.
- [ ] **9. Release checklist**: page title, icons and share image, an error screen with a reload button,
      a privacy note, a "what's new" list, and a final full playthrough of all three endings in the playtest.

## Found along the way

- (add bugs and small follow-ups here)
- The playtest's pitch step failed on `main` (trip home requested while the pitch taxi was still driving).
  Same fix as #192/#196/#197: the playtest waits for `travelling` to clear.
- Loading progress is per task (with a gentle creep while a file downloads); byte-level progress for the large
  GLBs (Babylon's `onProgress`) would make the bar smoother on slow connections.
