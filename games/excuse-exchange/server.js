"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const MAX_PLAYERS = 8;
const MAX_ROUNDS = 5;
const WRITE_MS = 60000;
const VOTE_MS = 30000;
const rooms = new Map();

const scenarios = [
  "The office printer has started printing everyone's secrets.",
  "Someone replaced the company CEO with a very confident goose.",
  "The moon is missing and your group chat is being investigated.",
  "All the town's traffic lights are now controlled by a hamster.",
  "Your team accidentally scheduled a wedding on Mars.",
  "The cafeteria is serving soup that predicts the future.",
  "A robot intern has promoted itself to Supreme Manager.",
  "The school's mascot has declared independence.",
  "The mayor's speech was replaced with a recipe for spaghetti.",
  "A penguin has been elected head of cybersecurity.",
  "Your spaceship's autopilot will only accept compliments.",
  "The museum's dinosaur skeleton has joined a dating app.",
  "An entire city has received the same mysterious pizza order.",
  "Every meeting invitation now includes a live goat.",
  "The company accidentally sent one million rubber ducks to the moon.",
  "A time traveler has demanded a refund for next Tuesday."
];
const wildcards = ["banana", "grandma", "glitter", "spaghetti", "goose", "socks", "wifi", "potato", "unicorn", "microwave", "pigeon", "taxes"];
const botNames = ["Captain Oops", "Auntie Chaos", "Professor Panic"];
const botExcuses = [
  "The banana was acting CEO and signed the paperwork in glitter.",
  "I consulted my grandma, who said this is exactly what pigeons want.",
  "Legally speaking, the potato is in charge of the entire operation.",
  "The goose demanded a promotion and our wifi couldn't say no.",
  "I did everything correctly until a unicorn audited the microwave.",
  "We can fix this with spaghetti, twelve socks, and some confidence."
];

function cleanName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 20) : "";
}
function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 5; i++) result += chars[crypto.randomInt(chars.length)];
  return result;
}
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function error(ws, message) { send(ws, { type: "error", message }); }
function roster(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, score: p.score, online: p.online, bot: p.bot, host: p.id === room.hostId
  }));
}
function entries(room) {
  return [...room.answers.entries()].map(([id, answer]) => ({
    id: answer.publicId, text: answer.text,
    ...(room.phase === "reveal" || room.phase === "final"
      ? { author: room.players.get(id)?.name || "Unknown", authorId: id } : {})
  }));
}
function publicState(room, playerId) {
  const player = room.players.get(playerId);
  return {
    type: "state", room: room.code, phase: room.phase, round: room.round,
    maxRounds: MAX_ROUNDS, prompt: room.prompt, wildcard: room.wildcard,
    endsAt: room.endsAt, players: roster(room), you: playerId,
    isHost: room.hostId === playerId, yourName: player?.name || "",
    submitted: room.answers.has(playerId), voted: room.votes.has(playerId),
    answerCount: room.answers.size, voteCount: room.votes.size,
    choices: ["vote", "reveal", "final"].includes(room.phase) ? entries(room) : [],
    yourAnswerId: room.answers.get(playerId)?.publicId || null,
    results: room.phase === "reveal" || room.phase === "final" ? room.results : null
  };
}
function broadcast(room) {
  room.touched = Date.now();
  for (const p of room.players.values()) if (!p.bot) send(p.socket, publicState(room, p.id));
}
function getRoom(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room || !room.players.has(ws.playerId)) { error(ws, "Join a room first."); return null; }
  if (room.players.get(ws.playerId).socket !== ws) return null;
  return room;
}
function newRoom(ws, msg) {
  if (ws.roomCode) { error(ws, "You are already in a room."); return; }
  const name = cleanName(msg.name);
  if (!name) { error(ws, "Enter a player name."); return; }
  const token = typeof msg.token === "string" && /^[\w-]{8,90}$/.test(msg.token) ? msg.token : crypto.randomUUID();
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();
  const player = { id: token, name, score: 0, online: true, bot: false, socket: ws };
  const room = {
    code: roomCode, hostId: token, players: new Map([[token, player]]),
    phase: "lobby", round: 0, prompt: "", wildcard: "", endsAt: null,
    answers: new Map(), votes: new Map(), results: null, touched: Date.now(), used: new Set()
  };
  rooms.set(roomCode, room);
  ws.roomCode = roomCode; ws.playerId = token;
  if (msg.demo) {
    for (const botName of botNames) {
      const id = "bot-" + crypto.randomUUID();
      room.players.set(id, { id, name: botName, score: 0, online: true, bot: true, socket: null });
    }
  }
  send(ws, { type: "joined", room: roomCode, token });
  broadcast(room);
}
function joinRoom(ws, msg) {
  if (ws.roomCode) { error(ws, "You are already in a room."); return; }
  const roomCode = String(msg.room || "").trim().toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) { error(ws, "Room not found. Check the 5-character code."); return; }
  const name = cleanName(msg.name);
  const token = typeof msg.token === "string" && /^[\w-]{8,90}$/.test(msg.token) ? msg.token : crypto.randomUUID();
  let player = room.players.get(token);
  if (!player) {
    if (room.phase !== "lobby") { error(ws, "This game is already in progress. Join the next game."); return; }
    if (room.players.size >= MAX_PLAYERS) { error(ws, "This room is full."); return; }
    if (!name) { error(ws, "Enter a player name."); return; }
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) {
      error(ws, "That name is taken in this room."); return;
    }
    player = { id: token, name, score: 0, online: true, bot: false, socket: ws };
    room.players.set(token, player);
  } else {
    if (player.bot) { error(ws, "Invalid player session."); return; }
    if (player.socket && player.socket !== ws) player.socket.close(4000, "Reconnected");
    player.socket = ws; player.online = true;
  }
  ws.roomCode = roomCode; ws.playerId = token;
  send(ws, { type: "joined", room: roomCode, token });
  broadcast(room);
}
function chooseScenario(room) {
  const remaining = scenarios.filter((_, i) => !room.used.has(i));
  if (!remaining.length) room.used.clear();
  const available = scenarios.map((_, i) => i).filter(i => !room.used.has(i));
  const index = available[crypto.randomInt(available.length)];
  room.used.add(index);
  return scenarios[index];
}
function startRound(room) {
  room.round++;
  room.phase = "write";
  room.prompt = chooseScenario(room);
  room.wildcard = wildcards[crypto.randomInt(wildcards.length)];
  room.endsAt = Date.now() + WRITE_MS;
  room.answers = new Map();
  room.votes = new Map();
  room.results = null;
  for (const p of room.players.values()) if (p.bot) {
    const base = botExcuses[crypto.randomInt(botExcuses.length)];
    const text = base + " Also, " + room.wildcard + ".";
    room.answers.set(p.id, { text: text.slice(0, 180), publicId: crypto.randomUUID() });
  }
  broadcast(room);
}
function beginVoting(room) {
  if (room.phase !== "write") return;
  room.phase = "vote";
  room.endsAt = Date.now() + VOTE_MS;
  const all = [...room.answers.entries()];
  for (const p of room.players.values()) if (p.bot) {
    const eligible = all.filter(([id]) => id !== p.id);
    if (eligible.length) {
      const target = eligible[crypto.randomInt(eligible.length)][1];
      room.votes.set(p.id, target.publicId);
    }
  }
  broadcast(room);
  if (allVoted(room)) reveal(room);
}
function allSubmitted(room) {
  return [...room.players.values()].filter(p => p.bot || p.online).every(p => room.answers.has(p.id));
}
function allVoted(room) {
  return [...room.players.values()].filter(p => p.bot || p.online).every(p => room.votes.has(p.id));
}
function reveal(room) {
  if (room.phase !== "vote") return;
  const counts = new Map();
  for (const publicId of room.votes.values()) counts.set(publicId, (counts.get(publicId) || 0) + 1);
  const results = [];
  for (const [id, answer] of room.answers) {
    const votes = counts.get(answer.publicId) || 0;
    const bonus = answer.text.toLowerCase().includes(room.wildcard.toLowerCase()) ? 1 : 0;
    const gained = votes * 3 + bonus;
    const player = room.players.get(id);
    if (player) player.score += gained;
    results.push({ id: answer.publicId, author: player?.name || "Unknown",
      authorId: id, text: answer.text, votes, bonus, gained });
  }
  results.sort((a, b) => b.votes - a.votes || b.gained - a.gained);
  room.results = results;
  room.phase = "reveal";
  room.endsAt = null;
  broadcast(room);
}
function handle(ws, raw) {
  if (raw.length > 4096) { error(ws, "Message too large."); return; }
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { error(ws, "Invalid message."); return; }
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "create") return newRoom(ws, msg);
  if (msg.type === "join") return joinRoom(ws, msg);
  const room = getRoom(ws);
  if (!room) return;
  const player = room.players.get(ws.playerId);
  if (msg.type === "start") {
    if (room.hostId !== ws.playerId || room.phase !== "lobby") return;
    if (room.players.size < 3) { error(ws, "Invite at least 2 friends, or try the solo demo."); return; }
    startRound(room); return;
  }
  if (msg.type === "submit") {
    if (room.phase !== "write" || room.answers.has(player.id)) return;
    const value = typeof msg.text === "string" ? msg.text.trim().replace(/\s+/g, " ") : "";
    if (value.length < 8 || value.length > 180) {
      error(ws, "Write an excuse between 8 and 180 characters."); return;
    }
    room.answers.set(player.id, { text: value, publicId: crypto.randomUUID() });
    if (allSubmitted(room)) beginVoting(room); else broadcast(room);
    return;
  }
  if (msg.type === "vote") {
    if (room.phase !== "vote" || room.votes.has(player.id)) return;
    const selected = [...room.answers.entries()].find(([, a]) => a.publicId === msg.answerId);
    if (!selected || selected[0] === player.id) { error(ws, "Pick another player's excuse."); return; }
    room.votes.set(player.id, msg.answerId);
    if (allVoted(room)) reveal(room); else broadcast(room);
    return;
  }
  if (msg.type === "next") {
    if (room.hostId !== player.id || room.phase !== "reveal") return;
    if (room.round >= MAX_ROUNDS) { room.phase = "final"; room.endsAt = null; broadcast(room); }
    else startRound(room);
    return;
  }
  if (msg.type === "replay") {
    if (room.hostId !== player.id || room.phase !== "final") return;
    for (const p of room.players.values()) p.score = 0;
    room.round = 0; room.used.clear(); startRound(room);
  }
}
function tick() {
  const now = Date.now();
  for (const [roomCode, room] of rooms) {
    if (now - room.touched > 4 * 60 * 60 * 1000) { rooms.delete(roomCode); continue; }
    if (room.endsAt && now >= room.endsAt) {
      if (room.phase === "write") beginVoting(room);
      else if (room.phase === "vote") reveal(room);
    }
  }
}
const root = path.join(__dirname, "public");
const staticFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"]
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return;
  }
  const file = staticFiles[url.pathname];
  if (!file) { res.writeHead(404); res.end("Not found"); return; }
  fs.readFile(path.join(root, file[0]), (err, data) => {
    if (err) { res.writeHead(500); res.end("Server error"); return; }
    res.writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'" });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
wss.on("connection", (ws) => {
  ws.on("message", raw => {
    try { handle(ws, raw); } catch (err) { console.error("Game event failed", err); error(ws, "Something went wrong. Try again."); }
  });
  ws.on("close", () => {
    const room = rooms.get(ws.roomCode);
    const player = room?.players.get(ws.playerId);
    if (player && player.socket === ws) {
      player.online = false; player.socket = null;
      if (room.hostId === player.id) {
        const nextHost = [...room.players.values()].find(p => p.online && !p.bot);
        if (nextHost) room.hostId = nextHost.id;
      }
      if (room.phase === "write" && allSubmitted(room)) beginVoting(room);
      else if (room.phase === "vote" && allVoted(room)) reveal(room);
      else broadcast(room);
    }
  });
});
const interval = setInterval(tick, 1000);
interval.unref();
if (require.main === module) server.listen(PORT, "0.0.0.0", () => console.log("The Excuse Exchange listening on " + PORT));
module.exports = { server, rooms, scenarios, wildcards, cleanName, code, tick };
