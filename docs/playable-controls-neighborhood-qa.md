# Playable controls and neighborhood: implementation and verification

The requested Cloudflare build was inspected at
https://the-last-decision-day.pages.dev/. The remote browser reported **WebGL not
supported**, then rendered a blank page because LandingWorld did not guard engine
initialization. This branch adds the guard and initialization fallback so account
controls remain available. Physical desktop/mobile GPU testing is still required.

## Working changes

- Camera preset easing runs only during a view switch. Wheel/pinch/manual zoom
  and orbit are retained afterward. Follow-target updates preserve camera radius
  and angles instead of recalculating them from the old camera position.
- Camera keyboard orbit input is removed so arrows move only the player.
  Zoom in/out, reset, valid overhead limits and building collision checks are added.
- Keyboard Shift and touch Run use the same measured-speed locomotion path.
  Run changes speed; directional input controls movement. Releasing direction
  stops the player. Blur/background clears inputs and sprint state.
- Imported environment clones include their descendants. An empty clone cannot
  disable fallback scenery. Imported assets receive/cast shadows.
- The PR includes actual self-contained, original GLBs: an oak with textured
  cutout leaves and branches, a house with siding/shingles/trim/gutters/porch,
  and a parked sedan. No external model or texture download is required.
- Parked-car placement and collision data are shared. Visible basic cars remain
  if model loading fails; cars leave the central school route open.
- Road center/edge markings, drains and driveway links are added. Evening enables
  three bounded street lights; Daylight disables them to avoid unnecessary light
  calculations. These are manual preview settings, not a simulated day/night cycle.

## Verification performed

`node --test apps/web/tests/*.test.mjs`, frontend TypeScript and Vite production
build run locally. The tests use Babylon NullEngine for actual camera updates,
GLB import, cloned meshes, lights and character skeleton animation. Material
images/shaders are not rendered by these tests. Original environment geometry
and textures were additionally reviewed with an offline CPU asset preview.

The three environment assets total approximately 364 KB, with 2,420 / 766 / 654
triangles per oak / house / sedan. These are asset budgets, not measured frame
rates. Textures are embedded PNGs and no runtime compression decoder is needed.

## Manual preview acceptance

1. Open the guest demo. Use W/arrow-forward and Shift, then release direction.
   The avatar should walk/run/idle with no automatic forward movement.
2. Drag to orbit; scroll or pinch to zoom; walk and stop. Zoom/tilt should persist.
   Exercise Zoom +/−, overhead view and Reset view. Walk near houses while orbiting
   to check collision behavior and roof visibility.
3. On touch, hold two directions, release one, then cancel the remaining pointer.
   Try Run on/off with forward, backward and strafe. Background/restore the page.
4. Confirm all six trees, two houses and two parked cars render. Walk around cars
   and tree trunks; reach the school entrance along the central street.
5. Switch Daylight/Evening. Check lit road surfaces and house/player materials,
   shadow quality, readable controls and acceptable frame rate on a phone.
6. Simulate failed model requests: procedural scenery must remain visible and
   no invisible parked-car obstacle should appear. Disable WebGL: landing/account
   controls must remain usable instead of a blank page.

Independent draft PR; manual merge and deployment. The separate generated
character asset PR is not required for these controls/environment changes.
Interiors, moving/drivable traffic, weather, photorealism, full facial expressions
and backend/save acceptance remain later roadmap work.
