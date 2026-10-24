"use strict";
// Five-round live party game. The Flask server is the authority for all scores and secrets.
const root = document.getElementById("app");
const connectionEl = document.getElementById("connection");
const toastEl = document.getElementById("toast");
const linkRoom = (new URLSearchParams(location.search).get("room") || "").toUpperCase();
const storedRoom = sessionStorage.getItem("wdt-room") || "";
let localPlayer = {
  room: storedRoom && (!linkRoom || linkRoom === storedRoom) ? storedRoom : "",
  token: sessionStorage.getItem("wdt-token") || "",
  name: localStorage.getItem("wdt-name") || ""
};
let game = null;
let events = null;
let pendingGuesses = {};
let latestRound = 0;
let lastPhase = "";
let toastTimer = 0;
let actionBusy = false;
const letters = ["A", "B", "C"];

function safe(v) {
  return String(v ?? "").replace(/[&<>"']/g, x =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
}
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3700);
}
function qs(params) {
  return new URLSearchParams(params).toString();
}
async function call(path, data) {
  const response = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Connection problem. Try again.");
  return result;
}
function identity() { return { room: localPlayer.room, token: localPlayer.token }; }
async function run(action, extra = {}) {
  if (actionBusy) return;
  actionBusy = true;
  try {
    const d = await call("/api/action", { ...identity(), action, ...extra });
    acceptState(d.state);
  } catch (e) { toast(e.message); }
  finally { actionBusy = false; }
}
function startSubscription() {
  events?.close();
  if (!localPlayer.room || !localPlayer.token) return;
  events = new EventSource("/api/events?" + qs(identity()));
  events.onopen = () => {
    connectionEl.textContent = "LIVE";
    document.querySelector(".dot")?.classList.add("online");
  };
  events.addEventListener("state", e => {
    try { acceptState(JSON.parse(e.data)); } catch { /* ignore malformed event */ }
  });
  events.onerror = () => {
    connectionEl.textContent = "RECONNECTING";
    document.querySelector(".dot")?.classList.remove("online");
  };
}
function acceptState(data) {
  if (!data || data.room !== localPlayer.room) return;
  if (data.round !== latestRound || data.phase === "lobby") {
    pendingGuesses = {}; latestRound = data.round;
  }
  const previous = lastPhase;
  game = data;
  lastPhase = data.phase;
  render();
  if (previous && previous !== data.phase && ["reveal", "finished"].includes(data.phase)) confetti();
}
function enter(data) {
  localPlayer.room = data.room;
  localPlayer.token = data.token;
  sessionStorage.setItem("wdt-room", data.room);
  sessionStorage.setItem("wdt-token", data.token);
  history.replaceState({}, "", "?room=" + encodeURIComponent(data.room));
  acceptState(data.state);
  startSubscription();
}
function leave() {
  events?.close(); events = null; game = null;
  localPlayer.room = ""; localPlayer.token = "";
  sessionStorage.removeItem("wdt-room"); sessionStorage.removeItem("wdt-token");
  history.replaceState({}, "", location.pathname);
  connectionEl.textContent = "READY";
  document.querySelector(".dot")?.classList.remove("online");
  render();
}
function playerName(id) { return game.players.find(p => p.id === id)?.name || "Unknown"; }
function roster() {
  return game.players.map(p => '<div class="person-small">' +
    '<span class="round-avatar">' + safe(p.name[0]) + '</span><b>' + safe(p.name) + '</b>' +
    (p.bot ? '<small>DEMO BOT</small>' : p.host ? '<small>HOST</small>' : '') +
    (!p.online ? '<small>OFFLINE</small>' : '') + '</div>').join("");
}
function scoreboard() {
  return [...game.players].sort((a, b) => b.score - a.score).map((p, index) =>
    '<div class="score-item"><span class="rank">' + String(index + 1).padStart(2, "0") + '</span>' +
    '<span class="score-person">' + safe(p.name) +
    (p.id === game.you ? ' <small>YOU</small>' : '') + '</span><b>' + p.score + ' <small>POINTS</small></b></div>').join("");
}
function landing() {
  root.innerHTML = '<div class="landing">' +
    '<section class="landing-hero"><div class="mini-label">THE SECRET-DECISIONS PARTY GAME</div>' +
    '<h1>WHO<br>DID <span>THAT<span class="punct">?!</span></span></h1>' +
    '<p>What would your friends actually do? Make secret choices. Read the room. Guess who chose what.</p>' +
    '<div class="illustration" aria-hidden="true"><div class="bubble">SUS!</div><div class="face">🤫</div>' +
    '<div class="arrow">↘</div><div class="finger">👉</div><div class="spark">✦</div></div></section>' +
    '<section class="entry-card"><div class="entry-number">01 / START THE FUN</div>' +
    '<h2>Bring your friends.</h2><label for="name">YOUR NICKNAME</label>' +
    '<input id="name" maxlength="20" autocomplete="nickname" placeholder="Your nickname" value="' + safe(localPlayer.name) + '"/>' +
    '<button class="btn primary" data-action="create">CREATE A ROOM <span>↗</span></button>' +
    '<button class="btn secondary" data-action="demo">PLAY A SOLO DEMO <span>✳</span></button>' +
    '<div class="join-title">HAVE A ROOM CODE?</div><div class="join">' +
    '<input id="code" maxlength="5" placeholder="ABCDE" aria-label="Room code" value="' + safe(linkRoom.slice(0,5)) + '"/>' +
    '<button class="btn small" data-action="join">JOIN →</button></div>' +
    '<p class="hint">No downloads, no accounts. Works on your phone.</p></section></div>' +
    '<div class="how"><span>01 · PICK YOUR DECISION</span><span>02 · GUESS EVERYONE ELSE</span>' +
    '<span>03 · REVEAL THE SECRETS!</span></div>';
}
function lobby() {
  root.innerHTML = '<section class="screen centered">' +
    '<div class="mini-label">YOUR FRIENDS ARE THE SUSPECTS</div>' +
    '<h1 class="screen-title">GATHER THE <em>GUILTY.</em></h1>' +
    '<div class="room-banner"><div class="entry-number">YOUR ROOM CODE</div>' +
    '<div class="big-code">' + safe(game.room) + '</div>' +
    '<button class="btn secondary" data-action="copy">COPY INVITE LINK ↗</button></div>' +
    '<p class="intro">Share the code with your friends. Everyone makes a secret decision each round.</p>' +
    '<div class="people-list">' + roster() + '</div>' +
    (game.isHost ? '<button class="btn primary big-action" data-action="start"' +
      (game.players.length < 2 ? ' disabled' : '') + '>START THE GAME →</button>' :
      '<p class="waiting">WAITING FOR THE HOST…</p>') +
    '<button class="text-button" data-action="leave">← LEAVE ROOM</button></section>';
}
function topLine(phase) {
  return '<div class="game-line"><div class="round-marker">ROUND ' + game.round +
    ' / ' + game.rounds + ' · ' + phase + '</div>' +
    '<div class="time"><span class="clock">◷</span><span id="timer">--</span><small>SEC</small></div></div>';
}
function choose() {
  const done = game.yourDecision !== null && game.yourDecision !== undefined;
  root.innerHTML = '<section class="screen">' + topLine("SECRET CHOICE") +
    '<div class="question-tag">🤫 WHAT WOULD YOU REALLY DO?</div>' +
    '<h1 class="question">' + safe(game.scenario.question) + '</h1>' +
    '<p class="intro">Pick your answer secretly. Nobody knows what you chose until the big reveal.</p>' +
    '<div class="options-grid">' +
    game.scenario.options.map((option, i) => '<button class="option-card ' +
      (done && game.yourDecision === i ? 'selected' : '') + '" data-action="decide" data-option="' + i +
      '"' + (done ? ' disabled' : '') + '><span class="choice-letter">' +
      letters[i] + '</span><span class="choice-copy">' + safe(option) + '</span>' +
      '<span class="choice-pointer">' + (done && game.yourDecision === i ? '✓' : '↗') +
      '</span></button>').join("") + '</div>' +
    '<p class="waiting">' + (done ? 'CHOICE LOCKED! KEEP IT SECRET.' :
      'CHOOSE AN OPTION. EVERYONE IS DECIDING…') + '</p>' +
    '<p class="hint">' + game.decisionCount + ' / ' + game.players.length + ' decisions made</p></section>';
}
function guess() {
  const others = game.players.filter(p => p.id !== game.you);
  const allSet = others.every(p => Object.hasOwn(pendingGuesses, p.id));
  root.innerHTML = '<section class="screen">' + topLine("GUESS WHO") +
    '<div class="question-tag">🕵️ READ YOUR FRIENDS LIKE A BOOK</div>' +
    '<h1 class="question">WHO CHOSE <span class="accent-lime">WHAT?!</span></h1>' +
    '<p class="intro">These are the anonymous choices. Now guess the decision <strong>each friend</strong> secretly made.</p>' +
    '<div class="anonymous-choices">' +
    game.scenario.options.map((option, i) => '<div class="anonymous-option"><span class="choice-letter">' +
      letters[i] + '</span><span>' + safe(option) +
      '</span><b>' + game.anonymousCounts[i] + ' picked</b></div>').join("") +
    '</div><div class="vote-title">GUESS EACH PERSON’S CHOICE<span>+2 CORRECT · +1 IF YOU FOOL SOMEONE</span></div>' +
    '<div class="guess-list">' +
    others.map(p => '<div class="guess-row"><span class="guess-avatar">' + safe(p.name[0]) +
      '</span><span class="guess-name">' + safe(p.name) +
      (p.bot ? ' <small>BOT</small>' : '') +
      '</span><div class="guess-buttons" role="group" aria-label="Guess for ' + safe(p.name) + '">' +
      letters.map((letter, i) => '<button data-action="guesspick" data-target="' + safe(p.id) +
        '" data-option="' + i + '" class="guess-pill ' +
        (pendingGuesses[p.id] === i ? 'active' : '') + '"' +
        (game.hasGuessed ? ' disabled' : '') + '>' + letter + '</button>').join("") +
      '</div></div>').join("") + '</div>' +
    (game.hasGuessed ? '<div class="waiting">GUESSES LOCKED! WAIT FOR EVERYONE.</div>' :
      '<button class="btn primary big-action" data-action="submitguesses"' +
      (allSet ? '' : ' disabled') + '>LOCK IN MY GUESSES →</button>') +
    '<p class="hint">' + game.guessCount + ' / ' + game.players.length +
    ' players finished guessing. You cannot guess your own decision.</p></section>';
}
function reveal() {
  const r = game.result;
  const rows = [...game.players].sort((a, b) => (r.gains[b.id] || 0) - (r.gains[a.id] || 0));
  root.innerHTML = '<section class="screen centered reveal-screen">' +
    '<div class="mini-label">ROUND ' + game.round + ' · IT’S ALL COMING OUT</div>' +
    '<div class="sticker">🚨 EXPOSED! 🚨</div>' +
    '<h1 class="screen-title">THE BIG <em>REVEAL!</em></h1>' +
    '<p class="intro">What everyone actually chose, and who fooled their friends.</p>' +
    '<div class="result-grid">' +
    rows.map((p, i) => '<article class="reveal-result" style="--i:' + i + '">' +
      '<div class="result-avatar">' + safe(p.name[0]) + '</div>' +
      '<div class="reveal-content"><strong>' + safe(p.name) + '</strong>' +
      '<div class="reveal-choice">CHOSE <b>' + letters[r.decisions[p.id]] + '</b> — ' +
      safe(game.scenario.options[r.decisions[p.id]]) + '</div>' +
      '<div class="reveal-stats">' + (r.correct[p.id] || 0) + ' right guesses · ' +
      (r.fooled[p.id] || 0) + ' friends fooled</div></div>' +
      '<div class="gain">+' + (r.gains[p.id] || 0) + ' PTS</div></article>').join("") + '</div>' +
    (game.isHost ? '<button class="btn primary big-action" data-action="next">' +
      (game.round >= game.rounds ? 'FINAL LEADERBOARD ↗' : 'NEXT SCENARIO →') +
      '</button>' : '<p class="waiting">WAITING FOR THE NEXT SCENARIO…</p>') + '</section>';
}
function finalScreen() {
  const sorted = [...game.players].sort((a,b)=>b.score-a.score);
  const high = sorted[0]?.score ?? 0;
  const winners = sorted.filter(p => p.score === high);
  root.innerHTML = '<section class="screen centered final-screen">' +
    '<div class="mini-label">FIVE ROUNDS. SO MANY BAD DECISIONS.</div><div class="trophy">🏆</div>' +
    '<h1 class="screen-title">THE MASTER <em>BLUFFER!</em></h1>' +
    '<div class="champion">' + safe(winners.map(p=>p.name).join(" & ")) + '</div>' +
    '<p class="intro">Apparently, nobody knows anybody here.</p>' +
    '<div class="scoreboard">' + scoreboard() + '</div>' +
    (game.isHost ? '<button class="btn primary big-action" data-action="again">PLAY AGAIN ↗</button>' :
      '<p class="waiting">WAITING FOR THE HOST TO PLAY AGAIN…</p>') +
    '<button class="text-button" data-action="leave">← BACK TO HOME</button></section>';
}
function render() {
  if (!game) landing();
  else if (game.phase === "lobby") lobby();
  else if (game.phase === "choose") choose();
  else if (game.phase === "guess") guess();
  else if (game.phase === "reveal") reveal();
  else if (game.phase === "finished") finalScreen();
  tick();
}
function tick() {
  const el = document.getElementById("timer");
  if (!el || !game?.deadline) return;
  const left = Math.max(0, Math.ceil((game.deadline - Date.now()) / 1000));
  el.textContent = String(left).padStart(2, "0");
  el.parentElement.classList.toggle("last-seconds", left <= 5);
}
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#efec62", "#a791fc", "#f879c9", "#7fecce", "#ffffff"];
  const div = document.createElement("div");
  div.className = "confetti"; div.setAttribute("aria-hidden", "true");
  for (let i=0; i<44; i++) {
    const p = document.createElement("span");
    p.style.setProperty("--x", Math.random()*100 + "%");
    p.style.setProperty("--delay", Math.random()*.65 + "s");
    p.style.setProperty("--dur", 1.7 + Math.random()*1.3 + "s");
    p.style.setProperty("--rot", Math.random()*650 + "deg");
    p.style.background = colors[i%colors.length];
    div.appendChild(p);
  }
  document.body.appendChild(div);
  setTimeout(()=>div.remove(),4000);
}
root.addEventListener("click", async e => {
  const button = e.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (["create", "join", "demo"].includes(action)) {
    const name = document.getElementById("name")?.value.trim();
    if (!name) return toast("Enter a nickname first.");
    localPlayer.name = name;
    localStorage.setItem("wdt-name", name);
    try {
      if (action === "join") {
        const room = document.getElementById("code")?.value.trim().toUpperCase();
        if (!/^[A-HJ-NP-Z2-9]{5}$/.test(room)) return toast("Enter a valid five-character room code.");
        enter(await call("/api/join", { room, name }));
      } else enter(await call("/api/create", { name, demo: action === "demo" }));
    } catch(err) { toast(err.message); }
    return;
  }
  if (action === "leave") return leave();
  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(location.origin + "/?room=" + encodeURIComponent(game.room));
      toast("Invite link copied!");
    } catch { toast("Share this code: " + game.room); }
    return;
  }
  if (action === "decide") { await run("decide", { option: Number(button.dataset.option) }); return; }
  if (action === "guesspick") {
    pendingGuesses[button.dataset.target] = Number(button.dataset.option);
    render(); return;
  }
  if (action === "submitguesses") { await run("guess", { guesses: pendingGuesses }); return; }
  if (["start", "next", "again"].includes(action)) await run(action);
});
setInterval(tick, 250);
// Automatic rejoin on refresh, including after a transient connection loss.
async function init() {
  if (localPlayer.room && localPlayer.token) {
    try {
      const result = await call("/api/join", identity());
      enter(result);
    } catch {
      leave();
    }
  } else {
    connectionEl.textContent = "READY";
    render();
  }
}
init();
