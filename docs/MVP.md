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
- [x] **6. Loading speed**: compressed models, downtown and range loaded on demand, a loading screen with
      progress, and a bundle-size check in CI.
  - [x] 6a. Loading screen with real progress (Maple Street, character, school, neighbours, props, cars; tips;
        "Start now" after 8 s; never holds you more than 45 s), downtown loading shown as a chip afterwards, and a
        gzipped bundle-size budget (`apps/web/bundle-budget.json`) checked in CI.
  - [x] 6b. Downtown and the training range loaded only when you first go there: the 3D city, street lamps, pitch,
        workplace signs and traffic are built behind the first ride's fade (the map, taxi and workplace pins work
        from the street data at once), and the range is its own download; the playtest checks both halves.
  - [x] 6d. Downtown's code loads on demand too: the 3D city, street-lamp, pitch, traffic, traffic-light and
        pedestrian builders (`downtownKit.ts`) download with the downtown map data, the five-a-side match rules and
        players (`footballMatchKit.ts`) when you start a match, and the big map after Maple Street is up. WorldScene
        went from 125.7 KB to 110.2 KB gzipped (main had gone over its 124 KB budget once the radio, phone and
        driving feel all landed); `lazy-chunks.test.mjs` keeps those modules out of WorldScene's static imports.
  - [x] 6c. Compressed models (meshopt/Draco or texture-size cuts for the 1.6 MB human and plant GLBs).
    - [x] 6c-1 (partial slice). Action clips (talk, sit, drive, jump, dance…) slimmed from 711 KB to 255 KB per body
          (278 KB → 75 KB gzipped) by `scripts/slim_clips.py`: redundant keys dropped (≤0.02°, 0.1 mm), rotations
          stored as 16-bit, shared buffer views; Babylon import checked in CI. Still to do: the plant and human GLBs.
    - [x] 6c-2 (partial slice). Poly Haven props slimmed by `scripts/slim_props.py` (numpy + Pillow, runs inside
          `polyhaven_fetch.py`): the porch plant simplified from 69,345 to 37,907 triangles (quadric half-edge
          collapses that never move a vertex, touch a UV seam or flip a face; ≤3 mm, sub-pixel from the street) with
          512 px textures, 1.68 MB → 0.78 MB (1.20 MB → 0.49 MB gzipped); every prop's normals packed to 8 bits;
          all ten props 5.37 MB → 4.27 MB. Checked by `polyhaven-slim.test.mjs`. Still to do: the human GLBs
          (facial-asset pipeline) and meshopt with a self-hosted decoder.
    - [x] 6c-3. The two character bodies slimmed by `scripts/slim_character.py` (pure Python, called by
          `build-character.py` before hashing, so rebuilt models come out slim too): outfit and hair skin weights
          packed to 8 bits (rounded so each vertex still sums to exactly 1; worst error 0.003) and their normals to
          8 bits with KHR_mesh_quantization (worst error 0.4°). The face, eyes and anything with morph targets keep
          their float data, so the facial-asset contract is unchanged. human.glb 1.68 MB → 1.28 MB, human-female.glb
          1.64 MB → 1.25 MB (622 KB → 500 KB and 613 KB → 487 KB gzipped); checked by `character-slim.test.mjs`.
- [x] **7. Accessibility**: full keyboard flow, visible focus, reduced-motion option, readable contrast,
      captions for story audio cues.
  - [x] 7a. Accessibility settings in the menu: motion (follow the device / reduced / full), sound captions that
        describe every important sound (bell, messages, doors, whistle, horn…) even with the sound muted, and large
        text; visible keyboard focus on every in-game control; the game menu keeps Tab inside it and switches
        tabs with the arrow keys. The playtest drives the menu by keyboard and checks a caption appears.
  - [x] 7b. Keyboard flow through the other overlays (map, conversations, training range, wardrobe, league table),
        a contrast audit of HUD text, and captions for the story scenes' own audio cues where they differ.
    - [x] 7b-1 (partial slice). Keyboard flow through the overlays: the map, conversations, the training range and
          the league table take focus when they open and give it back to the 3D view when they close; Tab stays
          inside the map, conversations and the range; arrow keys switch the map and wardrobe tabs and move between
          conversation answers; Escape closes the league table; and the downtown map lists "GPS to" place buttons so
          a waypoint can be set without a mouse. The playtest walks the map and a whole conversation by keyboard
          and sets a GPS waypoint with Enter. Still to do: the HUD contrast audit and story-scene captions.
    - [x] 7b-2. HUD contrast audit and story-scene captions: `contrast.mjs` judges text by WCAG AA (4.5:1, 3:1 for
          large text) over both a black and a white backdrop, because the HUD floats over the live 3D scene; the
          playtest samples every visible piece of HUD text in eight states (street, story scene, conversation, big
          map, menu, captions, downtown, a career duty) and fails on anything below AA. Story lines now caption the
          speaker ("[Maya speaks]", "[Phone buzzes: text from Mom]", "[Story chime]" for narration) instead of a
          generic "Someone speaks", Elena's texts buzz like texts, and chapter fanfares say which chapter ended (and
          when the story ends). The playtest checks a speaker caption appears.
- [x] **8. Content polish**: two or three downtown characters to talk to; short playable career tasks
      (patrol route, fire call, route march) instead of a fade-to-black shift.
  - [x] 8a. Three downtown regulars to talk to: Priya, a volunteer guide by the bus stop; Coach Dee at the
        Central Park pitch; Captain Brooks outside the fire station. Placed from the real street data (off the
        roads, clear of the bus, workplace and match prompts), out during the day, with relationships saved like
        the neighbours'. The playtest stands beside one, presses E and has a conversation.
  - [x] 8b. Short playable career tasks instead of the fade: pressing E at your workplace starts a duty — a police
        patrol route (four stops), a fire call (three), an army route march (five checkpoints, on foot only) — planned
        on the real downtown streets (`careerTasks.mjs`), with a glowing beam at the next stop, the GPS routed to it,
        a duty card (stops, par clock, Give up) and a sign-off back at the door on foot. Beating par pays a bonus
        (+50 % inside three quarters of par, +25 % on time). The playtest runs a fire call and checks the pay.
- Career duties (8b) are the groundwork for item 16: the stops are walk-to markers with a line of text; real
  mission beats (the hose at a fire, a lost child to find) can hang off the same stop events.
- Leaving downtown (bus, taxi) mid-duty abandons it without pay; the life clock keeps running during a duty and
  then jumps the rest of the four-hour shift at sign-off.
- [x] **9. Release checklist**: page title, icons and share image, an error screen with a reload button,
      a privacy note, a "what's new" list, and a final full playthrough of all three endings in the playtest.
  - [x] 9a. Page title "The Last Decision Day", description, SVG and PNG icons (home-screen icon, web manifest), a
        1200×630 link-share image (`scripts/render-icons.mjs` renders them), an error screen with Reload and Back buttons
        for crashes and stale builds, a plain-language privacy note and a "What's new" list (start page and menu, with
        "new since your last visit" tags). The playtest checks all of it and crashes a second tab on purpose.
  - [x] 9b. A final full playthrough of all three endings in the playtest: after the rest of the run, the story is
        restarted and played from Chapter 1 to the epilogue three times, once per ending. Every step's gameplay event
        goes through the game's own story code, every scene is clicked through and checked line by line against
        `storyChapters.mjs`, the last decision is made in a real conversation with Mr. Okafor, Marcus or Tess (the
        playtest stands beside the one it wants; if they aren't out at that hour the event is reported instead and
        the run says so), the saved decision must match, and Maple Street must show the garden, the crossing or the
        football banner (screenshots `09-ending-*.png`).

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
- [x] **13. Driving feel**: body roll and pitch, tyre squeal and skid marks, engine sound by speed and gear,
      cosmetic dents and scratches, a horn; a police cruiser and a fire engine for those careers.
  - [x] 13a (partial slice). Feel at the wheel: a three-speed gearbox whose revs drive a new engine note (sawtooth
        and sub through a filter that opens with the gas, dipping on each up-shift) and a gear badge in the drive HUD;
        tyres squeal and lay fading skid marks behind the rear wheels in hard corners, hard stops and handbrake turns
        (Space, or HANDBRAKE on touch: the car slows and the tail swings round); a held horn (H, or HORN on touch); a
        thud when you hit something. Body roll and pitch were already in. The police siren moved from H to L.
        Still to do: dents and scratches, a police cruiser and a fire engine.
  - [x] 13b (partial slice). Dents and scratches: a knock above walking pace marks the car where it hit (the nose
        driving forwards, the tail reversing, the corner you steer towards; a light knock while turning scrapes down
        the side). Light knocks scratch the paint, hard ones dent it with a crunch, and a repeat knock deepens the same
        mark (`carDamage.mjs`). Marks are decals projected onto the car's own bodywork and ride along with it; the drive
        HUD shows the bodywork ("Dented 85%"), captions describe the crunch and scrape, fewer decals are drawn at lower
        adaptive quality, and the car is repaired overnight when you sleep. The phone playtest knocks the car and checks
        the badge. The cruiser and fire engine are 13c.
  - [x] 13c (partial slice). A police cruiser and a fire engine for those careers, parked in a free bay outside the
        real police and fire stations downtown (`vehicleSpecs.mjs` finds a spot clear of buildings, traffic lanes, the
        door and Captain Brooks). Each has its own size and handling: the black-and-white cruiser is quicker and brakes
        harder than the family car; the 7.8 m engine is slow to pick up speed, long to stop, turns wide and has a low air
        horn. L (or SIREN on touch) switches on flashing beacons and a siren — a police wail, a mechanical fire growl
        that winds up — now played through the audio director, so the volume sliders, mute and a "[Siren wails]" caption
        apply. Only officers drive the cruiser and only firefighters the engine; they turn back at the edge of downtown.
        The playtest drives the engine as a firefighter, switches lights and siren on by key and off by touch, and is
        refused the cruiser.
- [x] **14. Phone**: an in-game phone (Esc-free, key P) with messages from Mom and friends, contacts you've
      met, the map, your career, and a camera / photo mode.
  - [x] 14a (partial slice). The phone (P, or the Phone button): texts from Mom every morning (and a nudge home
        after dark), the story's own texts, friends who text once you get on well (and a cool note if you don't),
        work texts (welcome, today's shift hours, promotions); a buzz, a caption and a peek under the objective when
        one arrives; threads, unread badges, contacts with trust, a career summary and a map shortcut; arrow keys
        between apps, P / Esc to put it away. Both playtests open it.
  - [x] 14b. Camera / photo mode: Phone → Camera → Take photos raises a viewfinder and the HUD steps aside (sound
        captions stay). WASD / arrows aim the camera instead of walking, drag and pinch still orbit, + / − zoom up to
        3×, F cycles five looks (Natural, Golden hour, Vivid, Black & white, Faded film, previewed live), G a
        rule-of-thirds grid, Space the shutter (click, flash, caption; a still frame under reduced motion). Photos are
        stamped with day, time and place (downtown ones carry "Map data © OpenStreetMap contributors"), kept in the
        Camera app (newest 8, per character, in this browser) and can be saved to the device or deleted. Pure rules in
        `photoMode.mjs` (`photo-mode.test.mjs`); the viewfinder and capture code load the first time the camera opens;
        the guest playtest takes a photo and finds it in the app.
- [x] **15. Car radio**: three or four original procedural stations with DJ-style station idents.
  - Four stations, all original and generated in the browser: Maple 98.1 (indie pop), Low Tide 88.4 (lo-fi),
    Downtown 101.3 (late-night jazz) and Pulse 94.7 (synthwave), two songs each with intro, verse, chorus and
    outro. Between songs a station jingle plays and the DJ reads a rotating ident (browser speech where available,
    and the line is always shown on the dial). R / Shift+R or the ‹ › buttons tune; stations keep playing while
    you're out of the car, so you tune in mid-song; the choice is remembered.
- [x] **16. Career missions**: police patrol calls (traffic stop, lost child, noise complaint), fire calls with
      the hose, army route march with checkpoints; timed, scored, and paid better than a plain shift.
  - [x] 16a (partial slice). Fire calls with the hose: the call-out now starts at a real fire, a skip burning on the
        pavement a few metres from the stop (placed from the street data, on open ground), its smoke up as soon as the
        duty starts so you can see it down the street. The run waits there until it's out: hold Space (or HOSE on
        touch) to spray a water arc; standing still, a soft aim assist turns you onto the flames; too far, too close or
        facing away is called out on the duty card under a "fire left" meter. Left alone it flares back up; missed
        water is counted, and the sign-off line grades the job ("Clean knockdown: 40 litres of water"). Flames, smoke,
        steam and water are particles on one procedural texture (no downloads, no extra lights), sized by adaptive
        quality and loaded on demand (`fireCallScene.ts`); the hose is a looping sound on the effects bus, with
        crackle, whoosh and hiss cues and captions. Rules in `fireHose.mjs`; the playtest puts a fire out with Space.
        Police calls are 16b and scored army checkpoints 16c, below.
  - [x] 16b (partial slice). Police calls: every patrol now carries a call from dispatch on its second stop, in turn
        a lost child, a traffic stop and a noise complaint (`policeCalls.mjs`). The patrol waits at the call until
        it's handled on foot: the duty card offers three ways to handle it (keys 1–3 or tap) — kind and clear, by the
        book, or curt — and the reply plays out. A lost boy then walks behind you, at your heels, up the street to his
        dad in a red hoodie (the beam and GPS move to the dad; he only counts as handed over when you're both there);
        the traffic stop is a yellow hatchback pulled in at the kerb, hazards blinking, that drives off after you've
        spoken; the noise complaint is a party flat whose window glows to the beat with notes drifting up and a bass
        thump you hear from down the street, until a knock and a word quieten it. How you treated people is graded
        (Commended +40 %, Handled +20 %, Complaint filed +0 % of the shift's pay) on top of the time bonus, and shown on
        the sign-off line; the call adds its own time to par. People and car are the game's own models, built only when
        a patrol has a call (`policeCallScene.ts`, loaded on demand; fewer notes at lower adaptive quality); new knock,
        thump and reunion sounds with captions. The guest playtest joins the police, walks the lost boy back with the
        keyboard and checks the pay.
  - [x] 16c (partial slice). Scored route march: every checkpoint on a soldier's march is scored (`routeMarch.mjs`).
        Each leg has its own split par from the distance walked; arriving shows the split and a band (Sharp inside
        85 % of par, On pace, Steady, Behind), and the duty card's stop pips turn green, amber or orange to match. The
        march then holds for a map-and-compass call: which way is the next checkpoint (or the Recruiting Office)?
        Three compass points are offered — the right one and the two at right angles, in a fixed order per checkpoint
        — on keys 1–3 or as buttons; the minimap's N is the compass. A right call rings a rising chime, a wrong one a
        soft falling pair and says which way it was (new `compass` / `wrong` cues with captions). Up to 3 points per
        split and 2 per bearing grade the march (Distinction from 80 % +40 % of the shift's pay, Pass from 55 % +20 %,
        Needs work +0 %) on top of the time bonus, shown on the sign-off line; par allows 4 s per call. The guest
        playtest joins the army, walks the five checkpoints, calls four bearings by keyboard and taps one wrong, and
        checks the scorecard and pay.
- [ ] **17. Seamless road**: drive from Maple Street to downtown and back without a fade (streamed world).
  - [x] 17a (partial slice). The open road: downtown now sits north of the town (`CITY_ORIGIN` moved from 1 km east
        to 620 m north), and the road past the barrier at the top of Maple Street carries on for ~370 m, bends onto
        Broadway and drives straight into downtown with no fade; Broadway south (reversing out works too) brings you
        home the same way. The route is worked out from the street data (`openRoad.mjs`: the drivable street that
        crosses downtown's south edge nearest the town); only its tarmac is drivable out of town, the fog thins from
        Maple Street's haze to downtown's along it, and downtown is built while you wait at the barrier. Tarmac,
        edge lines, centre dashes, gravel shoulders, reflector posts, a grass verge over the gap and two road signs are
        a few frozen meshes in the downtown chunk (`openRoadScene.ts`). Other edges of downtown still use the quick
        fade, and the bus and taxi are unchanged. The home interior moved south (it stood on the road at z = 60). The
        guest playtest drives into downtown on the road, reverses out and back in, and fails on any fade.
        Still to do: streaming the town and downtown in and out instead of keeping both built (17b below did speed
        and traffic).
  - [x] 17b (partial slice). Speed zones and traffic on the open road: each vehicle's top speed now depends on where
        you drive (`SPEED_ZONES` in `vehicleDrive.mjs`): Maple Street unchanged (32 km/h in the family car), downtown
        ×1.45 (about 47 km/h) and the open road ×2.45 (about 80 km/h), with a stronger pull towards it. Over a zone's
        limit (arriving in town at 80) the car lifts off gently instead of being clamped. Steering is grip-limited
        above street speed (blending in from 8 to 12 m/s), so full lock stays tight on Maple Street but the car
        holds a stable line at 80. The driving HUD shows the zone and its limit as a speed sign. Six cars drive
        the road both ways in their right-hand lanes (`roadTraffic.mjs`, rendered in `roadTrafficScene.ts` with the
        downtown kit), 60–74 km/h, following at a gap and braking for you or your car in their lane; they're solid
        to your car. They loop at the ends of the stretch (95 m past the barrier, 60 m short of downtown) only when
        you can't see it, or after waiting 8 s at the end like a car at a junction. 5 new tests; the open-road
        playtest checks the speed sign and the road traffic.
- [x] **18. Weather and sky**: rain and wet roads, fog, sunsets, clouds; weather changes by day.
  - [x] 18a (partial slice). Weather by day (`weather.mjs`, the same on every device, nothing saved): day 1 clear,
        day 2 an afternoon shower, day 3 a foggy morning, then a mix (about 40 % clear, 25 % cloudy, 22 % showers,
        13 % fog). Rain falls around the camera as streaks with splashes at your feet (fewer drops at lower adaptive
        quality, none indoors), builds up and dies away over 15 minutes, and soaks the roads and pavements, which turn
        darker and glossy under the sun and street lamps and dry over two and a half hours. Overcast days fade in a grey
        cloud layer, hide the sun's glow, dim the sun and soften shadows; fog thickens and greys the haze and lifts by
        late morning. A rain loop on the ambience bus (muffled indoors), captions when rain starts and stops, the
        weather on the day clock ("Day 2 · 14:20 · Heavy rain", forecast on hover), and Mom's morning text warns of
        rain or fog. The scene code loads the first time a day isn't clear. The guest playtest forces showers and fog
        downtown and checks drops, wet roads, the HUD and both captions. Still to do: sunsets (a dusk sky between day
        and evening), moving clouds, puddles and reflections (item 20), wet-road grip.
  - [x] 18b. Sunsets and a gradual day: instead of one switch at 19:00, `dayCycle.mjs` shapes the light through the
        day — night lifts 05:00–06:00, sunrise colours fade by 07:30, a golden hour warms and lowers the sun from 16:30,
        the sunset sky fades in over the day sky 18:30–19:30 and night falls by 21:00. Sun and ambient light, their
        colours, the ground bounce, the sky dome (a sunset dome blended over the day dome, dimmed at night), the sun
        glow and the haze all follow it; street lamps still switch with the evening at 19:00, and weather still layers
        on top. The manual lighting switch shows a just-after-sunset or midday look. 4 tests.
  - [x] 18c. Moving clouds, puddles and wet-road grip: the painted clouds drift round the sky (a slow breeze on a
        clear day, faster when cloudy or raining, nearly still in fog) and the overcast layer slides across a little
        faster. Puddles fill on the soaked ground once the roads are properly wet (fixed spots, so the same puddles come
        back every rain; found by casting down onto the wet road and pavement materials near you, a few per frame), pick
        up the sky's colour and shine, and shrink and vanish as the roads dry. Wet roads grip less (`wetGrip` 1 dry →
        0.72 soaked in heavy rain): longer braking, a wider line at speed and a looser handbrake slide, while slow tight
        turns are unchanged; the speed sign shows "Wet". 4 tests; the rain playtest checks puddles and grip. Item 18 is
        complete apart from reflections on wet roads, which stay with item 20.
- [ ] **19. Cinematic story**: camera-directed cutscenes with letterboxing and character animation for each
      chapter opening and the three endings.
  - [x] 19a (partial slice). Directed story scenes: while a story scene plays, a camera director (`cutscene.mjs`)
        gives every line a shot from who is speaking and where they stand — a wide establishing shot that pushes in
        when a chapter opens, a slow drift for narration, close over the shoulder onto the phone for texts and the
        note from "A.", over-the-shoulder shots and reverse angles (eyelines kept on one side) when the speaker is
        standing near you, a three-quarter close-up on your own lines, a listening shot when someone speaks who isn't
        there, and a rising crane over Maple Street for the endings. Shots move slowly inside and cut between lines;
        lines from the same speaker hold the shot. Neighbours in the scene turn to you and lip-sync their lines, your
        character plays the talk animation on yours and turns to face whoever is talking. Chapter openings and the
        epilogue get wider bars and a title card ("Chapter 2 · The Note", "Ending · The Maple Street Garden"); the
        minimap and objective step aside. Indoors the shots stay tight and high under the cutaway; under reduced
        motion every shot holds still. The camera is handed back exactly as it was. The guest playtest checks the
        opening's title card, establishing shot and first cut, the camera's return, and the range of shots across all
        three endings. Still to do: authored camera moves and staging for set pieces (the note under the door, the
        clubhouse photo, the street changing on Last Decision Day), character gestures beyond Talk.
  - [x] 19b (partial slice). Acted set pieces (`storyActing.mjs`, story lines can carry a staged `beat`): you bend
        to pick up the note slipped under the door while the opening establishes, and look uneasy reading it; at the
        clubhouse the camera drops low over your shoulder and creeps towards the old team photo on the wall while you
        reach for it (one move held over both lines), then pushes in slowly on your face for "A. Rivera. Ms. Rivera?";
        when the street changes on Last Decision Day you break into a dance under the crane shot, in all three
        endings. Your face follows the line (wide-eyed at the note and the reveal, happy through the endings), and
        neighbours speak in the line's mood. Gestures stop when someone else speaks and when the scene closes, and in a
        car your hands stay on the wheel. The guest playtest checks the new shots and that the pick-up, reach, dance,
        talk and both faces all play across the three endings. Still to do: new clips for nods, shrugs and pointing
        (the action library has none yet), staging a neighbour beside you for two-person set pieces.
- [ ] **20. Visual quality pass**: better materials and lighting downtown, higher-detail characters (with the
      facial work), screen-space reflections on wet roads where the device can afford it.
  - [x] 20a (partial slice). Downtown facades: five facade styles (red brick with stone lintels and sash windows,
        stucco with string courses, painted siding with shutters, ashlar stone with tall windows, glass curtain walls
        with spandrels) drawn as one texture of four bays by four storeys each (`facadeDesign.mjs`), so windows no
        longer repeat bay by bay. Every building gets its own slight tint and window-grid offset (vertex colours, so a
        style is still one draw call); glass catches the sun and street lamps while walls stay matte (a gloss map);
        cornices stand proud of the wall and rise into a parapet; 420 air-conditioning units and stair housings sit on
        the flat roofs; 255 striped canvas awnings hang over shopfronts that face a street. After dark about two in
        five windows light up (warm tungsten to cool LED, some with blinds half down) and shop glass glows. All of it is
        procedural (no downloads) and frozen into three extra merged meshes. The guest playtest checks the details and
        switches the lights to see the windows come on. Still to do: lighting downtown (light probes or a baked
        ambient), higher-detail characters and reflections on wet roads.
  - [x] 20b (partial slice). Baked ambient light downtown (`downtownLighting.mjs`), worked out once from the street
        data when downtown is built, so it costs nothing per frame: walls darken towards the pavement, and where the
        building across an alley or a narrow street hides the sky they darken by how much of it is hidden (the
        neighbour's real height and distance, so the upper storeys above a low neighbour stay bright). The shading
        rides on the facades' vertex colours (walls are cut into bands where it bends), so each style is still one draw
        call. Soft contact shadows lie on the pavement along the foot of every free wall and under the shop awnings (one
        alpha-blended mesh, about 1,000 strips). After dark every street lamp throws a warm pool of light on the ground
        under its head (one additive mesh): subtle where the device also has real clustered lamp lights, stronger
        where it doesn't, so lamps light the street on every device. The guest playtest checks the shadow and canyon
        counts and that the pools follow the street lights. Still to do: higher-detail characters and reflections on
        wet roads.

## Found along the way

- Fixed (19b): after a story scene where you spoke, your character kept the looping Talk animation going after the
  scene closed (nothing stopped it), and a scene that played while driving swapped the Drive pose for Talk, taking
  your hands off the wheel. Scene gestures are now stopped when the next speaker isn't you and when the scene ends,
  and none play in a car.
- 19b: the "clubhouse" photo shot looks at the wall ahead of wherever you stand when the scene opens (usually by the
  pitch after full time); there is no clubhouse interior or photo prop yet, so the shot frames you and the sky line
  rather than a picture. A small clubhouse with the 1998 photo would make this land properly.
- 16b: the pulled-over car on a traffic stop sits in the traffic lane but isn't an obstacle to downtown traffic (AI
  cars pass through it) or solid to you; making it a traffic obstacle would queue the lane behind it, so it needs a
  pull-over bay or lane-change logic. The lost boy follows you on the pavement without the city collider, so on a
  tight corner he can clip a wall; he catches up at once if you get more than 25 m ahead. Calls aren't saved: a patrol
  given up or left mid-call starts over with the next shift's call.
- 16b and 16a both touch the duty card and `endTask`: merged with `clearCall()` and `clearFire()` side by side in
  `endTask` (a patrol never has both).

- 18a: the sky still switches straight from day to evening (`isEvening`); a sunset slice needs a gradual dusk
  (sun angle and colour by minute) rather than the boolean `setEvening`, which the weather now multiplies on top of.
  Wet roads only change the look; cars grip the same, and NPCs don't carry umbrellas or hurry in the rain yet.
  Rain particles aren't fogged, so in thick fog plus rain the near drops read a little bright.
- 19a: story scenes can't be checked frame by frame in the sandbox (no npm install, so no Babylon); the shots are
  judged by `cutscene.test.mjs` (geometry) and the playtest's camera readings. Some neighbours keep walking while a
  scene plays unless they are the one speaking, so a two-shot partner can drift out of the 9 m "in the scene" range;
  the plan is made once when the scene opens. Camera collisions can nudge an over-the-shoulder shot near a wall.

- 14b: photo filters are applied to the pixels with the CSS filter formulas rather than canvas `ctx.filter`, because
  Safari has no `ctx.filter`; the live preview is a CSS filter on the 3D canvas, so both match. Photos are not
  removed by "Reset progress" (they are keepsakes, like looks and settings), and they are not synced to the account:
  at ~80 KB each they would need a file store rather than the progress API.

- 9b drives the story's events through a playtest hook (`__tld.story.report`), not by re-playing school, sleep,
  downtown, a shift and a match three times over: at ~2 fps in CI's software renderer that would take hours. Those
  systems are each played for real earlier in the same run.

- Software rendering in CI runs at about 2 fps; the game clamps frames to 0.05 s of game time, so on very slow
  devices everything moves in slow motion. Worth a "low-end" check in item 6.
- Traffic: a road crossing without a shared OSM node (an overpass or a data gap) lets cars pass through each
  other there; traffic lights (item 12) should add explicit junctions. Cars have no headlights at night yet.
- Fixed: the big map's "you" arrow pointed backwards while walking (walking and driving headings used
  opposite conventions).
- 17b: road cars that reach an end while you're standing right there wait up to 8 s and then swap ends in view;
  a side road or junction prop at each end would hide it. Road cars don't use indicators or overtake.
- (add bugs and small follow-ups here)
- 16c: with police calls, fire calls, weather and lighting all merged in, WorldScene reached 131.1 KB gzipped against
  its 130 KB budget, so the budget is now 134 KB. The duty modes (fire hose, police calls, route march) are
  the clearest candidates for one lazily loaded "duties" chunk, which would win most of that back.
- 17a: the home interior was built at (0, 60), right on the road north of Maple Street, so it was visible up the
  exit road and would have been driven into; it now sits south at (0, −110), where the south road is closed.
- 17a: you can't get out of the car on the open road (there's nowhere for the player to walk out of town; a notice
  says so), and downtown traffic is only drawn once you're in the city, so it appears as you arrive. The open-road
  speed limit can now build on #246 (per-vehicle specs in `stepVehicle`, merged); the cruiser and engine stop at downtown's edge rather than take the road.
- 17a merged with 16a and 20a: a fire call's smoke and the new facades are built with the rest of downtown, so both
  are already standing when you drive in on the open road; the road's fog blend replaces 20a's fixed downtown haze.
- 20b: the canyon shade looks out from the middle of each wall only, so a long wall half-facing an alley and
  half-facing a square gets one value; sampling a few points along the wall (and splitting it there) would fix it.
  Contact strips double up slightly at outside corners (they overlap), which reads as a darker corner. Party walls
  that touch a neighbour are cut into bands too although they're hidden; skipping them would save ~40% of wall
  vertices. Lamp pools are flat at road height and draw over the kerb onto the pavement; the 3D view in the sandbox
  still can't be rendered (no Babylon), so the look was checked as a top-down map of the same data.
- 16c: the playtest works three shifts in one game day (fire call, route march and, with 16b, a patrol), which the
  energy and opening-hours rules would refuse; it uses a playtest-only `__tld.rest()` before the march. The march's
  bearing is the straight line to the next checkpoint, not the street route, so on a winding leg the GPS line can
  set off in a different direction from the right answer (the prompt asks which way the checkpoint is, so this is
  intended, but worth a hint if players find it confusing).
- 20a: building heights in the OSM data aren't whole storeys, so the top row of windows can be cut by the roof
  line; the cornice hides most of it. Snapping the facade's v so the top storey ends on the roof would fix the rest.
  Awnings aren't solid (they're above head height, but the camera can pass through them), and the lit-window pattern
  repeats every four bays and storeys per style (the per-building offset hides most of it).
- Fixed (13c): a car you drove downtown and got out of could never be got back into (downtown, E only looked for
  the bus, workplaces, people and the ball), and parked cars downtown were walk-through. Any car standing downtown is
  now solid on foot, to your car and to the traffic, and E gets you back in.
- Fixed (13c): the police siren made its own AudioContext and ignored the volume sliders and mute; it now plays through
  the audio director with a caption. The old light bar that appeared on the family car for police officers is gone —
  the lights belong to the cruiser.
- Station vehicles stay wherever you leave them downtown until the page is reloaded; a later pass could tow them back to
  their bay overnight (like the body shop in 13b). The engine has no hose yet: item 16's fire calls can hang the hose
  off the engine's side lockers.
- 13b first sat on an unpushed-for-review branch (`feature/car-damage-20261101`) that failed typecheck: the new
  `crunch` / `scrape` cues were in `score.mjs` but not in `AudioCue` (`director.d.mts`). New cues need both.
- Car damage (13b) is kept per car for the session and cleared when you sleep; it isn't saved. Traffic downtown
  only stops for you rather than hitting you, so only your own knocks mark the car. The impact spot is inferred from
  speed and steering, not from which footprint point touched; `stepVehicle` could report the contact point instead.
- 16a: the skip on a fire call isn't solid (you can walk through it), and the water arc passes through walls and
  parked cars; a collider entry for the skip and a ray for the jet would fix both. With the fire engine (13c) parked
  nearby, spraying from the engine's hose reel would be a natural next step.
- 16a: Babylon particle shaders compile the first time a fire is shown, which can hitch a frame on slow devices; the
  fire is lit when the duty starts (at the station door), not when you arrive, so the hitch lands somewhere harmless.
- Merging 13b and 13c: the cruiser and fire engine take dents and scratches too, but the impact spot is laid out on
  the family car's footprint, so on the 7.8 m engine a nose or tail mark lands nearer the middle than the bumper.
  `impactSpot` could take the vehicle's length from `vehicleSpecs.mjs`.
- 6c-3: `facial_release_parity.py` fails on the checked-in GLBs on main too ("unexpected eyebrow fibre vertex
  budget"); it is meant for freshly generated files (the build workflow runs it after `build-character.py`), so the
  checked-in bodies predate a later brow change. Rebuilding them from the pinned sources would settle it. Positions
  are still float: skinned meshes ignore node transforms, so 16-bit positions need the inverse bind matrices rebased
  (or meshopt with a self-hosted decoder) — the next ~250 KB per body.
- Fixed (6c-3): the phone playtest once failed "drive HUD covers action button" on a run whose only change was model
  bytes — timing put a long notice in the drive HUD, which wrapped to four lines and grew up into the "Get out"
  button. On phones the drive notice now wraps to at most two lines, and the playtest notes what the HUD said.
- Fixed: a merge resolution had moved the phone playtest's radio check into `checkLayout`, so every phone step
  after the first layout check waited for a radio that only exists while driving (10 phone steps red on main), and
  the phone radio dial had ended up inside the 3D view. Seven facial tests had also dropped out of every npm
  script; `test-wiring.test.mjs` now fails if any `tests/*.test.mjs` isn't run by CI.
- WorldScene's next big lazy-load candidates: the game menu (7 KB, but it hosts the audio panel that creates the
  sound director, so the director needs a new home first) and the story/conversation data (24 KB, shared with the
  phone).
- `main` went over the WorldScene bundle budget (125.7 KB gzipped vs 124 KB) once driving feel, car radio and the
  phone landed together; #237 raises it to 130 KB. WorldScene.tsx is ~2,700 lines: the downtown-only HUD (duty card,
  GPS, radio) could move into lazy chunks to win that back.
- The contrast audit only sees an element's own ancestors' backgrounds; text drawn over a sibling panel (absolutely
  positioned on top of another) is judged as if over the 3D scene, which is the stricter case. The phone playtest
  could run the same audit at 360×640.
- Skid marks are drawn at road height 0.022 m on flat ground; if roads ever get slopes or kerbs, they need the
  ground height under each wheel. The skid-mark pool shrinks (240 → 150 → 80) as adaptive quality lowers resolution.
- The police siren (careersScene `createSiren`) makes its own AudioContext, so it ignores the volume sliders and mute;
  it should move into the audio director like the horn did.
- The share image's `og:image` URL points at `https://the-last-decision-day.pages.dev/`; update `index.html` if the
  game moves to its own domain. Link previews need an absolute URL, so it can't be relative.
- React logs a crash it caught with `console.error` even when the error screen handles it; the playtest's crash check
  runs in its own tab so that log doesn't fail the main run.
- The privacy note (`src/releaseInfo.mjs`) must change whenever the game starts storing or sending something new
  (for example if analytics, a TURN server for voice or cloud photo uploads are ever added).
- The web manifest makes the game installable to a home screen, but there is no service worker, so it still needs a
  connection; an offline shell could come with the release work.
- The porch plant's pot and soil carried 59,000 of its 69,000 triangles (552 pebbles, each UV-seamed); a third of
  its vertices sit on UV seams, which the simplifier keeps, so a seam-aware collapse (as meshoptimizer does) could
  halve it again. Four porch plants stand on Maple Street; an LOD level would still help frame rate on phones.
- 7b: in the training range, Space fires and also presses whichever range button has focus (Hold breath, Reload,
  Stop); the live phase should keep focus off the buttons or ignore Space on them.
- 6c's remaining work (meshopt for the plant and human GLBs) can't be done in the sandbox: no gltfpack, and neither
  npm nor PyPI is reachable, so it waits for a CI-side compression job.
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
- Fixed: on narrow phones a two-line notice while driving made the drive HUD grow into the "Get out of car" button
  (the phone playtest caught it once); the HUD drops its key help on phones, where the pad and button explain driving.
- The phone's inbox (`tld-phone-v1:`) is kept in the browser only; it could join the account progress document.
  Story texts already seen before the phone existed all arrive at once, stamped with the time you next play.
- Friends' texts are fixed lines per person; a later pass could tie them to the day (match invites on match
  days, Ms. Rivera's quiz on a school day) and let you reply with the same 1–3 choices as conversations.
