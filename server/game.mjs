import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DATA_DIR = path.join(root, "data");
const ROOMS_FILE = path.join(DATA_DIR, "rooms.json");

const shortId = () => nanoid(8);
const token = () => nanoid(24);

// A short human-friendly room code (join code) — avoids ambiguous chars.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function roomCode() {
  let s = "";
  for (let i = 0; i < 4; i++) {
    // deterministic-free randomness is fine here (not gameplay-affecting).
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

function newSeat(name) {
  return {
    id: shortId(),
    name: name || "New player",
    playerToken: null, // set when a phone claims this seat
    connected: false,
    characterId: null,
    shownCharacterId: null, // what the PLAYER sees instead (Drunk/Lunatic etc.)
    roleRevealed: false, // has the ST revealed this seat's character to the player?
    alive: true,
    ghostVoteUsed: false, // dead players get one vote for the game
    poisoned: false, // ability malfunctions; player is NOT told
    drunk: false, // thinks they have their ability but don't; NOT told
    reminders: [], // { id, characterId, label }
  };
}

function newRoom(edition) {
  const id = shortId();
  return {
    id,
    code: roomCode(),
    hostToken: token(),
    edition, // 'tb' | 'bmr' | 'snv'  (which script the ST is running)
    phase: { type: "setup", count: 0 }, // setup | night | day
    stepIndex: 0, // pointer into the current phase's guided walkthrough
    seats: [],
    bluffs: [null, null, null], // 3 demon-bluff character ids
    nomination: null, // { id, nominatorSeatId, nomineeSeatId, open, votes:{seatId:bool} }
    day: { nominators: [], nominees: [], executedSeatId: null, noExecution: false },
    prompt: null, // active full-screen prompt pushed to a player (or ST-only)
    announcement: null, // room-wide full-screen message shown to every phone
    createdAt: Date.now(),
  };
}

function freshDay() {
  return { nominators: [], nominees: [], executedSeatId: null, noExecution: false };
}

export class RoomStore {
  constructor() {
    /** @type {Map<string, any>} */
    this.rooms = new Map();
    /** roomId -> code index */
    this.byCode = new Map();
    this._saveTimer = null;
  }

  async load() {
    try {
      const raw = await readFile(ROOMS_FILE, "utf8");
      const arr = JSON.parse(raw);
      for (const r of arr) {
        // Everyone starts disconnected after a server restart.
        for (const s of r.seats) s.connected = false;
        // Migrate rooms saved before these fields existed.
        if (!r.day) r.day = freshDay();
        if (r.prompt === undefined) r.prompt = null;
        if (r.announcement === undefined) r.announcement = null;
        this.rooms.set(r.id, r);
        this.byCode.set(r.code, r.id);
      }
      console.log(`Loaded ${this.rooms.size} saved room(s).`);
    } catch {
      // No saved state yet — fine.
    }
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save().catch((e) => console.error("save failed:", e.message));
    }, 400);
  }

  async save() {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      ROOMS_FILE,
      JSON.stringify([...this.rooms.values()], null, 2),
    );
  }

  createRoom(edition) {
    const room = newRoom(edition);
    this.rooms.set(room.id, room);
    this.byCode.set(room.code, room.id);
    this._scheduleSave();
    return room;
  }

  getRoom(id) {
    return this.rooms.get(id);
  }

  getRoomByCode(code) {
    const id = this.byCode.get((code || "").toUpperCase());
    return id ? this.rooms.get(id) : undefined;
  }

  // --- Player join / reconnect -------------------------------------------
  // Returns { seat } or throws.
  joinPlayer(room, name, playerToken) {
    // Reconnect: token matches an existing seat.
    if (playerToken) {
      const existing = room.seats.find((s) => s.playerToken === playerToken);
      if (existing) {
        if (name && name.trim()) existing.name = name.trim();
        this._scheduleSave();
        return existing;
      }
    }
    // New player claims the first unclaimed seat, or a fresh seat is added.
    let seat = room.seats.find((s) => !s.playerToken);
    if (!seat) {
      seat = newSeat(name);
      room.seats.push(seat);
    }
    seat.playerToken = token();
    if (name && name.trim()) seat.name = name.trim();
    this._scheduleSave();
    return seat;
  }

  // --- Host actions ------------------------------------------------------
  applyHostAction(room, action) {
    const seat = (id) => room.seats.find((s) => s.id === id);
    switch (action.kind) {
      case "setPhase":
        room.phase = action.phase;
        room.stepIndex = 0; // restart the walkthrough for the new phase
        room.prompt = null; // any open prompt is stale once the phase changes
        if (action.phase.type === "night") {
          // Poison lasts until the next night — it clears as dusk falls, then
          // the Poisoner re-applies it during the walkthrough.
          for (const s of room.seats) s.poisoned = false;
          room.nomination = null;
        }
        if (action.phase.type === "day") {
          room.day = freshDay(); // nomination eligibility resets each day
          room.nomination = null;
        }
        break;

      case "setStep":
        room.stepIndex = Math.max(0, action.index | 0);
        break;

      case "addSeat":
        room.seats.push(newSeat(action.name));
        break;

      case "removeSeat":
        room.seats = room.seats.filter((s) => s.id !== action.seatId);
        break;

      case "renameSeat": {
        const s = seat(action.seatId);
        if (s) s.name = action.name;
        break;
      }

      case "moveSeat": {
        const from = room.seats.findIndex((s) => s.id === action.seatId);
        if (from < 0) break;
        const [s] = room.seats.splice(from, 1);
        const to = Math.max(0, Math.min(room.seats.length, action.toIndex));
        room.seats.splice(to, 0, s);
        break;
      }

      case "assignCharacter": {
        const s = seat(action.seatId);
        if (s) {
          s.characterId = action.characterId;
          s.shownCharacterId = null; // reassigning clears any "shown as"
          if (!action.characterId) s.roleRevealed = false;
        }
        break;
      }

      case "setShownCharacter": {
        const s = seat(action.seatId);
        if (s) s.shownCharacterId = action.characterId || null;
        break;
      }

      case "revealRole": {
        const s = seat(action.seatId);
        if (s) s.roleRevealed = !!action.revealed;
        break;
      }

      case "revealAll": {
        for (const s of room.seats) if (s.characterId) s.roleRevealed = true;
        break;
      }

      case "setAlive": {
        const s = seat(action.seatId);
        if (s) {
          s.alive = !!action.alive;
          if (s.alive) s.ghostVoteUsed = false; // revived -> ghost vote restored
        }
        break;
      }

      case "setGhostVoteUsed": {
        const s = seat(action.seatId);
        if (s) s.ghostVoteUsed = !!action.used;
        break;
      }

      case "setStatus": {
        const s = seat(action.seatId);
        if (s && (action.key === "poisoned" || action.key === "drunk"))
          s[action.key] = !!action.value;
        break;
      }

      case "addReminder": {
        const s = seat(action.seatId);
        if (s)
          s.reminders.push({
            id: shortId(),
            characterId: action.characterId,
            label: action.label,
          });
        break;
      }

      case "removeReminder": {
        const s = seat(action.seatId);
        if (s) s.reminders = s.reminders.filter((r) => r.id !== action.reminderId);
        break;
      }

      case "setBluffs":
        room.bluffs = action.bluffs.slice(0, 3);
        break;

      case "nominate": {
        if (!room.day) room.day = freshDay();
        // Enforce once-per-day: a player may nominate once and be nominated once.
        if (
          room.day.nominators.includes(action.nominatorSeatId) ||
          room.day.nominees.includes(action.nomineeSeatId)
        )
          break;
        room.day.nominators.push(action.nominatorSeatId);
        room.day.nominees.push(action.nomineeSeatId);
        room.nomination = {
          id: shortId(),
          nominatorSeatId: action.nominatorSeatId,
          nomineeSeatId: action.nomineeSeatId,
          open: true,
          votes: {},
        };
        break;
      }

      case "setVote": {
        if (room.nomination)
          room.nomination.votes[action.seatId] = !!action.vote;
        break;
      }

      case "closeNomination":
        if (room.nomination) {
          room.nomination.open = false;
          // Consume ghost votes from dead players who voted yes.
          for (const [seatId, v] of Object.entries(room.nomination.votes)) {
            const s = seat(seatId);
            if (s && !s.alive && v) s.ghostVoteUsed = true;
          }
        }
        break;

      case "clearNomination":
        room.nomination = null;
        break;

      case "recordExecution": {
        // Confirm the day's execution (or that no one was executed).
        if (!room.day) room.day = freshDay();
        if (action.seatId) {
          const s = seat(action.seatId);
          if (s) s.alive = false;
          room.day.executedSeatId = action.seatId;
          room.day.noExecution = false;
        } else {
          room.day.executedSeatId = null;
          room.day.noExecution = true;
        }
        room.nomination = null;
        break;
      }

      case "openPrompt":
        // action.prompt = { seatId, kind, title, body, min, max, candidates, showToPlayer }
        room.prompt = {
          id: shortId(),
          ...action.prompt,
          response: null,
        };
        break;

      case "clearPrompt":
        room.prompt = null;
        break;

      case "setAnnouncement":
        // { title, body } shown full-screen on every player's phone.
        room.announcement = { title: action.title, body: action.body };
        break;

      case "clearAnnouncement":
        room.announcement = null;
        break;

      case "resetGame": {
        room.phase = { type: "setup", count: 0 };
        room.stepIndex = 0;
        room.bluffs = [null, null, null];
        room.nomination = null;
        room.prompt = null;
        room.announcement = null;
        room.day = freshDay();
        for (const s of room.seats) {
          s.characterId = null;
          s.shownCharacterId = null;
          s.roleRevealed = false;
          s.alive = true;
          s.ghostVoteUsed = false;
          s.poisoned = false;
          s.drunk = false;
          s.reminders = [];
        }
        break;
      }

      default:
        throw new Error(`unknown host action: ${action.kind}`);
    }
    this._scheduleSave();
  }

  // Player casting their own vote.
  applyPlayerVote(room, seatId, vote) {
    if (!room.nomination || !room.nomination.open) return;
    const s = room.seats.find((x) => x.id === seatId);
    if (!s) return;
    // Alive players always vote; dead players only if ghost vote unused.
    if (!s.alive && s.ghostVoteUsed) return;
    room.nomination.votes[seatId] = !!vote;
    this._scheduleSave();
  }

  // Player answering a prompt the ST pushed to their phone.
  applyPromptResponse(room, seatId, response) {
    if (!room.prompt || room.prompt.seatId !== seatId) return;
    room.prompt.response = {
      seatIds: Array.isArray(response?.seatIds) ? response.seatIds : [],
      value: response?.value ?? null,
    };
    this._scheduleSave();
  }
}

// --- State views (what each recipient is allowed to see) -----------------

function voteCount(nomination) {
  if (!nomination) return 0;
  return Object.values(nomination.votes).filter(Boolean).length;
}

// Full grimoire — only the Storyteller (host) sees this.
export function hostView(room) {
  return {
    role: "host",
    id: room.id,
    code: room.code,
    edition: room.edition,
    phase: room.phase,
    stepIndex: room.stepIndex ?? 0,
    bluffs: room.bluffs,
    day: room.day ?? { nominators: [], nominees: [], executedSeatId: null, noExecution: false },
    prompt: room.prompt ?? null,
    announcement: room.announcement ?? null,
    nomination: room.nomination
      ? { ...room.nomination, count: voteCount(room.nomination) }
      : null,
    seats: room.seats.map((s, i) => ({
      id: s.id,
      index: i,
      name: s.name,
      claimed: !!s.playerToken,
      connected: s.connected,
      characterId: s.characterId,
      shownCharacterId: s.shownCharacterId ?? null,
      roleRevealed: s.roleRevealed,
      alive: s.alive,
      ghostVoteUsed: s.ghostVoteUsed,
      poisoned: s.poisoned,
      drunk: s.drunk,
      reminders: s.reminders,
    })),
  };
}

// Public + own-role view — what a player's phone receives.
export function playerView(room, seatId) {
  const me = room.seats.find((s) => s.id === seatId);
  const alive = room.seats.filter((s) => s.alive).length;
  // Simple majority threshold for execution (ties don't execute).
  const threshold = Math.ceil(alive / 2);
  const assigned = room.seats.filter((s) => s.characterId);
  const allRevealed = assigned.length > 0 && assigned.every((s) => s.roleRevealed);
  return {
    role: "player",
    id: room.id,
    code: room.code,
    edition: room.edition,
    phase: room.phase,
    threshold,
    aliveCount: alive,
    allRevealed,
    you: me
      ? {
          seatId: me.id,
          name: me.name,
          alive: me.alive,
          ghostVoteAvailable: me.alive ? true : !me.ghostVoteUsed,
          // Private: only your own character, and only once the ST reveals it.
          // If a "shown as" is set (Drunk/Lunatic), the player sees THAT instead
          // of their true role — they must not learn what they really are.
          characterId: me.roleRevealed ? me.shownCharacterId ?? me.characterId : null,
          roleRevealed: me.roleRevealed,
        }
      : null,
    seats: room.seats.map((s, i) => ({
      id: s.id,
      index: i,
      name: s.name,
      alive: s.alive,
      ghostVoteAvailable: s.alive ? true : !s.ghostVoteUsed,
      isYou: s.id === seatId,
    })),
    nomination: room.nomination
      ? {
          id: room.nomination.id,
          nominatorSeatId: room.nomination.nominatorSeatId,
          nomineeSeatId: room.nomination.nomineeSeatId,
          open: room.nomination.open,
          count: voteCount(room.nomination),
          // Votes are public in BotC (hands raised), so players see the tally.
          votes: room.nomination.votes,
          yourVote: me ? room.nomination.votes[me.id] ?? null : null,
        }
      : null,
    // A full-screen instruction/selection the ST pushed to THIS player's phone.
    prompt:
      room.prompt && room.prompt.seatId === seatId && room.prompt.showToPlayer
        ? {
            id: room.prompt.id,
            kind: room.prompt.kind, // 'choose' | 'info' | 'confirm'
            title: room.prompt.title,
            body: room.prompt.body,
            min: room.prompt.min ?? 1,
            max: room.prompt.max ?? 1,
            candidates: (
              room.prompt.candidates ??
              room.seats.filter((s) => s.id !== seatId && s.alive).map((s) => s.id)
            )
              .map((id) => {
                const c = room.seats.find((x) => x.id === id);
                return c ? { id: c.id, name: c.name } : null;
              })
              .filter(Boolean),
            responded: !!room.prompt.response,
          }
        : null,
    announcement: room.announcement ?? null,
  };
}
