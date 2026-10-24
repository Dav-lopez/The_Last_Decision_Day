# WHO DID THAT?! — Secret Decisions

A funny, lightweight real-time multiplayer game. The Flask prototype lives in its own folder and does not depend on The Last Decision.

## How it works

1. Create or join a room with a nickname and a five-character code. Supports 2–8 people.
2. Everyone sees a silly decision scenario and secretly chooses A, B, or C (35 seconds).
3. The game shows only anonymous option totals. Each player predicts which option every other player secretly chose (40 seconds).
4. The game simultaneously reveals decisions and awards **2 points per correct guess**, **1 point to any player who fooled a guesser**.
5. Repeat for five rounds; the highest-scoring player is Master Bluffer. Ties are possible.

A clearly labeled solo demo includes three random-choice bot opponents. No passwords, databases, installs, or third-party AI calls.

## Run locally

Python 3.10+ required.

    cd games/who-did-that
    python -m pip install -r requirements.txt
    python -m unittest discover -s test -p "test_*.py" -v
    python app.py

Open http://localhost:3000.

## Realtime design

Flask HTTP APIs accept room creation, joining, secret decisions, guesses and transitions. Server-Sent Events (SSE) push synchronized updates to all joined browsers. The backend owns session identity, hidden choices, scoring, round deadlines, and automatic missing-choice fallback. Browsers never receive other players' choices until the reveal. Automatic reconnection uses a temporary player token stored in browser session storage.

## Deploy a public URL

Deploy the games/who-did-that directory as a Python web service on Render or Railway. A blueprint is provided in render.yaml.

- Install command: pip install -r requirements.txt
- Start: gunicorn --workers 1 --threads 32 --worker-class gthread --timeout 0 --bind 0.0.0.0:$PORT app:app
- Health endpoint: /health

**Keep exactly one worker and one instance.** Rooms and scores are held in memory and reset on restart. The chosen host must support persistent HTTP streaming and public HTTPS. The Flask development server is for local testing only.

## Contest submission

A GitHub PR is not a live deployment or a Handshake submission. The mission requires a public playable URL, cover image, project title, and description. The official rules PDF specifies October 30, 2026, at 11:59 PM Pacific, earlier than October 31 advertised on the mission page. Submit by the earlier deadline.

Official rules: https://go.joinhandshake.com/rs/390-ZTF-353/images/%5BAI_Skills_Studio_Challenge%5D_Contest_Official_Rules.pdf?version=0

Suggested pitch:

> WHO DID THAT?! is a hilarious browser party game where 2–8 friends privately decide what they would do in ridiculous situations, then guess which choice each friend made. Get 2 points for accurate guesses or 1 point whenever you fool a friend. Five fast rounds, animated reveals, instant room codes, no accounts, and an interactive solo demo.

## Verification

- [x] Flask server-side game phases, hidden decisions, anonymous choice totals, per-player guesses and authoritative points
- [x] Animated UI, responsive design, confetti, browser reconnection, room invite links
- [x] Python integration tests and GitHub Actions workflow configured
- [ ] CI green for current branch
- [ ] Live 3-browser / phone test after deploying to public HTTPS URL
- [ ] Create cover image, capture demo and submit through Handshake

Known limits: one worker and in-memory state, temporary player tokens in the SSE request URL, random bots, and a timer delay if a player disconnects. This is a contest prototype, not a production social platform.
