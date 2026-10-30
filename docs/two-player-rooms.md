# Two-player internet rooms

Two distinct signed-in accounts can create/join a private code room, see each other’s character in the same area, and exchange text messages. Works through the existing same-origin Cloudflare `/hubs/*` proxy to the Render SignalR hub. No localhost or shared Wi-Fi requirement. Guest preview stays local.

## How to play

1. Sign in on device A, create a character if needed, then select **Create room** under **Play together**.
2. Copy the 16-character code and share it with your friend outside the game.
3. On device B, sign in to a different account, enter the code and select **Join room**. Both screens should show **2/2 players connected**.
4. Walk to the same area. A nameplate and animated character show the other player’s position. Chat works even when players visit different areas.
5. Use **Leave room** or sign out to disconnect. Opening the same character on another device replaces its previous session; it does not create a second player.

## Scope and limits

This delivers live presence and text communication. It does not synchronize decisions, inventory, school outcomes, clock, NPC state, house decoration or vehicle ownership. Peer movement is cosmetic and never awards progress. Wardrobe currently uses the default remote model; the peer’s own customized outfit is not transmitted. A driving/busy peer has a moving name/status marker rather than a second independently controllable car. Voice chat, shared interactions and authoritative co-op simulation remain separate work.

Rooms are in memory on **one backend instance**. Maximum 128 rooms, two characters per room, latest 64 messages. Empty rooms have a two-minute reconnect grace period; a restart discards room codes and chat. Do not scale the backend to multiple instances without a distributed room registry and SignalR backplane/sticky routing. Text is private to current room members; no public lobby or persistent chat archive is added.

The client retries interrupted transport connections, hides stale peers, disables sending while reconnecting and rejoins the previous room. If the server restarted or the room filled during a long interruption, the panel shows the error and clears the code. Messages use a per-attempt UUID so retrying an acknowledged or uncertain send does not duplicate it in retained room history. History older than 64 messages is outside that deduplication window.

## Deployment configuration

Both web and API changes must be merged and manually deployed. Existing `API_ORIGIN` and matching `EDGE_PROXY_SECRET` on Cloudflare/API must remain configured; the existing proxy carries cookies, POST antiforgery header, negotiation and hub transport requests. No migration or new paid service is required.

The hub accepts the production origin `https://the-last-decision-day.pages.dev` by default. For a custom domain, preview or local test origin, explicitly configure Render `Multiplayer__AllowedOrigins__0`, `Multiplayer__AllowedOrigins__1`, etc. Setting this array replaces the default: include the production origin too. Use exact scheme/host/port values without trailing slashes. Do not use wildcard origins. Authentication supplies the character identity and display name from the database; clients cannot impersonate a different character by sending a name.

Authentication, allowed Origin, and session-bound CSRF protect negotiation and HTTP sends. WebSocket upgrades require an allowed Origin. Server validation bounds pose values, chat length and frequency. An async transport gate makes room membership and SignalR group changes atomic relative to chat/pose broadcasts, including simultaneous same-account joins.

## Verification

- `dotnet run --project tests/Multiplayer.Tests/Multiplayer.Tests.csproj`: actual independent SignalR client connections to an ASP.NET TestServer running the production hub, store and transport security middleware. Tests auth/Origin/CSRF, two-player join, capacity, bidirectional chat, deduplication, movement, room isolation, reconnect, same-account replacement, group removal, simultaneous joins, rate limits and expiry. Test authentication/directory replace database login for this isolated protocol suite.
- `npm run test:online`: browser controller lifecycle, reconnect/expired-room handling, pending-account disposal, history bounds, retries and pose throttling using an injected transport.
- Web typecheck/build and existing web regressions.

The protocol test uses real SignalR over long polling in process. It is not a deployed Cloudflare WebSocket test or a visual GPU playtest. Existing NuGet dependency vulnerability warnings are still reported by the baseline API restore; this change does not resolve those unrelated dependency versions.

Before release, on two real devices and separate networks: verify login/cookies, create/join, bidirectional chat, walk/run/turn, area changes, status while driving, third-account rejection, sign-out removal, short network interruption/rejoin, and server-restart room error. Inspect browser WebSocket or fallback transport and API logs. Confirm no chat appears on a third account in a different room. A GPU visual check of remote model placement, animation and nameplates is still required.
