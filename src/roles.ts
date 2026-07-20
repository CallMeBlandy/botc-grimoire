import type { Edition, HostSeat, Role, Team } from "./types";

export const EDITION_NAMES: Record<Edition, string> = {
  tb: "Trouble Brewing",
  bmr: "Bad Moon Rising",
  snv: "Sects & Violets",
};

export interface EditionInfo {
  tagline: string;
  level: "New players" | "Some experience" | "Experienced";
  about: string;
  why: string;
}

export const EDITION_INFO: Record<Edition, EditionInfo> = {
  tb: {
    tagline: "The classic starting script",
    level: "New players",
    about:
      "The original and best introduction. Straightforward roles that mostly give information (who is what, how many evil neighbours). The Demon (Imp) kills one player each night and can pass to a Minion.",
    why: "Clear, gentle abilities and honest information make it easy to learn deduction and bluffing. This is the one to start with — and it stays fun forever.",
  },
  bmr: {
    tagline: "Death comes fast — protect and survive",
    level: "Some experience",
    about:
      "A deadlier, faster script focused on who dies at night and why. Lots of protection, misdirection and characters that punish careless play. Multiple Demons with very different kill patterns.",
    why: "Great once players know the basics. Night deaths become a puzzle, and roles like the Innkeeper, Exorcist and Gambler create tense risk-reward decisions. Best with players who've played a game or two.",
  },
  snv: {
    tagline: "Nothing is what it seems — madness & misinformation",
    level: "Experienced",
    about:
      "The trickiest base script. Information is unreliable, players can be driven 'mad', and roles like the Cerenovus, Pit-Hag and Vortox twist the truth. Heavy on social manipulation.",
    why: "The most mind-bending of the three. Brilliant for experienced groups who enjoy paranoia and second-guessing everything — but it can overwhelm brand-new players.",
  },
};

export const TEAM_ORDER: Team[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveler",
];

export const TEAM_NAMES: Record<Team, string> = {
  townsfolk: "Townsfolk",
  outsider: "Outsiders",
  minion: "Minions",
  demon: "Demons",
  traveler: "Travellers",
};

export function buildRoleIndex(roles: Role[]) {
  const byId = new Map<string, Role>();
  for (const r of roles) byId.set(r.id, r);
  return byId;
}

export function rolesForEdition(roles: Role[], edition: Edition): Role[] {
  return roles.filter((r) => r.edition === edition && r.team !== "traveler");
}

export function travelersForEdition(roles: Role[], edition: Edition): Role[] {
  return roles.filter((r) => r.edition === edition && r.team === "traveler");
}

export function groupByTeam(roles: Role[]): Record<Team, Role[]> {
  const out = {
    townsfolk: [],
    outsider: [],
    minion: [],
    demon: [],
    traveler: [],
  } as Record<Team, Role[]>;
  for (const r of roles) out[r.team].push(r);
  return out;
}

export interface NightStep {
  role: Role;
  reminder: string;
}

// Build the ordered night sheet for the characters currently in play.
export function nightOrder(
  inPlay: Role[],
  which: "first" | "other",
): NightStep[] {
  const key = which === "first" ? "firstNight" : "otherNight";
  const rem = which === "first" ? "firstNightReminder" : "otherNightReminder";
  return inPlay
    .filter((r) => (r as any)[key] > 0)
    .sort((a, b) => (a as any)[key] - (b as any)[key])
    .map((r) => ({ role: r, reminder: (r as any)[rem] as string }));
}

// --- Guided walkthrough ---------------------------------------------------

export interface WalkStep {
  id: string;
  name: string;
  reminder: string;
  seatIds: string[]; // seats the ST should wake / act on for this step
  role?: Role; // set for character steps
  meta?: boolean; // Dusk / Dawn / info steps
  dead?: boolean; // shown only because "include dead" is on; holder(s) are dead
  script?: string; // suggested words for the ST to say aloud
}

export interface NightPlan {
  steps: WalkStep[];
  skipped: string[]; // character names not woken because their player is dead
}

const DUSK: Omit<WalkStep, "seatIds"> = {
  id: "_dusk",
  name: "Dusk",
  reminder: "Night falls — all players close their eyes.",
  meta: true,
};
const DAWN: Omit<WalkStep, "seatIds"> = {
  id: "_dawn",
  name: "Dawn",
  reminder:
    "Wake the town. Announce any players who died in the night (do not say how). Then begin the day.",
  meta: true,
};

// Build the ordered night walkthrough for the characters currently on seats.
// Meta steps (Dusk, Minion/Demon info, Dawn) are interleaved at their standard
// positions. `which` is "first" on Night 1 and "other" on later nights.
//
// Dead players don't wake, so steps whose only holders are dead are skipped
// (and reported in `skipped`). Pass `includeDead` to show them anyway — useful
// for the rare abilities that act on the night they die (e.g. Ravenkeeper).
export function buildNightSteps(
  seats: HostSeat[],
  byId: Map<string, Role>,
  which: "first" | "other",
  includeDead = false,
): NightPlan {
  const key = which === "first" ? "firstNight" : "otherNight";
  const remKey = which === "first" ? "firstNightReminder" : "otherNightReminder";

  const livingSeatsWithTeam = (team: Team) =>
    seats.filter((s) => {
      const r = s.characterId ? byId.get(s.characterId) : null;
      return r?.team === team && (includeDead || s.alive);
    });

  const entries: { order: number; step: WalkStep }[] = [];
  const skipped: string[] = [];

  // Meta: Minion & Demon info happen only on the first night.
  if (which === "first") {
    const minionSeats = livingSeatsWithTeam("minion");
    const demonSeats = livingSeatsWithTeam("demon");
    if (minionSeats.length)
      entries.push({
        order: 5,
        step: {
          id: "_minioninfo",
          name: "Minion info",
          reminder:
            "Wake all Minions together. Confirm who the Demon is, and let the Minions see each other.",
          script:
            "Minions, open your eyes. (Point to the Demon.) This player is your Demon. Look around — these are your fellow Minions. Now close your eyes.",
          seatIds: minionSeats.map((s) => s.id),
          meta: true,
        },
      });
    if (demonSeats.length)
      entries.push({
        order: 9, // just after Lunatic (8), before Poisoner (17) etc.
        step: {
          id: "_demoninfo",
          name: "Demon info & bluffs",
          reminder:
            "Wake the Demon. Show which players are the Minions, then give 3 bluffs (good characters not in play).",
          script:
            "Demon, open your eyes. (Point to each Minion.) These are your Minions. These three characters are NOT in play — you may safely bluff as them. Now close your eyes.",
          seatIds: demonSeats.map((s) => s.id),
          meta: true,
        },
      });
  }

  // Character steps: group seats by the role they ACT as at night. For the
  // Drunk/Lunatic that's the shown role, so they're woken at the right step
  // (their ability still does nothing — the guide flags that separately).
  const byRole = new Map<string, HostSeat[]>();
  for (const s of seats) {
    const effId = effectiveCharacterId(s);
    if (!effId) continue;
    let arr = byRole.get(effId);
    if (!arr) byRole.set(effId, (arr = []));
    arr.push(s);
  }
  for (const [roleId, roleSeats] of byRole) {
    const role = byId.get(roleId);
    if (!role) continue;
    const order = (role as any)[key] as number;
    if (!order || order <= 0) continue;

    const living = roleSeats.filter((s) => s.alive);
    if (living.length === 0 && !includeDead) {
      // The player who holds this role is dead — they don't wake.
      skipped.push(role.name);
      continue;
    }
    const useSeats = includeDead ? roleSeats : living;
    entries.push({
      order,
      step: {
        id: role.id,
        name: role.name,
        reminder: (role as any)[remKey] || role.ability,
        seatIds: useSeats.map((s) => s.id),
        role,
        dead: living.length === 0,
      },
    });
  }

  entries.sort((a, b) => a.order - b.order);

  const duskScript =
    which === "first"
      ? "It's your first night. Everyone, close your eyes and keep them closed — don't react as I move around the circle. I'll wake you when it's your turn."
      : "Night is falling. Everyone, close your eyes.";

  return {
    steps: [
      { ...DUSK, seatIds: [], script: duskScript },
      ...entries.map((e) => e.step),
      {
        ...DAWN,
        seatIds: [],
        script:
          "Everyone, open your eyes and wake up. (Announce who died in the night — do not say how or reveal their character.)",
      },
    ],
    skipped,
  };
}

// Roles whose player must be SHOWN a different character (they don't know
// their true role). `team` is what the shown character should be.
export const SHOWN_AS: Record<string, { team: Team; note: string }> = {
  drunk: { team: "townsfolk", note: "The Drunk thinks they are this Townsfolk. Their ability doesn't work." },
  lunatic: { team: "demon", note: "The Lunatic thinks they are this Demon. Their 'kills' don't happen." },
};

// The character a seat effectively behaves as at night (what the ST wakes them
// as, to keep the illusion): the shown role if one is set, else the true role.
export function effectiveCharacterId(seat: {
  characterId: string | null;
  shownCharacterId: string | null;
}): string | null {
  return seat.shownCharacterId ?? seat.characterId;
}

// Characters that make the ST pick target player(s) at night. The guide opens
// a picker for these; `effect` is applied to the chosen player(s). Roles not
// listed (pure-info roles like Empath, Washerwoman) just use their reminder
// text — the ST tells the player directly.
export type NightEffect =
  | "kill"
  | "poison"
  | "protect"
  | "select"
  | "fortune"
  | "revive";

export interface NightAction {
  effect: NightEffect;
  min: number;
  max: number;
  prompt: string; // shown in the ST dialog and (optionally) on the player's phone
  reminder?: string; // reminder token dropped on the chosen player(s)
  when?: "first" | "other"; // limit the action to the first or later nights only
  pool?: "alive" | "dead" | "all"; // who can be targeted (default: alive)
}

export const NIGHT_ACTIONS: Record<string, NightAction> = {
  // Trouble Brewing
  poisoner: { effect: "poison", min: 1, max: 1, prompt: "Choose a player to poison.", reminder: "Poisoned" },
  monk: { effect: "protect", min: 1, max: 1, prompt: "Choose a player (not yourself) to protect from the Demon tonight.", reminder: "Protected" },
  imp: { effect: "kill", min: 1, max: 1, prompt: "Choose a player to kill. (Choosing yourself is the star-pass.)" },
  butler: { effect: "select", min: 1, max: 1, prompt: "Choose your master — you may only vote if they do.", reminder: "Master" },
  fortuneteller: { effect: "fortune", min: 2, max: 2, prompt: "Choose 2 players. Answer YES if either is the Demon (or the red herring), otherwise NO." },
  ravenkeeper: { effect: "select", min: 1, max: 1, prompt: "You died tonight — choose a player; you learn their character." },
  // First-night info roles: point to the players, then place a marker.
  washerwoman: { effect: "select", min: 2, max: 2, when: "first", prompt: "Point to 2 players and show a Townsfolk token — one of them is that Townsfolk.", reminder: "Seen" },
  librarian: { effect: "select", min: 0, max: 2, when: "first", prompt: "Point to 2 players and show an Outsider token — one is that Outsider. (Or say 'zero' if no Outsiders are in play — pick none.)", reminder: "Seen" },
  investigator: { effect: "select", min: 2, max: 2, when: "first", prompt: "Point to 2 players and show a Minion token — one of them is that Minion.", reminder: "Seen" },

  // Bad Moon Rising
  grandmother: { effect: "select", min: 1, max: 1, when: "first", prompt: "Choose a good player and show the Grandmother their character. If the Demon kills this player, the Grandmother dies too.", reminder: "Grandchild" },
  professor: { effect: "revive", min: 1, max: 1, when: "other", pool: "dead", prompt: "Once per game: choose a dead player. If they are a Townsfolk, they come back to life.", reminder: "No ability" },
  godfather: { effect: "kill", min: 1, max: 1, prompt: "If an Outsider died today, choose a player to kill." },
  assassin: { effect: "kill", min: 1, max: 1, prompt: "Once per game: you may choose a player to kill (even if they'd survive)." },
  devilsadvocate: { effect: "select", min: 1, max: 1, prompt: "Choose a living player — if executed tomorrow, they don't die.", reminder: "Survives execution" },
  zombuul: { effect: "kill", min: 1, max: 1, prompt: "If no one died today, choose a player to kill." },
  pukka: { effect: "poison", min: 1, max: 1, prompt: "Choose a player to poison. The player you poisoned previously now dies.", reminder: "Poisoned" },
  shabaloth: { effect: "kill", min: 1, max: 2, prompt: "Choose up to 2 players to kill. (A player who died last night may be regurgitated.)" },
  po: { effect: "kill", min: 1, max: 3, prompt: "Choose a player to kill; or, if you killed no one last night, choose 3 players." },
  sailor: { effect: "select", min: 1, max: 1, prompt: "Choose a player — you or they are drunk until dusk tomorrow.", reminder: "Drunk?" },
  innkeeper: { effect: "protect", min: 2, max: 2, prompt: "Choose 2 players — they can't die tonight, but one of them is drunk.", reminder: "Protected" },
  exorcist: { effect: "select", min: 1, max: 1, prompt: "Choose a player (different each night). If it's the Demon, it learns you and doesn't act tonight." },
  gambler: { effect: "select", min: 1, max: 1, prompt: "Choose a player and guess their character; if wrong, you die." },
  chambermaid: { effect: "select", min: 2, max: 2, prompt: "Choose 2 players — learn how many of them woke tonight for their ability." },

  // Sects & Violets
  dreamer: { effect: "select", min: 1, max: 1, prompt: "Choose a player (not yourself/Travellers). Show 1 good and 1 evil character — one of them is correct.", reminder: "Seen" },
  sage: { effect: "select", min: 2, max: 2, when: "other", pool: "all", prompt: "Only if the Sage died tonight: point to 2 players — one of them is the Demon.", reminder: "Sage sees" },
  fanggu: { effect: "kill", min: 1, max: 1, prompt: "Choose a player to kill. (The first Outsider killed becomes an evil Fang Gu instead.)" },
  vigormortis: { effect: "kill", min: 1, max: 1, prompt: "Choose a player to kill. Killed Minions keep their ability." },
  nodashii: { effect: "kill", min: 1, max: 1, prompt: "Choose a player to kill." },
  vortox: { effect: "kill", min: 1, max: 1, prompt: "Choose a player to kill. (All Townsfolk info is false; if no execution today, evil wins.)" },
  witch: { effect: "select", min: 1, max: 1, prompt: "Choose a player — if they nominate tomorrow, they die.", reminder: "Cursed" },
  cerenovus: { effect: "select", min: 1, max: 1, prompt: "Choose a player and a character; they are 'mad' they are that character tomorrow.", reminder: "Mad" },
  pithag: { effect: "select", min: 1, max: 1, prompt: "Choose a player and a character; that player becomes that character." },
  seamstress: { effect: "select", min: 2, max: 2, prompt: "Choose 2 players (not yourself) — learn if they are the same alignment." },
  snakecharmer: { effect: "select", min: 1, max: 1, prompt: "Choose a player — if it's the Demon, you swap characters and it becomes poisoned." },
};

import type { HostState } from "./types";

export interface WinResult {
  winner: "good" | "evil";
  reason: string;
}

// Detect the core BotC win conditions. Returned as a *possible* result the ST
// confirms — character exceptions (Scarlet Woman promotion, Mayor, Vortox,
// etc.) mean the Storyteller always has the final say.
export function computeWin(
  s: HostState,
  byId: Map<string, Role>,
): WinResult | null {
  if (s.phase.type === "setup") return null;
  const withChar = s.seats.filter((x) => x.characterId);
  if (withChar.length === 0) return null;

  const demons = withChar.filter((x) => byId.get(x.characterId!)?.team === "demon");
  const demonInPlay = demons.length > 0;
  const demonAlive = demons.some((x) => x.alive);
  const living = s.seats.filter((x) => x.alive).length;

  // Saint executed -> evil wins immediately.
  const exec = s.day.executedSeatId
    ? s.seats.find((x) => x.id === s.day.executedSeatId)
    : null;
  if (exec && exec.characterId && byId.get(exec.characterId)?.id === "saint")
    return { winner: "evil", reason: `The Saint (${exec.name}) was executed.` };

  if (demonInPlay && !demonAlive)
    return { winner: "good", reason: "No Demon is alive." };

  if (demonAlive && living <= 2)
    return { winner: "evil", reason: "Only 2 players remain alive." };

  return null;
}

export interface DayStep {
  id: string;
  title: string;
  text: string;
  script: string;
}

export const DAY_STEPS: DayStep[] = [
  {
    id: "deaths",
    title: "Announce the night",
    text: "The town is awake. Announce who died in the night — mark them dead on the grimoire. Don't reveal how they died or their character.",
    script:
      "Good morning, everyone. (If someone died:) Sadly, [name] did not survive the night. (If nobody died:) Remarkably, everyone survived the night.",
  },
  {
    id: "discuss",
    title: "Discussion",
    text: "Players talk freely — sharing (or bluffing) information and hunting the Demon. Keep an eye on the clock.",
    script:
      "You may now talk amongst yourselves. Share what you know, make your accusations, and try to find the Demon.",
  },
  {
    id: "nominations",
    title: "Nominations",
    text: "Open the floor. Each living player may nominate once, and each player may be nominated once per day. Tap a seat → Nominate to start a vote.",
    script:
      "Nominations are now open. Any living player may nominate one other player for execution. Who would you like to nominate?",
  },
  {
    id: "voting",
    title: "Voting & execution",
    text: "Go around the circle; players raise hands (vote on their phones). A nominee needs votes from at least half the living players AND more than any other nominee to go on the block. A tie puts no one up.",
    script:
      "[Nominator] nominates [nominee]. [Nominee], you may say a few words in your defence. Now — raise your hand to vote for execution. Voting… 3, 2, 1 — hands down.",
  },
  {
    id: "endday",
    title: "End the day",
    text: "Execute the player on the block (if any) — mark them dead. Check win conditions, then move to the night.",
    script:
      "That concludes the day. (If there's an execution:) [name] has been executed. Everyone, close your eyes — night is falling.",
  },
];

export const SETUP_CHECK = [
  "Give every player a seat (they auto-seat as they join, or add seats).",
  "Assign a character to each seat using the setup chart.",
  "Set 3 Demon bluffs (good characters not in play).",
  "Reveal each character to its player (they see it on their phone).",
  "When everyone's ready, begin Night 1.",
];

// Standard team composition for N players (official BotC setup chart).
// [townsfolk, outsiders, minions, demons]
const SETUP: Record<number, [number, number, number, number]> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

export function setupFor(playerCount: number): [number, number, number, number] | null {
  return SETUP[playerCount] ?? null;
}
