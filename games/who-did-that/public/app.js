"use strict";
const app = document.getElementById("app");
const statusEl = document.getElementById("connection");
const toastEl = document.getElementById("toast");
const invite = new URLSearchParams(location.search).get("room");
const savedRoom = sessionStorage.getItem("wdt-room");
let player = {
  room: savedRoom && (!invite || invite.toUpperCase() === savedRoom) ? savedRoom : "",
  token: sessionStorage.getItem("wdt-token") || "",
  name: localStorage.getItem("wdt-name") || ""
};
let ws, game = null, popupTimer, lastPhase = "";
function html(v) {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&quot;", "'": "&#39;" }[c]));
}
function notify(msg) {
  toastEl.textContent = msg; toastEl.classList.add("show");
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
}
function send(message) {
  if (ws?.readyState !== WebSocket.OPEN) { notify("Reconnecting. Try again."); return false; }
  ws.send(JSON.stringify(message)); return true;
}
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  ws.addEventListener("open", () => {
    statusEl.textContent = "LIVE";
    document.querySelector(".dot").classList.add("online");
    if (player.room && player.token) send({ type: "join", room: player.room, token: player.token });
    else render();
  });
  ws.addEventListener("close", () => {
    statusEl.textContent = "RECONNECTING";
    document.querySelector(".dot").classList.remove("online");
    setTimeout(connect, 1300);
  });
  ws.addEventListener("message", e => {
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    if (d.type === "error") {
      notify(d.message);
      if (d.message.includes("Room not found") || d.message.includes("game has already started")) {
        sessionStorage.removeItem("wdt-room"); sessionStorage.removeItem("wdt-token");
        player.room = ""; player.token = ""; game = null;
        render();
      }
      return;
    }
    if (d.type === "joined") {
      player.room = d.room; player.token = d.token;
      sessionStorage.setItem("wdt-room", d.room);
      sessionStorage.setItem("wdt-token", d.token);
      history.replaceState({}, "", "?room=" + encodeURIComponent(d.room));
    }
    if (d.type === "state") {
      const previousPhase = lastPhase;
      game = d; lastPhase = d.phase;
      render();
      if (previousPhase !== d.phase && (d.phase === "reveal" || d.phase === "finished")) confetti();
    }
  });
}
function playerCard(p, disabled = false) {
  return '<button class="person ' + (disabled ? 'disabled' : '') + '" data-action="vote" data-target="' +
    html(p.id) + '" ' + (disabled ? "disabled" : "") + '><span class="person-avatar">' +
    html(p.name.charAt(0)) + '</span><span class="person-name">' + html(p.name) +
    (p.id === game.you ? ' <small>(YOU)</small>' : '') +
    '</span><span class="point">👉</span></button>';
}
function scores() {
  return [...game.players].sort((a,b) => b.score-a.score).map((p,i) =>
    '<div class="score-item"><span class="rank">' + String(i+1).padStart(2,"0") + '</span>' +
    '<span class="score-person">' + html(p.name) + (p.id === game.you ? ' <small>YOU</small>' : '') +
    '</span><b>' + p.score + ' <small>VOTES</small></b></div>').join("");
}
function landing() {
  const room = html((invite || "").toUpperCase().slice(0,5));
  app.innerHTML = '<div class="landing">' +
    '<section class="landing-hero"><div class="mini-label">THE GAME WHERE NO ONE IS INNOCENT</div>' +
    '<h1>WHO<br>DID <span>THAT<span class="punct">?!</span></span></h1>' +
    '<p>A ridiculously simple party game. Five silly questions. Secret votes. Public embarrassment.</p>' +
    '<div class="illustration" aria-hidden="true"><div class="bubble">SUS!</div><div class="face">😳</div><div class="arrow">↘</div><div class="finger">👉</div><div class="spark">✦</div></div>' +
    '</section><section class="entry-card"><div class="entry-number">01 / START THE FUN</div>' +
    '<h2>Bring your friends.</h2><label for="name">WHAT SHOULD WE CALL YOU?</label>' +
    '<input id="name" maxlength="20" placeholder="Your nickname" value="' + html(player.name) + '"/>' +
    '<button class="btn primary" data-action="create">CREATE A ROOM <span>↗</span></button>' +
    '<button class="btn secondary" data-action="demo">PLAY WITH DEMO BOTS <span>✳</span></button>' +
    '<div class="join-title">HAVE A ROOM CODE?</div>' +
    '<div class="join"><input id="code" maxlength="5" placeholder="ABCDE" aria-label="Room code" value="' + room + '"/>' +
    '<button class="btn small" data-action="join">JOIN →</button></div>' +
    '<p class="hint">Play instantly in your browser. No download. No sign-in.</p></section>' +
    '</div><div class="how"><span>01 · READ A SILLY QUESTION</span><span>02 · VOTE FOR A FRIEND</span><span>03 · SEE WHO GOT EXPOSED!</span></div>';
}
function lobby() {
  app.innerHTML = '<section class="centered screen">' +
    '<div class="mini-label">THE USUAL SUSPECTS</div><h1 class="screen-title">GATHER THE <em>GUILTY.</em></h1>' +
    '<div class="room-banner"><div class="entry-number">YOUR ROOM CODE</div><div class="big-code">' + html(game.room) +
    '</div><button class="btn secondary" data-action="copy">COPY INVITE LINK ↗</button></div>' +
    '<p class="intro">Friends join with this code. Everyone gets the same questions, at the same time.</p>' +
    '<div class="people-list">' + game.players.map(p => '<div class="person-small"><span class="round-avatar">' +
    html(p.name.charAt(0)) + '</span><b>' + html(p.name) + '</b>' +
    (p.bot ? '<small>DEMO</small>' : p.host ? '<small>HOST</small>' : '') +
    (!p.online ? '<small>OFFLINE</small>' : '') + '</div>').join("") + '</div>' +
    (game.isHost ? '<button class="btn primary big-action" data-action="start" ' + (game.players.length < 2 ? 'disabled' : '') +
    '>START GAME <span>→</span></button>' : '<p class="waiting">WAITING FOR THE HOST TO START…</p>') +
    '<button class="text-button" data-action="leave">← LEAVE ROOM</button></section>';
}
function countdown() {
  return '<div class="time"><span class="clock">◷</span><span id="timer">25</span><small>SEC</small></div>';
}
function vote() {
  const suspects = game.players.map(p => playerCard(p, p.id === game.you || !p.online || game.yourVote)).join("");
  app.innerHTML = '<section class="screen">' +
    '<div class="game-line"><div class="round-marker">ROUND ' + game.round + ' / ' + game.maxRounds + '</div>' + countdown() + '</div>' +
    '<div class="question-tag">🤔 THE QUESTION IS…</div><h1 class="question">' + html(game.question) + '</h1>' +
    '<p class="intro">Point the finger! Vote secretly for the friend most likely to do this.</p>' +
    '<div class="vote-title">' + (game.yourVote ? 'VOTE LOCKED 🔒' : 'PICK YOUR SUSPECT 👇') +
    '<span>' + game.votedCount + ' / ' + game.players.filter(p => p.online).length + ' VOTED</span></div>' +
    '<div class="people-grid">' + suspects + '</div>' +
    (game.yourVote ? '<div class="waiting">YOUR VOTE IS IN. AWAITING THE BIG REVEAL…</div>' : '') +
    '<p class="hint">You can’t vote for yourself. You only get one vote.</p></section>';
}
function verdict() {
  const tally = game.tally || {};
  const sorted = [...game.players].sort((a,b) => (tally[b.id] || 0)-(tally[a.id] || 0));
  const winners = sorted.filter(p => game.roundWinners.includes(p.id));
  const lead = winners.length ? winners.map(p => p.name).join(" & ") : "Nobody";
  app.innerHTML = '<section class="screen centered reveal-screen">' +
    '<div class="mini-label">ROUND ' + game.round + ' · THE RESULTS ARE IN</div>' +
    '<div class="sticker">🚨 BUSTED! 🚨</div>' +
    '<h1 class="screen-title">THE CHIEF<br><em>SUSPECT' + (winners.length > 1 ? 'S' : '') + '!</em></h1>' +
    '<div class="suspect-name">' + html(lead) + '</div>' +
    '<div class="result-subtitle">' + (winners.length ? 'ACCUSATIONS RECEIVED. EXPLANATIONS DENIED.' : 'Apparently everyone is innocent. Suspicious.') + '</div>' +
    '<div class="result-grid">' + sorted.map((p,i) => {
      const count = tally[p.id] || 0;
      return '<div class="result-card" style="--i:' + i + '"><div class="result-avatar">' +
        html(p.name.charAt(0)) + '</div><div class="result-name">' + html(p.name) + '</div>' +
        '<div class="result-bar"><i style="--pct:' + Math.min(100,count * 100 / Math.max(1,game.lastResult?.votesCast || 1)) +
        '%"></i></div><b>' + count + ' VOTE' + (count===1?'':'S') + '</b></div>';
    }).join("") + '</div>' +
    (game.isHost ? '<button class="btn primary big-action" data-action="next">' +
    (game.round >= game.maxRounds ? 'FINAL RESULTS ↗' : 'NEXT QUESTION →') + '</button>' :
    '<p class="waiting">WAITING FOR THE NEXT QUESTION…</p>') + '</section>';
}
function finished() {
  const ordered = [...game.players].sort((a,b) => b.score-a.score);
  const winningScore = ordered[0]?.score || 0;
  const winners = ordered.filter(p => p.score === winningScore);
  app.innerHTML = '<section class="screen centered final-screen"><div class="mini-label">FIVE QUESTIONS. SO MANY ALLEGATIONS.</div>' +
    '<div class="trophy">🏆</div><h1 class="screen-title">THE MOST<br><em>ACCUSED.</em></h1>' +
    '<div class="champion">' + html(winners.map(p => p.name).join(" & ")) + '</div>' +
    '<p class="intro">Congratulations. Your friends clearly cannot be trusted.</p>' +
    '<div class="scoreboard">' + scores() + '</div>' +
    (game.isHost ? '<button class="btn primary big-action" data-action="again">PLAY AGAIN ↗</button>' :
    '<p class="waiting">WAITING FOR THE HOST TO PLAY AGAIN…</p>') +
    '<button class="text-button" data-action="leave">← BACK TO HOME</button></section>';
}
function render() {
  if (!game) landing();
  else if (game.phase === "lobby") lobby();
  else if (game.phase === "voting") vote();
  else if (game.phase === "reveal") verdict();
  else if (game.phase === "finished") finished();
  tick();
}
function tick() {
  const el = document.getElementById("timer");
  if (!el || !game || !game.deadline) return;
  const left = Math.max(0, Math.ceil((game.deadline - Date.now()) / 1000));
  el.textContent = String(left).padStart(2, "0");
  el.parentElement.classList.toggle("last-seconds", left <= 5);
}
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#efec62","#a791fc","#f879c9","#7fecce","#ffffff"];
  const div = document.createElement("div"); div.className = "confetti"; div.setAttribute("aria-hidden","true");
  for (let i = 0; i < 36; i++) {
    const p = document.createElement("span");
    p.style.setProperty("--x", Math.random() * 100 + "%");
    p.style.setProperty("--delay", Math.random() * .65 + "s");
    p.style.setProperty("--dur", 1.7 + Math.random() * 1.4 + "s");
    p.style.setProperty("--rot", Math.random() * 600 + "deg");
    p.style.background = colors[i % colors.length];
    div.appendChild(p);
  }
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}
app.addEventListener("click", async e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (["create","demo","join"].includes(action)) {
    const name = document.getElementById("name")?.value.trim();
    if (!name) { notify("Enter a nickname first!"); return; }
    player.name = name; localStorage.setItem("wdt-name", name);
    if (action === "join") {
      const room = document.getElementById("code").value.trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{5}$/.test(room)) return notify("Use the five-character room code.");
      send({ type: "join", name, room });
    } else send({ type: "create", name, demo: action === "demo" });
    return;
  }
  if (action === "copy") {
    const link = location.origin + "/?room=" + encodeURIComponent(game.room);
    try { await navigator.clipboard.writeText(link); notify("Invite link copied!"); }
    catch { notify("Room code: " + game.room); }
    return;
  }
  if (action === "vote") { if (send({ type: "vote", target: btn.dataset.target })) btn.disabled = true; return; }
  if (["start","next","again"].includes(action)) { send({ type: action }); return; }
  if (action === "leave") {
    player.room = ""; player.token = ""; game = null; lastPhase = "";
    sessionStorage.removeItem("wdt-room"); sessionStorage.removeItem("wdt-token");
    history.replaceState({}, "", location.pathname);
    ws?.close(); ws = null; render(); connect();
  }
});
setInterval(tick, 250);
render();
connect();
