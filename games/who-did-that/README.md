# WHO DID THAT?!
A very simple, funny, animated multiplayer party game, with no login or installation.

## One-minute explanation
A host creates a room and shares its five-character code. Friends join (2–8 people). Everyone sees the same silly question, such as "Who would argue with a GPS and somehow win?" Each person has 25 seconds to secretly vote for someone else. The game reveals who got accused, accompanied by confetti. Accusations add points to the target. After five rounds the player receiving the most votes wins the title **Most Accused**.

- Create room / join room via code or invite URL
- Real-time WebSocket sync and authoritative server-side tally
- Secret votes, no voting for yourself, round countdown, automatic reveal
- Bright, mobile-friendly animated UI: pointing finger, floating face, pulse, cards, vote bars, confetti
- Play with 3 demo bots, clearly marked DEMO, or 2–8 real people
- No accounts, install, character system, database, or complex roles

## Run
Node 20+.

    cd games/who-did-that
    npm install
    npm test
    npm start

Open http://localhost:3000. To test multiplayer, open the room link in another browser or on a phone connected to your machine's network.

## Deploy
Deploy this folder as an always-on Node web service with WebSocket support, using:
- root directory: games/who-did-that
- build: npm install
- start: npm start
- health endpoint: /health
- Node version: 22 or later (20+ supported)

Keep one service instance. Room state is in server memory and will reset after a restart; without a shared store, multiple instances must not be used. Rooms expire after 60 minutes of inactivity. Host passes to the next connected person if they disconnect. Use HTTPS/WSS on the actual public URL.

**GitHub doesn't deploy this automatically.** Publish a URL using your own hosting account, verify phones can join and WebSockets work, and submit that URL to Handshake with the required project title, description, and cover image.

## Contest submission
**Project name:** WHO DID THAT?!

**Description:** "Who Did That?!" is an instant party game where friends accuse each other of the most ridiculous things. Start a room, share a code, and get ready for five rounds of hilarious questions. Everyone votes anonymously, the answers pop onto the screen in an animated reveal, and the most accused friend wins. Free, fast, and playable on any phone or laptop—no sign-in or install needed.

**Time caution:** The Handshake mission page advertises October 31, 2026; the official challenge rules PDF states October 30 at 11:59 PM Pacific. Submit by the earlier deadline unless Handshake confirms otherwise.

Official rules: https://go.joinhandshake.com/rs/390-ZTF-353/images/%5BAI_Skills_Studio_Challenge%5D_Contest_Official_Rules.pdf?version=0

## Validation
GitHub workflow runs a five-round bot demo and a full 3-human-client WebSocket synchronized round, including score totals and rejection of self-voting. A passing automated test does not replace a real, deployed, physical-device smoke test. Check browser responsiveness, no account required, invite links, reconnect, time expiry, and real phone touch interactions before submitting.
