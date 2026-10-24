"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const MAX_PLAYERS = 8;
const MAX_ROUNDS = 5;
const VOTE_TIME_MS = 25000;
const ROOM_IDLE_MS = 60 * 60 * 1000;
const rooms = new Map();
const QUESTIONS = [
  "Who would accidentally send a love letter to their boss?",
  "Who would survive a zombie apocalypse by making friends with the zombies?",
  "Who would get fired on their first day for being too honest?",
  "Who would accidentally become famous for falling down stairs?",
  "Who would try to bribe a police officer with jollof rice?",
  "Who would join a reality show without reading the contract?",
  "Who would spend the group's vacation budget on snacks?",
  "Who would argue with a GPS and somehow win?",
  "Who would text 'I miss you' to the wrong group chat?",
  "Who would mistakenly join a secret society through a Zoom link?",
  "Who would tell a ghost to start paying rent?",
  "Who would get lost in their own neighborhood?",
  "Who would accidentally become president of a fan club?",
  "Who would start a podcast during an alien invasion?",
  "Who would cry because their AI assistant said 'we need to talk'?",
  "Who would sell the moon and call it a startup?",
  "Who would give a parking ticket to a spaceship?",
  "Who would have a serious argument with a talking refrigerator?",
  "Who would accidentally invite their ex to a surprise party?",
  "Who would show up to an interview wearing slippers?"
];
const BOTS = ["Auntie Chaos", "Captain Oops", "Professor Drama"];
const index = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]]
]);
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function roomCode() {
  return Array.from({ length: 5 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}
function cleanName(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 20) : "";
}
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function reject(ws, message) { send(ws, { type: "error", message }); }
function board(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, score: p.score,
    online: p.online, bot: p.bot, host: room.host === p.id
  }));
}
function state(room, id) {
  const tally = {};
  if (room.phase === "reveal" || room.phase === "finished") {
    for (const votedId of room.votes.values()) tally[votedId] = (tally[votedId] || 0) + 1;
  }
  const totalVotes = room.votes.size;
  return {
    type: "state", room: room.code, phase: room.phase,
    round: room.round, maxRounds: MAX_ROUNDS, question: room.question,
    deadline: room.deadline, players: board(room), you: id,
    isHost: room.host === id, yourVote: room.votes.has(id),
    votedCount: totalVotes, tally,
    roundWinners: room.phase === "reveal" ? room.roundWinners : [],
    lastResult: room.phase === "reveal" ? room.lastResult : null
  };
}
function broadcast(room) {
  room.updatedAt = Date.now();
  for (const p of room.players.values()) if (!p.bot) send(p.socket, state(room, p.id));
}
function newGame(ws, data) {
  if (ws.playerId) return reject(ws, "Leave your current room first.");
  if (rooms.size >= 250) return reject(ws, "Too many active rooms. Try again shortly.");
  const name = cleanName(data.name);
  if (!name) return reject(ws, "Enter a name to play.");
  const token = crypto.randomUUID();
  let code = roomCode();
  while (rooms.has(code)) code = roomCode();
  const room = {
    code, host: token, players: new Map(), phase: "lobby", round: 0,
    question: "", deadline: null, votes: new Map(), used: new Set(),
    roundWinners: [], lastResult: null, updatedAt: Date.now()
  };
  room.players.set(token, { id: token, name, bot: false, online: true, score: 0, socket: ws });
  if (data.demo === true) for (const botName of BOTS) {
    const id = "bot-" + crypto.randomUUID();
    room.players.set(id, { id, name: botName, bot: true, online: true, score: 0, socket: null });
  }
  rooms.set(code, room);
  ws.playerId = token; ws.roomCode = code;
  send(ws, { type: "joined", room: code, token });
  broadcast(room);
}
function joinGame(ws, data) {
  if (ws.playerId) return reject(ws, "Leave your current room first.");
  const code = String(data.room || "").trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) return reject(ws, "Room not found. Check your invite code.");
  const incoming = String(data.token || "");
  let player = room.players.get(incoming);
  if (player) {
    if (player.bot) return reject(ws, "Invalid player session.");
    if (player.socket && player.socket !== ws) player.socket.close(4000, "Reconnected");
    player.socket = ws;
    player.online = true;
  } else {
    if (room.phase !== "lobby") return reject(ws, "That game has already started.");
    if (room.players.size >= MAX_PLAYERS) return reject(ws, "This room is full.");
    const name = cleanName(data.name);
    if (!name) return reject(ws, "Enter a name to join.");
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase()))
      return reject(ws, "Someone in the room has that name. Try another.");
    const token = crypto.randomUUID();
    player = { id: token, name, bot: false, online: true, score: 0, socket: ws };
    room.players.set(token, player);
  }
  ws.playerId = player.id; ws.roomCode = code;
  send(ws, { type: "joined", room: code, token: player.id });
  broadcast(room);
}
function chooseQuestion(room) {
  if (room.used.size >= QUESTIONS.length) room.used.clear();
  const possible = QUESTIONS.map((_, i) => i).filter(i => !room.used.has(i));
  const i = possible[crypto.randomInt(possible.length)];
  room.used.add(i);
  return QUESTIONS[i];
}
function everyVoted(room) {
  return [...room.players.values()].filter(p => p.online).every(p => room.votes.has(p.id));
}
function startRound(room) {
  room.round += 1; room.phase = "voting"; room.question = chooseQuestion(room);
  room.votes.clear(); room.roundWinners = []; room.lastResult = null;
  room.deadline = Date.now() + VOTE_TIME_MS;
  const players = [...room.players.values()];
  for (const bot of players.filter(p => p.bot)) {
    const targets = players.filter(p => p.id !== bot.id && p.online);
    if (targets.length) room.votes.set(bot.id, targets[crypto.randomInt(targets.length)].id);
  }
  broadcast(room);
}
function reveal(room) {
  if (room.phase !== "voting") return;
  const counts = new Map();
  for (const targetId of room.votes.values()) counts.set(targetId, (counts.get(targetId) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const highest = sorted[0]?.[1] || 0;
  room.roundWinners = highest ? sorted.filter(([, n]) => n === highest).map(([id]) => id) : [];
  for (const [id, count] of counts) {
    const p = room.players.get(id);
    if (p) p.score += count;
  }
  room.lastResult = { votesCast: room.votes.size, highest };
  room.phase = "reveal"; room.deadline = null;
  broadcast(room);
}
function endGame(room) {
  room.phase = "finished"; room.deadline = null;
  broadcast(room);
}
function handle(ws, raw) {
  if (raw.length > 2048) return reject(ws, "Message too large.");
  let data;
  try { data = JSON.parse(raw.toString()); } catch { return reject(ws, "Invalid message."); }
  if (!data || typeof data.type !== "string") return;
  if (data.type === "create") return newGame(ws, data);
  if (data.type === "join") return joinGame(ws, data);
  const room = rooms.get(ws.roomCode);
  const player = room?.players.get(ws.playerId);
  if (!room || !player || player.socket !== ws) return reject(ws, "Join a room first.");
  if (data.type === "start") {
    if (room.host !== player.id || room.phase !== "lobby") return;
    if (room.players.size < 2) return reject(ws, "At least 2 players are needed.");
    return startRound(room);
  }
  if (data.type === "vote") {
    if (room.phase !== "voting" || room.votes.has(player.id)) return;
    const target = room.players.get(String(data.target || ""));
    if (!target || !target.online || target.id === player.id)
      return reject(ws, "Vote for another player.");
    room.votes.set(player.id, target.id);
    if (everyVoted(room)) reveal(room);
    else broadcast(room);
    return;
  }
  if (data.type === "next") {
    if (room.host !== player.id || room.phase !== "reveal") return;
    return room.round >= MAX_ROUNDS ? endGame(room) : startRound(room);
  }
  if (data.type === "again") {
    if (room.host !== player.id || room.phase !== "finished") return;
    room.round = 0; room.used.clear();
    for (const p of room.players.values()) p.score = 0;
    return startRound(room);
  }
}
const publicDir = path.join(__dirname, "public");
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ ok: true }));
  }
  const item = index.get(pathname);
  if (!item) { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(path.join(publicDir, item[0]), (err, data) => {
    if (err) { res.writeHead(500); return res.end("Server error"); }
    res.writeHead(200, {
      "Content-Type": item[1], "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none'"
    });
    res.end(data);
  });
});
const sockets = new WebSocketServer({ server, path: "/ws", maxPayload: 2048 });
sockets.on("connection", ws => {
  ws.on("message", raw => {
    try { handle(ws, raw); } catch (err) { console.error(err); reject(ws, "Please try again."); }
  });
  ws.on("close", () => {
    const room = rooms.get(ws.roomCode);
    const player = room?.players.get(ws.playerId);
    if (!player || player.socket !== ws) return;
    player.socket = null; player.online = false;
    if (room.host === player.id) {
      const next = [...room.players.values()].find(p => p.online && !p.bot);
      if (next) room.host = next.id;
    }
    if (room.phase === "voting" && everyVoted(room)) reveal(room);
    else broadcast(room);
  });
});
const maintenance = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_IDLE_MS) {
      for (const p of room.players.values()) if (!p.bot && p.socket) p.socket.close(4001, "Room expired");
      rooms.delete(code); continue;
    }
    if (room.phase === "voting" && now >= room.deadline) reveal(room);
  }
}, 500);
maintenance.unref();
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, "0.0.0.0", () => console.log("Who Did That?! ready on " + port));
}
module.exports = { server, rooms, QUESTIONS, roomCode, cleanName };
