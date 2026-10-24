"use strict";
const app = document.getElementById("app");
const statusEl = document.getElementById("connection-status");
const toastEl = document.getElementById("toast");
const queryRoom = new URLSearchParams(location.search).get("room");
let player = {
  token: sessionStorage.getItem("ee-token") || crypto.randomUUID(),
  name: localStorage.getItem("ee-name") || "",
  room: sessionStorage.getItem("ee-room") || ""
};
sessionStorage.setItem("ee-token", player.token);
let ws = null;
let state = null;
let draft = "";
let previousRound = 0;
let disconnected = false;
let toastTimeout;

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove("show"), 3500);
}
function send(message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast("Connection lost. Reconnecting…");
    return false;
  }
  ws.send(JSON.stringify(message)); return true;
}
function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(scheme + "//" + location.host + "/ws");
  ws.addEventListener("open", () => {
    disconnected = false;
    statusEl.textContent = "LIVE CONNECTION";
    document.querySelector(".live-dot")?.classList.add("connected");
    if (player.room) send({ type: "join", room: player.room, token: player.token, name: player.name });
    else render();
  });
  ws.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "error") {
      toast(message.message);
      if (message.message.includes("Room not found") || message.message.includes("already in progress")) {
        player.room = ""; state = null;
        sessionStorage.removeItem("ee-room");
        history.replaceState({}, "", location.pathname);
        render();
      }
      return;
    }
    if (message.type === "joined") {
      player.room = message.room; player.token = message.token;
      sessionStorage.setItem("ee-room", player.room);
      sessionStorage.setItem("ee-token", player.token);
      history.replaceState({}, "", "?room=" + encodeURIComponent(player.room));
    }
    if (message.type === "state") {
      if (message.round !== previousRound) { draft = ""; previousRound = message.round; }
      state = message; player.name = message.yourName;
      render();
    }
  });
  ws.addEventListener("close", () => {
    disconnected = true;
    statusEl.textContent = "RECONNECTING";
    document.querySelector(".live-dot")?.classList.remove("connected");
    setTimeout(connect, 1500);
  });
  ws.addEventListener("error", () => { statusEl.textContent = "CONNECTION ISSUE"; });
}
function playerList() {
  if (!state) return "";
  return state.players.map(p =>
    '<div class="player-pill"><span class="avatar">' + esc(p.name.charAt(0)) + '</span>' +
    '<span class="pill-name">' + esc(p.name) + '</span>' +
    (p.bot ? '<span class="micro-tag">DEMO</span>' : p.host ? '<span class="micro-tag">HOST</span>' : "") +
    (!p.online ? '<span class="offline">OFFLINE</span>' : "") + '</div>'
  ).join("");
}
function scoreboard() {
  if (!state) return "";
  return '<div class="scoreboard">' + [...state.players].sort((a, b) => b.score - a.score)
    .map((p, i) => '<div class="score-row"><span class="place">' + (i + 1) + '</span>' +
      '<span class="score-name">' + esc(p.name) + (p.id === state.you ? ' <em>(you)</em>' : '') + '</span>' +
      '<strong>' + p.score + ' <small>PTS</small></strong></div>').join("") + '</div>';
}
function roundHeader(label) {
  return '<div class="round-label"><span class="tag">ROUND ' + state.round + ' / ' + state.maxRounds +
    '</span><span class="tag tag-subtle">' + esc(label) + '</span></div>';
}
function timer() { return '<div class="timer" aria-label="Time remaining"><span class="timer-icon">◷</span><span data-timer>--</span><small>SECONDS</small></div>'; }
function renderLanding() {
  const name = esc(player.name);
  const code = esc((queryRoom || "").toUpperCase().slice(0, 5));
  app.innerHTML = [
    '<section class="hero"><div class="eyebrow"><span class="asterisk">✳</span> THE PARTY GAME FOR PROFESSIONAL LIARS</div>',
    '<h1>YOU DID IT.<br><span class="gradient-text">PROVE YOU</span><br><span class="italic-pop">DIDN’T.</span></h1>',
    '<p class="hero-copy">A ridiculous disaster. Your most outrageous excuse. Your friends decide who gets away with it.</p>',
    '<div class="doodle-note"><span>↳</span> zero downloads · zero logins · maximum nonsense</div></section>',
    '<section class="landing-grid"><div class="panel main-panel">',
    '<div class="panel-kicker">01 / THE FIRST SUSPECT</div><h2>Who are we blaming?</h2>',
    '<label class="field-label" for="display-name">YOUR ALIAS</label>',
    '<input id="display-name" maxlength="20" autocomplete="nickname" placeholder="e.g. Innocent Steve" value="' + name + '" />',
    '<div class="stacked-buttons"><button class="button button-primary" data-action="create">CREATE A ROOM <span>↗</span></button>',
    '<button class="button button-violet" data-action="demo">TRY SOLO WITH CHAOTIC BOTS <span>✳</span></button></div>',
    '<div class="divider-or"><span>OR JOIN YOUR FRIENDS</span></div>',
    '<div class="join-row"><input aria-label="5 character room code" id="room-code" placeholder="ROOM CODE" maxlength="5" value="' + code + '" />',
    '<button class="button button-outline" data-action="join">JOIN →</button></div></div>',
    '<div class="panel how-panel"><div class="panel-kicker">02 / OFFICE POLICY</div><h2>How the chaos works</h2>',
    '<ol class="steps"><li><b>THE DISASTER</b><span>Everyone sees one hilariously awful situation.</span></li>',
    '<li><b>THE COVER-UP</b><span>Write an excuse. Sneak in the wildcard word for bonus points.</span></li>',
    '<li><b>THE VERDICT</b><span>Read anonymous excuses and secretly vote. No voting for yourself!</span></li>',
    '<li><b>THE EXPOSED</b><span>Reveal the culprits, collect points, and repeat for five rounds.</span></li></ol>',
    '<div class="round-stamp">3–8 PLAYERS <span>✦</span> ~7 MINUTES</div></div></section>',
    '<div class="ticker" aria-hidden="true"><span>OBJECTION! ★ ABSURDITY REQUIRED ★ NO ONE IS INNOCENT ★ </span></div>'
  ].join("");
}
function renderLobby() {
  const ready = state.players.length >= 3;
  app.innerHTML = [
    '<section class="screen narrow"><div class="eyebrow">WELCOME TO THE DEPARTMENT OF EXCUSES</div>',
    '<h1 class="screen-title">THE SUSPECT<br><span class="gradient-text">LINEUP.</span></h1>',
    '<div class="panel room-panel"><div class="panel-kicker">YOUR SECRET ROOM</div>',
    '<div class="room-code">' + esc(state.room) + '</div><p>Share this code with your friends on any phone or laptop.</p>',
    '<button class="button button-outline" data-action="copy">COPY INVITE LINK ↗</button></div>',
    '<div class="panel"><div class="panel-head"><h2>Suspects checked in</h2><span class="tag">' +
    state.players.length + '/8 PLAYERS</span></div><div class="roster">' + playerList() + '</div></div>',
    state.isHost
      ? '<button class="button button-primary button-wide" data-action="start" ' + (ready ? "" : "disabled") +
        '>START THE CHAOS <span>→</span></button><p class="supporting">' +
        (ready ? 'Enough suspects. The disaster can begin.' : 'Invite two friends, or launch a solo demo from the home page.') + '</p>'
      : '<div class="wait-banner"><div class="spinner"></div> Waiting for the host to start the chaos…</div>',
    '<button class="plain-link" data-action="leave">← Leave this room</button></section>'
  ].join("");
}
function renderWrite() {
  app.innerHTML = [
    '<section class="screen"><div class="game-top">' + roundHeader("WRITE YOUR ALIBI") + timer() + '</div>',
    '<div class="case-number">CLASSIFIED CASE FILE #0' + state.round + '</div>',
    '<div class="crisis-card"><div class="crisis-sticker">🚨 BREAKING NONSENSE</div>',
    '<h1>' + esc(state.prompt) + '</h1><div class="crisis-decoration">?!</div></div>',
    '<div class="mission-card"><div class="mission-top"><span>YOUR MISSION</span><strong>GET AWAY WITH IT.</strong></div>',
    '<p>Write a ridiculous excuse for how this happened. Convince the room you are 100% innocent.</p>',
    '<div class="wildcard">✳ BONUS WORD <strong>' + esc(state.wildcard.toUpperCase()) + '</strong><span>+1 point if you sneak it in</span></div>',
    state.yourRole ? '<div class="role-secret"><span class="role-kicker">🔒 YOUR SECRET ROLE — DO NOT TELL THEM</span>' +
      '<strong>' + esc(state.yourRole.emoji) + ' ' + esc(state.yourRole.name) + '</strong>' +
      '<p>' + esc(state.yourRole.hint) + ' <b>+2 points</b> if you pull it off.</p></div>' : '',
    '</div>',
    state.submitted
      ? '<div class="submitted-box"><span>✓</span><h2>ALIBI FILED.</h2><p>Your secret is safe until voting. ' +
        state.answerCount + '/' + state.players.length + ' suspects have submitted.</p></div>'
      : '<form id="excuse-form" class="write-box"><label for="excuse-text">YOUR COMPLETELY BELIEVABLE EXCUSE</label>' +
        '<textarea id="excuse-text" rows="3" minlength="8" maxlength="180" placeholder="In my defense, the goose signed the contract…" required>' +
        esc(draft) + '</textarea><div class="compose-foot"><span><b id="counter">' + draft.length + '</b> / 180</span>' +
        '<button class="button button-primary" type="submit">SUBMIT ALIBI ↗</button></div></form>',
    '<div class="subtle-note">No one sees your answer until every alibi is in or the timer ends.</div></section>'
  ].join("");
}
function renderVote() {
  const cards = state.choices.map((entry, i) => {
    const mine = state.yourAnswerId === entry.id;
    return '<button class="alibi-card" data-action="vote" data-id="' + esc(entry.id) + '"' +
      (mine || state.voted ? ' disabled' : '') + '><span class="alibi-number">EXHIBIT ' +
      String.fromCharCode(65 + i) + (mine ? ' · YOURS' : '') + '</span><span class="alibi-text">' +
      esc(entry.text) + '</span><span class="alibi-cta">' +
      (mine ? 'YOUR EXCUSE' : state.voted ? 'VOTE LOCKED' : 'VOTE FOR THIS →') + '</span></button>';
  }).join("");
  app.innerHTML = [
    '<section class="screen"><div class="game-top">' + roundHeader("THE VERDICT") + timer() + '</div>',
    '<div class="eyebrow">THE ALIBIS ARE IN</div><h1 class="screen-title">WHO SOUNDS<br><span class="gradient-text">LEAST GUILTY?</span></h1>',
    '<p class="screen-intro">Read the anonymous excuses. Vote for the funniest, most outrageously convincing alibi. Your vote is secret.</p>',
    '<div class="alibi-grid">' + (cards || '<p>No alibis were submitted this round.</p>') + '</div>',
    state.voted ? '<div class="wait-banner">✓ Vote locked. ' + state.voteCount + '/' + state.players.length + ' verdicts received.</div>' : '',
    '<div class="subtle-note">You cannot vote for your own excuse. Each vote earns its writer 3 points.</div></section>'
  ].join("");
}
function renderReveal() {
  const winner = state.results && state.results[0];
  const list = (state.results || []).map((r, i) =>
    '<article class="result-card ' + (i === 0 ? 'winner-result' : '') + '">' +
    '<div class="result-head"><span>' + (i === 0 ? '🏆 TOP ALIBI' : 'EXHIBIT ' + (i + 1)) + '</span><b>+' + r.gained + ' PTS</b></div>' +
    '<p>“' + esc(r.text) + '”</p><div class="result-foot"><strong>' + esc(r.author) + '</strong>' +
    '<span>' + r.votes + ' votes · ' + (r.bonus ? '+1 wildcard' : 'no wildcard') + ' · ' + (r.roleBonus ? '+2 secret role' : 'role missed') + '</span></div>' +
    '<div class="role-reveal">SECRET ROLE: ' + esc(r.role || 'Unknown') + '</div></article>'
  ).join("");
  app.innerHTML = [
    '<section class="screen"><div class="eyebrow">THE VERDICT IS IN</div>',
    '<h1 class="screen-title">CASE <span class="gradient-text">CLOSED.</span></h1>',
    '<p class="screen-intro">' + (winner ? esc(winner.author) + ' got the most attention. Absolutely suspicious behavior.' :
      'No evidence. No suspects. Somehow even more suspicious.') + '</p>',
    '<div class="results-layout"><div class="result-list">' + list + '</div>',
    '<div class="panel leaderboard-panel"><div class="panel-kicker">CURRENT LEADERBOARD</div><h2>The usual suspects</h2>' +
    scoreboard() + '</div></div>',
    state.isHost ? '<button class="button button-primary button-wide" data-action="next">' +
      (state.round >= state.maxRounds ? 'SEE THE FINAL VERDICT →' : 'NEXT DISASTER →') + '</button>' :
      '<div class="wait-banner">Waiting for the host to open the next case…</div>',
    '</section>'
  ].join("");
}
function renderFinal() {
  const order = [...state.players].sort((a, b) => b.score - a.score);
  app.innerHTML = [
    '<section class="screen narrow finale"><div class="finale-confetti" aria-hidden="true">✦ ★ ✳ ✦ ★</div>',
    '<div class="eyebrow">FIVE DISASTERS. ZERO ACCOUNTABILITY.</div>',
    '<h1 class="screen-title">CHIEF OF<br><span class="gradient-text">EXCUSES.</span></h1>',
    '<div class="champion"><div class="champion-crown">👑</div><div class="panel-kicker">THE BIGGEST BLUFFER</div>',
    '<h2>' + esc(order[0]?.name || "Nobody") + '</h2><p>' + (order[0]?.score || 0) + ' absolutely undeserved points</p></div>',
    '<div class="panel leaderboard-panel"><h2>Official Department Rankings</h2>' + scoreboard() + '</div>',
    state.isHost ? '<button class="button button-primary button-wide" data-action="replay">CAUSE MORE PROBLEMS ↗</button>' :
      '<div class="wait-banner">Waiting for the host to start another game…</div>',
    '<p class="subtle-note">Share the room code and keep your excuses ready.</p></section>'
  ].join("");
}
function render() {
  if (!state) { renderLanding(); return; }
  if (state.phase === "lobby") renderLobby();
  else if (state.phase === "write") renderWrite();
  else if (state.phase === "vote") renderVote();
  else if (state.phase === "reveal") renderReveal();
  else if (state.phase === "final") renderFinal();
  updateCountdown();
}
function updateCountdown() {
  const el = document.querySelector("[data-timer]");
  if (!el || !state?.endsAt) return;
  const remain = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  el.textContent = String(remain).padStart(2, "0");
  el.closest(".timer")?.classList.toggle("urgent", remain <= 10);
}
app.addEventListener("input", e => {
  if (e.target.id === "excuse-text") {
    draft = e.target.value;
    const counter = document.getElementById("counter");
    if (counter) counter.textContent = draft.length;
  }
});
app.addEventListener("submit", e => {
  if (e.target.id === "excuse-form") {
    e.preventDefault();
    send({ type: "submit", text: document.getElementById("excuse-text").value });
  }
});
app.addEventListener("click", async e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "leave") {
    sessionStorage.removeItem("ee-room"); player.room = ""; state = null; draft = "";
    history.replaceState({}, "", location.pathname);
    ws?.close(); ws = null; render(); connect(); return;
  }
  if (action === "copy") {
    const link = location.origin + "/?room=" + encodeURIComponent(state.room);
    try { await navigator.clipboard.writeText(link); toast("Invite link copied!"); }
    catch { toast("Invite link: " + link); } return;
  }
  if (action === "create" || action === "demo" || action === "join") {
    const name = (document.getElementById("display-name")?.value || "").trim();
    if (!name) { toast("Enter your alias first."); return; }
    player.name = name; localStorage.setItem("ee-name", name);
    if (action === "join") {
      const room = (document.getElementById("room-code")?.value || "").trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{5}$/.test(room)) { toast("Enter the 5-character room code."); return; }
      send({ type: "join", room, name, token: player.token });
    } else send({ type: "create", name, token: player.token, demo: action === "demo" });
    return;
  }
  if (action === "vote") { send({ type: "vote", answerId: el.dataset.id }); return; }
  if (["start", "next", "replay"].includes(action)) send({ type: action });
});
setInterval(updateCountdown, 300);
render();
connect();
