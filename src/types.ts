// Shapes mirror the server's hostView / playerView in server/game.mjs.

export type Team = "townsfolk" | "outsider" | "minion" | "demon" | "traveler";
export type Edition = "tb" | "bmr" | "snv";

export interface Role {
  id: string;
  name: string;
  edition: Edition;
  team: Team;
  ability: string;
  firstNight: number;
  firstNightReminder: string;
  otherNight: number;
  otherNightReminder: string;
  reminders: string[];
  remindersGlobal: string[];
  setup: boolean;
}

export interface Phase {
  type: "setup" | "night" | "day";
  count: number;
}

export interface Reminder {
  id: string;
  characterId: string;
  label: string;
}

export interface HostSeat {
  id: string;
  index: number;
  name: string;
  claimed: boolean;
  connected: boolean;
  characterId: string | null;
  shownCharacterId: string | null;
  roleRevealed: boolean;
  alive: boolean;
  ghostVoteUsed: boolean;
  poisoned: boolean;
  drunk: boolean;
  reminders: Reminder[];
}

export interface Nomination {
  id: string;
  nominatorSeatId: string;
  nomineeSeatId: string;
  open: boolean;
  count: number;
  votes: Record<string, boolean>;
  yourVote?: boolean | null;
}

export interface DayState {
  nominators: string[]; // seats that have used their nomination this day
  nominees: string[]; // seats that have been nominated this day
  executedSeatId: string | null;
  noExecution: boolean;
}

export type PromptKind = "choose" | "info" | "confirm" | "grimoire";

export interface GrimoireSeatView {
  index: number;
  name: string;
  characterId: string | null;
  alive: boolean;
  reminders: string[];
}

// The full prompt as the host sees it (with the player's response).
export interface HostPrompt {
  id: string;
  seatId: string;
  kind: PromptKind;
  title: string;
  body: string;
  min?: number;
  max?: number;
  candidates?: string[] | null;
  showToPlayer: boolean;
  response: { seatIds: string[]; value: boolean | null } | null;
}

// The trimmed prompt a player's phone receives.
export interface PlayerPrompt {
  id: string;
  kind: PromptKind;
  title: string;
  body: string;
  min: number;
  max: number;
  candidates: { id: string; name: string }[];
  responded: boolean;
  grimoire?: GrimoireSeatView[];
}

export interface HostState {
  role: "host";
  id: string;
  code: string;
  edition: Edition;
  phase: Phase;
  stepIndex: number;
  bluffs: (string | null)[];
  day: DayState;
  prompt: HostPrompt | null;
  announcement: Announcement | null;
  nomination: Nomination | null;
  seats: HostSeat[];
}

export interface Announcement {
  title: string;
  body: string;
}

export interface PlayerSeat {
  id: string;
  index: number;
  name: string;
  alive: boolean;
  ghostVoteAvailable: boolean;
  isYou: boolean;
}

export interface PlayerState {
  role: "player";
  id: string;
  code: string;
  edition: Edition;
  phase: Phase;
  threshold: number;
  aliveCount: number;
  allRevealed: boolean;
  you: {
    seatId: string;
    name: string;
    alive: boolean;
    ghostVoteAvailable: boolean;
    characterId: string | null;
    roleRevealed: boolean;
  } | null;
  seats: PlayerSeat[];
  nomination: Nomination | null;
  prompt: PlayerPrompt | null;
  announcement: Announcement | null;
}

export type GameState = HostState | PlayerState;

// Host actions sent over the WebSocket (see RoomStore.applyHostAction).
export type HostAction =
  | { kind: "setPhase"; phase: Phase }
  | { kind: "setStep"; index: number }
  | { kind: "addSeat"; name?: string }
  | { kind: "removeSeat"; seatId: string }
  | { kind: "renameSeat"; seatId: string; name: string }
  | { kind: "moveSeat"; seatId: string; toIndex: number }
  | { kind: "assignCharacter"; seatId: string; characterId: string | null }
  | { kind: "setShownCharacter"; seatId: string; characterId: string | null }
  | { kind: "revealRole"; seatId: string; revealed: boolean }
  | { kind: "revealAll" }
  | { kind: "setAlive"; seatId: string; alive: boolean }
  | { kind: "setGhostVoteUsed"; seatId: string; used: boolean }
  | { kind: "setStatus"; seatId: string; key: "poisoned" | "drunk"; value: boolean }
  | { kind: "addReminder"; seatId: string; characterId: string; label: string }
  | { kind: "removeReminder"; seatId: string; reminderId: string }
  | { kind: "setBluffs"; bluffs: (string | null)[] }
  | { kind: "nominate"; nominatorSeatId: string; nomineeSeatId: string }
  | { kind: "setVote"; seatId: string; vote: boolean }
  | { kind: "closeNomination" }
  | { kind: "clearNomination" }
  | { kind: "recordExecution"; seatId: string | null }
  | {
      kind: "openPrompt";
      prompt: {
        seatId: string;
        kind: PromptKind;
        title: string;
        body: string;
        min?: number;
        max?: number;
        candidates?: string[] | null;
        showToPlayer: boolean;
      };
    }
  | { kind: "clearPrompt" }
  | { kind: "setAnnouncement"; title: string; body: string }
  | { kind: "clearAnnouncement" }
  | { kind: "resetGame" };
