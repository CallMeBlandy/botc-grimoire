import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import QRCode from "qrcode";
import { RoomStore, hostView, playerView } from "./game.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === "production";

const store = new RoomStore();
await store.load();

// Cache roles.json in memory.
let ROLES = [];
try {
  ROLES = JSON.parse(await readFile(path.join(root, "data", "roles.json"), "utf8"));
} catch {
  console.warn("\n⚠  data/roles.json not found — run `npm run fetch-roles` first.\n");
}

const app = express();
app.use(express.json());

// --- REST -----------------------------------------------------------------
app.get("/api/roles", (_req, res) => res.json(ROLES));

app.post("/api/rooms", (req, res) => {
  const edition = ["tb", "bmr", "snv"].includes(req.body?.edition)
    ? req.body.edition
    : "tb";
  const room = store.createRoom(edition);
  res.json({ roomId: room.id, code: room.code, hostToken: room.hostToken });
});

// Resolve a join code to a room id (for players).
app.get("/api/room/:code", (req, res) => {
  const room = store.getRoomByCode(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ roomId: room.id, code: room.code, edition: room.edition });
});

app.get("/api/qr", async (req, res) => {
  const text = String(req.query.text || "");
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const dataUrl = await QRCode.toDataURL(text, { margin: 1, width: 320 });
    res.json({ dataUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LAN addresses so the host can share a join URL that phones can reach.
app.get("/api/net", (_req, res) => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) ips.push(ni.address);
    }
  }
  res.json({ ips, port: Number(PORT) });
});

// --- Static (production only; dev is served by Vite) ----------------------
if (PROD) {
  const dist = path.join(root, "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    console.warn("⚠  dist/ not found — run `npm run build` before `npm start`.");
  }
}

const server = createServer(app);

// --- WebSocket hub --------------------------------------------------------
const wss = new WebSocketServer({ server, path: "/ws" });

/** roomId -> Set<ws> */
const hub = new Map();

function broadcast(room) {
  const conns = hub.get(room.id);
  if (!conns) return;
  for (const ws of conns) {
    if (ws.readyState !== ws.OPEN) continue;
    const view = ws.isHost ? hostView(room) : playerView(room, ws.seatId);
    ws.send(JSON.stringify({ type: "state", state: view }));
  }
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws) => {
  ws.isHost = false;
  ws.roomId = null;
  ws.seatId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    try {
      handle(ws, msg);
    } catch (e) {
      send(ws, { type: "error", message: e.message });
    }
  });

  ws.on("close", () => {
    const room = ws.roomId && store.getRoom(ws.roomId);
    hub.get(ws.roomId)?.delete(ws);
    if (room && ws.seatId) {
      const seat = room.seats.find((s) => s.id === ws.seatId);
      if (seat) {
        // Only mark disconnected if no other socket holds this seat.
        const stillHere = [...(hub.get(ws.roomId) || [])].some(
          (o) => o.seatId === ws.seatId,
        );
        if (!stillHere) {
          seat.connected = false;
          broadcast(room);
        }
      }
    }
  });
});

function attachToHub(ws, room) {
  if (!hub.has(room.id)) hub.set(room.id, new Set());
  hub.get(room.id).add(ws);
  ws.roomId = room.id;
}

function handle(ws, msg) {
  switch (msg.type) {
    case "host:attach": {
      const room = store.getRoom(msg.roomId);
      if (!room) throw new Error("Room not found");
      if (room.hostToken !== msg.hostToken) throw new Error("Bad host token");
      ws.isHost = true;
      attachToHub(ws, room);
      send(ws, { type: "state", state: hostView(room) });
      break;
    }

    case "player:attach": {
      const room = store.getRoom(msg.roomId);
      if (!room) throw new Error("Room not found");
      const seat = store.joinPlayer(room, msg.name, msg.playerToken);
      seat.connected = true;
      ws.seatId = seat.id;
      attachToHub(ws, room);
      // Give the player their token so they can reconnect to the same seat.
      send(ws, {
        type: "identity",
        playerToken: seat.playerToken,
        seatId: seat.id,
      });
      broadcast(room);
      break;
    }

    case "host:action": {
      if (!ws.isHost) throw new Error("Not the host");
      const room = store.getRoom(ws.roomId);
      if (!room) throw new Error("Room gone");
      store.applyHostAction(room, msg.action);
      broadcast(room);
      break;
    }

    case "player:vote": {
      const room = store.getRoom(ws.roomId);
      if (!room || !ws.seatId) throw new Error("Not seated");
      store.applyPlayerVote(room, ws.seatId, msg.vote);
      broadcast(room);
      break;
    }

    case "player:promptResponse": {
      const room = store.getRoom(ws.roomId);
      if (!room || !ws.seatId) throw new Error("Not seated");
      store.applyPromptResponse(room, ws.seatId, msg.response);
      broadcast(room);
      break;
    }

    case "ping":
      send(ws, { type: "pong" });
      break;

    default:
      throw new Error(`unknown message: ${msg.type}`);
  }
}

server.listen(PORT, () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) ips.push(ni.address);
    }
  }
  console.log(`\n  Blood on the Clocktower grimoire`);
  console.log(`  Storyteller:  http://localhost:${PORT}${PROD ? "" : "  (dev: use http://localhost:5173)"}`);
  for (const ip of ips) console.log(`  On your LAN:   http://${ip}:${PORT}`);
  console.log("");
});
