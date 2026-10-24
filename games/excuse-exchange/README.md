# The Excuse Exchange

A standalone, live, no-login multiplayer party game for the October 2026 Handshake / OpenAI challenge.

A disaster happens. Everybody files a ridiculous anonymous alibi. The group votes on the best cover-up. For five rounds, nobody takes responsibility.

## Why this version

This is intentionally an isolated game in the games/excuse-exchange folder. It does not depend on or modify The Last Decision's authentication, database, API, or gameplay. It reuses the idea of real-time authoritative multiplayer communication, not the name or storyline.

## How to play

1. Open the public game URL on any phone or laptop.
2. Type an alias and Create a room. Share the generated five-character room code or invite link.
3. Two or more friends join on their own devices, no account or installation required. Up to eight participants.
4. Host starts. Everybody writes an outrageous excuse for the absurd crisis. The round has a 60-second timer.
5. The server hides authors during anonymous voting. Everyone gets 30 seconds to vote for someone else's alibi.
6. Votes earn 3 points each for the alibi's author. Sneaking in the random wildcard word earns a 1-point bonus.
7. Scores are revealed, then the host moves to the next round. After five rounds the highest-scoring suspect wins.
8. Try Solo creates three clearly labeled bot opponents for an instant interactive demo. Bot replies are prewritten, not AI-generated.

## Run locally

Requires Node 20 or later.

    cd games/excuse-exchange
    npm install
    npm test
    npm start

Open http://localhost:3000. Open a second browser/private window or a phone on the same network using the host machine's IP address to join another player. The built-in solo demo needs only one device.

## Deploy as a standalone public URL

Deploy this directory as a Node web service on any platform supporting persistent WebSocket connections (for example, Render or Railway). Set the root directory to games/excuse-exchange, build command npm install, start command npm start, and health check /health. The server binds to 0.0.0.0 using the host PORT automatically. Static UI and WebSockets are served from the same origin.

Current limits: Room state is held in memory. Restarting the web service loses rooms. Multiple server replicas without shared state will break rooms. Use exactly one instance for the contest MVP. Idle rooms expire after four hours. Host failover works while a connected player remains. Choose a hosting service that does not sleep during a judge's game. A public game URL is not created by the GitHub PR.

## Validation

- npm test drives a complete five-round WebSocket demo and a synchronized three-client round with server-side anti-self-voting assertions.
- node --check server.js and node --check public/app.js verify syntax.
- The repo's dedicated GitHub Action runs these checks for relevant changes.
- Browser, deployment, and cross-device smoke tests still need to be completed on the actual hosted URL.

## Submission checklist

- [ ] Merge the pull request and deploy a single public web service.
- [ ] Test the invite link on at least three real devices/browsers over HTTPS/WSS.
- [ ] Verify reconnect, mobile portrait mode, all five rounds, scoring, replay, and accessibility.
- [ ] Prepare a cover image and a short demo clip.
- [ ] Submit the title, cover image, project description, and public URL inside the Handshake Create a Multiplayer Game mission.
- [ ] Follow the official rules: https://go.joinhandshake.com/rs/390-ZTF-353/images/%5BAI_Skills_Studio_Challenge%5D_Contest_Official_Rules.pdf?version=0

IMPORTANT: The contest rules PDF lists an earlier entry deadline (October 30, 2026, 11:59 PM Pacific) than the October 31 advertised on the mission page. Submit before the earlier deadline.

## Suggested Handshake description

The Excuse Exchange is a fast-paced social party game where 3–8 players invent hilarious cover stories for impossible disasters. Anonymous real-time voting, surprise wildcard words, and server-authoritative scores make each five-round match a comedy event. Players join instantly from any browser with a shareable room code. A solo mode with three comic bot contestants lets anyone experience a full match immediately.
