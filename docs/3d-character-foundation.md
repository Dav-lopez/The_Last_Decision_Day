# 3D character foundation (decision record)

## Locked direction

The Last Decision will use **semi-realistic stylized 3D**: human proportions, expressive animation, customizable appearance, and optimized browser/mobile rendering. The default camera is third-person. Fidelity can improve through interchangeable character models, materials, and animation assets without changing gameplay persistence.

## Migration boundaries

- Keep React for account, character creation, school, and accessible HTML controls.
- Introduce Babylon.js as a separate, lazily mounted 3D world component. Do not replace Phaser until the new world works; remove the old intro scene only after the replacement is tested.
- Preserve ASP.NET Core, PostgreSQL, existing school action endpoints, audit events, auth, CSRF and SignalR. Client coordinates must never award attributes, money, or progress.
- Use glTF/GLB assets with explicit license records. Begin with a primitive/capsule avatar and simple geometry, not unlicensed third-party character models.
- Do not put player positions in an existing character attributes table without a reviewed migration. Persist authoritative world/position state separately when multiplayer is implemented.

## Vertical slice: first playable scene

1. Lazy-load a Babylon.js scene after character login; retain an HTML fallback when WebGL is unavailable.
2. Render a floor, school entrance and visible placeholder avatar; add third-person follow camera.
3. Support WASD/arrow keys, optional on-screen touch controls, movement acceleration, normalized diagonal speed and collisions; clean up listeners and engine on unmount.
4. Interact with the school entrance using a proximity prompt and keyboard/touch action. Open the existing React school activity UI rather than duplicate gameplay logic.
5. Keep all character progression server-authoritative. A failed or interrupted 3D scene must not prevent sign-in or school activity access.
6. Add browser smoke tests for mount/unmount, keyboard and touch input, interaction range, resize, WebGL fallback and keyboard focus on forms.

## Follow-on multiplayer and performance

- Define an explicit SignalR presence/position contract, server-side movement validation and per-room interest management before broadcasting position.
- Interpolate remote players; cap update frequency and payload size; handle reconnects, disconnects and stale players.
- Use LOD, instancing, compressed glTF textures, animation budgets and adaptive quality; target 30 FPS on representative midrange mobile hardware and 60 FPS on desktop, measured rather than assumed.
- Add bounded observability for scene initialization failures, asset load failures, network reconnects and measured frame time. Never log personal appearance choices or unbounded coordinate values as metric labels.

## Acceptance criteria

A signed-in player can move a visible avatar through a small navigable 3D environment, interact with school, complete a server-backed school activity, and retain saved progress after refresh. Keyboard and touch controls work; scene failure falls back to the existing HTML UI. CI and a manual browser test are required before calling this playable.

## Not yet implemented

This document records the agreed technical direction only. It does not claim the 3D world, animations, networking, or browser performance has been implemented or validated.
