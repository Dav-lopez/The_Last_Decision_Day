"""WHO DID THAT?! — small authoritative multiplayer Flask + SSE party game."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
import json
import queue
import secrets
import string
import threading
import time
import uuid

from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

app = Flask(__name__, static_folder="public", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 4096

LOCK = threading.RLock()
ROOMS = {}
MAX_ROOMS = 250
MAX_PLAYERS = 8
ROUNDS = 5
CHOICE_SECONDS = 35
GUESS_SECONDS = 40
PLAYER_TIMEOUT_SECONDS = 60
ROOM_IDLE_SECONDS = 3600

SCENARIOS = [
    ("Your friend accidentally transfers a million naira to a stranger. Your advice?",
     ["Call the bank, immediately", "Send a dramatic voice note", "Ask your village people to intervene"]),
    ("A talking goat appears at your front door and demands rent. You...",
     ["Give it an invoice", "Offer it a room", "Call the neighbors for witnesses"]),
    ("You become the president for 24 hours. Your first new law?",
     ["Free jollof for everyone", "Make naps compulsory", "Ban Monday mornings"]),
    ("Your crush replies 'Who is this?' to your love message. You...",
     ["Pretend it was a wrong number", "Send your best selfie", "Retire from romance"]),
    ("Aliens land outside your house. You bring...",
     ["Jollof rice as a peace offering", "A ring light for the livestream", "Your most annoying neighbor"]),
    ("Your boss accidentally invites you to their secret group chat. You...",
     ["Leave quietly", "Read everything first", "Say 'Good morning, family!'"]),
    ("You wake up as a billionaire. Your first purchase?",
     ["A mansion with a slide", "A private island with Wi-Fi", "A truck full of snacks"]),
    ("Your best friend becomes famous overnight. You...",
     ["Ask to be their manager", "Dig up old photos", "Request a lifetime food allowance"]),
    ("Your phone gains the ability to speak out loud. You...",
     ["Apologize for everything it has seen", "Ask it to keep secrets", "Trade it for a quiet phone"]),
    ("Your neighbor's cat is now your landlord. You...",
     ["Pay rent in tuna", "File a formal complaint", "Start a tenants' association"]),
    ("Someone offers you a trip to Mars, leaving tomorrow. You...",
     ["Pack immediately", "Ask if there's good food", "Pretend your passport expired"]),
    ("A stranger asks you to babysit a dragon. You...",
     ["Accept and buy fireproof socks", "Negotiate danger pay", "Run and change your number"]),
    ("You accidentally become the school principal for a day. Your first move?",
     ["Cancel all homework", "Announce a dance-off", "Turn the cafeteria into a buffet"]),
    ("A robot arrives claiming to be your future child. You...",
     ["Ask to see its report card", "Ask about future lottery numbers", "Demand a DNA test"]),
    ("Your entire group is trapped in a lift. You...",
     ["Lead a singalong", "Start a very serious meeting", "Eat the emergency snacks"]),
    ("You find a button marked 'DO NOT PRESS'. You...",
     ["Press it immediately", "Call everyone to watch first", "Read the tiny warning label"]),
    ("Your wedding cake starts giving a speech. You...",
     ["Let it finish", "Ask the DJ to turn up", "Challenge it to a debate"]),
    ("Your boss tells you to invent a new holiday. You choose...",
     ["National Sleep-In Day", "Free Food Friday", "No Emails Week"]),
    ("You find a suitcase full of money and a note saying 'For the goose.' You...",
     ["Find the goose", "Ask the bank for advice", "Open a goose investment fund"]),
    ("Your best friend is secretly a superhero. You...",
     ["Ask for free flights", "Design their costume", "Charge for their autographs"]),
]


def now():
    return time.time()


@dataclass
class Player:
    id: str
    name: str
    score: int = 0
    bot: bool = False
    last_seen: float = field(default_factory=now)


@dataclass
class Room:
    code: str
    host: str
    players: dict[str, Player] = field(default_factory=dict)
    phase: str = "lobby"
    round: int = 0
    used: set[int] = field(default_factory=set)
    scenario: int | None = None
    decisions: dict[str, int] = field(default_factory=dict)
    guesses: dict[str, dict[str, int]] = field(default_factory=dict)
    deadline: float | None = None
    result: dict | None = None
    updated_at: float = field(default_factory=now)
    listeners: set = field(default_factory=set)
    version: int = 0


def error(message, status=400):
    return jsonify(error=message), status


def room_code():
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(chars) for _ in range(5))


def sanitize_name(v):
    if not isinstance(v, str):
        return ""
    return " ".join(v.split())[:20]


def is_online(player):
    return player.bot or now() - player.last_seen < PLAYER_TIMEOUT_SECONDS


def announce(room):
    room.version += 1
    room.updated_at = now()
    for listener in tuple(room.listeners):
        try:
            listener.put_nowait(room.version)
        except queue.Full:
            pass


def safe_state(room, token):
    p = room.players[token]
    scenario = SCENARIOS[room.scenario] if room.scenario is not None else None
    counts = Counter(room.decisions.values()) if room.phase in ("guess", "reveal", "finished") else {}
    return {
        "room": room.code, "phase": room.phase, "round": room.round,
        "rounds": ROUNDS, "you": token, "yourName": p.name, "isHost": room.host == token,
        "scenario": {"question": scenario[0], "options": scenario[1]} if scenario else None,
        "deadline": int(room.deadline * 1000) if room.deadline else None,
        "players": [
            {"id": item.id, "name": item.name, "score": item.score,
             "bot": item.bot, "online": is_online(item), "host": item.id == room.host}
            for item in room.players.values()
        ],
        "yourDecision": room.decisions.get(token),
        "hasGuessed": token in room.guesses,
        "decisionCount": len(room.decisions),
        "guessCount": len(room.guesses),
        "anonymousCounts": [counts.get(i, 0) for i in range(3)],
        # Never leak individual decisions or other players' guess maps before reveal.
        "result": room.result if room.phase in ("reveal", "finished") else None,
    }


def get_room(body=None):
    data = body if body is not None else request.args
    code = str(data.get("room", "")).strip().upper()
    token = str(data.get("token", ""))
    room = ROOMS.get(code)
    if not room or token not in room.players or room.players[token].bot:
        return None, None
    return room, token


def ensure_host(room):
    old = room.players[room.host]
    if is_online(old):
        return
    next_host = next((p.id for p in room.players.values() if not p.bot and is_online(p)), None)
    if next_host:
        room.host = next_host
        announce(room)


def choose_scenario(room):
    possible = [i for i in range(len(SCENARIOS)) if i not in room.used]
    if not possible:
        room.used.clear()
        possible = list(range(len(SCENARIOS)))
    chosen = secrets.choice(possible)
    room.used.add(chosen)
    return chosen


def begin_round(room):
    room.round += 1
    room.phase = "choose"
    room.scenario = choose_scenario(room)
    room.decisions = {}
    room.guesses = {}
    room.result = None
    room.deadline = now() + CHOICE_SECONDS
    for p in room.players.values():
        if p.bot:
            room.decisions[p.id] = secrets.randbelow(3)
    announce(room)


def all_decided(room):
    return len(room.decisions) == len(room.players)


def begin_guessing(room):
    if room.phase != "choose":
        return
    # Keep the match moving even when a player loses connection or goes AFK.
    for p in room.players.values():
        room.decisions.setdefault(p.id, secrets.randbelow(3))
    room.phase = "guess"
    room.deadline = now() + GUESS_SECONDS
    for p in room.players.values():
        if p.bot:
            room.guesses[p.id] = {
                target.id: secrets.randbelow(3)
                for target in room.players.values() if target.id != p.id
            }
    announce(room)
    if all_guessed(room):
        reveal(room)


def all_guessed(room):
    return len(room.guesses) == len(room.players)


def reveal(room):
    if room.phase != "guess":
        return
    gains = {pid: 0 for pid in room.players}
    correct = {pid: 0 for pid in room.players}
    fooled = {pid: 0 for pid in room.players}
    for guesser, submitted in room.guesses.items():
        for target, predicted in submitted.items():
            if guesser == target or target not in room.players:
                continue
            if predicted == room.decisions[target]:
                gains[guesser] += 2
                correct[guesser] += 1
            else:
                gains[target] += 1
                fooled[target] += 1
    for pid, earned in gains.items():
        room.players[pid].score += earned
    room.result = {
        "decisions": dict(room.decisions),
        "gains": gains, "correct": correct, "fooled": fooled,
        "guessesSubmitted": len(room.guesses),
    }
    room.phase = "reveal"
    room.deadline = None
    announce(room)


def advance(room):
    if room.deadline is not None and now() >= room.deadline:
        if room.phase == "choose":
            begin_guessing(room)
        elif room.phase == "guess":
            reveal(room)


@app.after_request
def security_headers(response):
    response.headers["Cache-Control"] = "no-store" if request.path.startswith("/api/") else "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; connect-src 'self'; "
        "img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'"
    )
    return response


@app.get("/")
def home():
    return send_from_directory("public", "index.html")


@app.get("/health")
def health():
    return jsonify(ok=True)


@app.post("/api/create")
def create():
    data = request.get_json(silent=True) or {}
    name = sanitize_name(data.get("name"))
    if not name:
        return error("Enter a nickname.")
    with LOCK:
        if len(ROOMS) >= MAX_ROOMS:
            return error("All rooms are busy. Try again shortly.", 503)
        code = room_code()
        while code in ROOMS:
            code = room_code()
        token = str(uuid.uuid4())
        room = Room(code=code, host=token)
        room.players[token] = Player(token, name)
        if data.get("demo") is True:
            for bot_name in ("Auntie Chaos", "Captain Oops", "Professor Drama"):
                bid = "bot-" + str(uuid.uuid4())
                room.players[bid] = Player(bid, bot_name, bot=True)
        ROOMS[code] = room
        announce(room)
        return jsonify(room=code, token=token, state=safe_state(room, token))


@app.post("/api/join")
def join():
    data = request.get_json(silent=True) or {}
    code = str(data.get("room", "")).strip().upper()
    with LOCK:
        room = ROOMS.get(code)
        if room is None:
            return error("Room not found. Check the five-character code.", 404)
        advance(room)
        token = str(data.get("token", ""))
        p = room.players.get(token)
        if p and not p.bot:
            p.last_seen = now()
            ensure_host(room)
            announce(room)
            return jsonify(room=code, token=token, state=safe_state(room, token))
        if room.phase != "lobby":
            return error("This game already started. Join a new room.", 409)
        if len(room.players) >= MAX_PLAYERS:
            return error("This room is full.", 409)
        name = sanitize_name(data.get("name"))
        if not name:
            return error("Enter a nickname.")
        if any(p.name.casefold() == name.casefold() for p in room.players.values()):
            return error("That nickname is taken in this room.")
        token = str(uuid.uuid4())
        room.players[token] = Player(token, name)
        announce(room)
        return jsonify(room=code, token=token, state=safe_state(room, token))


@app.get("/api/state")
def state_route():
    with LOCK:
        room, token = get_room()
        if not room:
            return error("Room not found. Rejoin from home.", 404)
        room.players[token].last_seen = now()
        advance(room)
        ensure_host(room)
        return jsonify(safe_state(room, token))


@app.post("/api/action")
def action():
    data = request.get_json(silent=True) or {}
    with LOCK:
        room, token = get_room(data)
        if not room:
            return error("Room not found. Rejoin from home.", 404)
        p = room.players[token]
        p.last_seen = now()
        advance(room)
        ensure_host(room)
        event = data.get("action")
        if event == "start":
            if room.host != token or room.phase != "lobby":
                return error("Only the host can start a new game.", 403)
            if len(room.players) < 2:
                return error("Invite a friend or try demo mode.")
            begin_round(room)
        elif event == "decide":
            value = data.get("option")
            if room.phase != "choose" or token in room.decisions:
                return error("The decision window is closed.", 409)
            if type(value) is not int or value not in (0, 1, 2):
                return error("Choose A, B, or C.")
            room.decisions[token] = value
            if all_decided(room):
                begin_guessing(room)
            else:
                announce(room)
        elif event == "guess":
            if room.phase != "guess" or token in room.guesses:
                return error("You already submitted guesses.", 409)
            guesses = data.get("guesses")
            targets = {id for id in room.players if id != token}
            if not isinstance(guesses, dict) or set(guesses) != targets:
                return error("Guess A, B, or C for every other player.")
            if any(type(v) is not int or v not in (0, 1, 2) for v in guesses.values()):
                return error("Guesses must be A, B, or C.")
            room.guesses[token] = dict(guesses)
            if all_guessed(room):
                reveal(room)
            else:
                announce(room)
        elif event == "next":
            if room.host != token or room.phase != "reveal":
                return error("Only the host can continue.", 403)
            if room.round >= ROUNDS:
                room.phase = "finished"
                announce(room)
            else:
                begin_round(room)
        elif event == "again":
            if room.host != token or room.phase != "finished":
                return error("Only the host can restart.", 403)
            for person in room.players.values():
                person.score = 0
            room.used.clear()
            room.round = 0
            begin_round(room)
        else:
            return error("Unknown action.")
        return jsonify(ok=True, state=safe_state(room, token))


@app.get("/api/events")
def events():
    with LOCK:
        room, token = get_room()
        if not room:
            return error("Room not found.", 404)
        # An SSE subscription does not authenticate any other player.
        listener = queue.Queue(maxsize=32)
        room.listeners.add(listener)
        current = safe_state(room, token)

    def stream():
        try:
            yield "event: state\ndata: " + json.dumps(current) + "\n\n"
            while True:
                try:
                    listener.get(timeout=1)
                except queue.Empty:
                    pass
                with LOCK:
                    if ROOMS.get(room.code) is not room or token not in room.players:
                        break
                    advance(room)
                    # A live SSE connection is itself presence activity.
                    room.players[token].last_seen = now()
                    ensure_host(room)
                    current_state = safe_state(room, token)
                    version = room.version
                if version != stream.last_version:
                    stream.last_version = version
                    yield "event: state\ndata: " + json.dumps(current_state) + "\n\n"
                else:
                    yield ": ping\n\n"
        finally:
            with LOCK:
                room.listeners.discard(listener)
    stream.last_version = room.version
    return Response(stream_with_context(stream()), mimetype="text/event-stream",
                    headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


def cleanup():
    with LOCK:
        stale = [code for code, room in ROOMS.items() if now() - room.updated_at > ROOM_IDLE_SECONDS]
        for code in stale:
            ROOMS.pop(code, None)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, threaded=True)
