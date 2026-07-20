// Unit test for the death-aware night walkthrough (buildNightSteps) + win checks.
import { buildNightSteps, computeWin, NIGHT_ACTIONS, DAY_STEPS } from "../src/roles.ts";

let fail = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

const role = (id, name, team, firstNight, otherNight) => ({
  id, name, team, firstNight, otherNight,
  firstNightReminder: `${name} FN`, otherNightReminder: `${name} ON`,
  ability: "", reminders: [], remindersGlobal: [], setup: false, edition: "tb",
});

const byId = new Map([
  ["poisoner", role("poisoner", "Poisoner", "minion", 17, 8)],
  ["imp", role("imp", "Imp", "demon", 0, 24)],
  ["empath", role("empath", "Empath", "townsfolk", 35, 53)],
]);

const seat = (id, characterId, alive) => ({ id, characterId, alive });

// Poisoner was executed during the day; Imp + Empath alive.
const seats = [
  seat("s1", "poisoner", false),
  seat("s2", "imp", true),
  seat("s3", "empath", true),
];

const plan = buildNightSteps(seats, byId, "other", false);
const names = plan.steps.map((s) => s.name);
ok(!names.includes("Poisoner"), "dead Poisoner is NOT in the night walkthrough");
ok(plan.skipped.includes("Poisoner"), "Poisoner is reported as skipped (dead)");
ok(names.includes("Imp") && names.includes("Empath"), "living characters still appear");
ok(names[0] === "Dusk" && names[names.length - 1] === "Dawn", "Dusk first, Dawn last");
// Imp (otherNight 24) before Empath (53)
ok(names.indexOf("Imp") < names.indexOf("Empath"), "other-night order respects the data");

// With includeDead, the Poisoner shows again, flagged dead.
const plan2 = buildNightSteps(seats, byId, "other", true);
const poi = plan2.steps.find((s) => s.name === "Poisoner");
ok(!!poi && poi.dead === true, "includeDead brings the dead Poisoner back, flagged dead");

// First night: minion/demon info appear and skip dead minions.
const plan3 = buildNightSteps(seats, byId, "first", false);
const n3 = plan3.steps.map((s) => s.name);
ok(!n3.includes("Minion info"), "dead-only Minions -> no Minion info step");
ok(n3.includes("Demon info & bluffs"), "living Demon -> Demon info step present");

// --- Win conditions -------------------------------------------------------
byId.set("saint", role("saint", "Saint", "outsider", 0, 0));
const st = (seats, extra = {}) => ({
  phase: { type: "day", count: 1 },
  seats,
  day: { nominators: [], nominees: [], executedSeatId: null, noExecution: false },
  ...extra,
});
const wseat = (id, characterId, alive) => ({ id, characterId, alive });

ok(computeWin({ ...st([]), phase: { type: "setup", count: 0 } }, byId) === null, "setup: no win yet");

const deadDemon = computeWin(st([wseat("a", "imp", false), wseat("b", "empath", true)]), byId);
ok(deadDemon?.winner === "good", "demon dead -> good wins");

const twoLeft = computeWin(st([wseat("a", "imp", true), wseat("b", "empath", true)]), byId);
ok(twoLeft?.winner === "evil", "demon alive + 2 players -> evil wins");

const saintOut = computeWin(
  st([wseat("a", "imp", true), wseat("b", "saint", false), wseat("c", "empath", true), wseat("d", "poisoner", true)], {
    day: { nominators: [], nominees: [], executedSeatId: "b", noExecution: false },
  }),
  byId,
);
ok(saintOut?.winner === "evil", "Saint executed -> evil wins");

const ongoing = computeWin(
  st([wseat("a", "imp", true), wseat("b", "empath", true), wseat("c", "poisoner", true), wseat("d", "saint", true)]),
  byId,
);
ok(ongoing === null, "healthy mid-game -> no win");

// --- Night actions + scripts ----------------------------------------------
ok(NIGHT_ACTIONS.grandmother?.when === "first", "Grandmother acts on the first night only");
ok(NIGHT_ACTIONS.grandmother?.reminder === "Grandchild", "Grandmother drops a Grandchild marker");
ok(NIGHT_ACTIONS.professor?.pool === "dead", "Professor targets DEAD players");
ok(NIGHT_ACTIONS.professor?.effect === "revive", "Professor revives");
ok(
  ["washerwoman", "librarian", "investigator", "dreamer", "sage"].every((id) => NIGHT_ACTIONS[id]),
  "info/selection roles all have a target picker",
);
ok(DAY_STEPS.every((d) => typeof d.script === "string" && d.script.length > 0), "every day step has a spoken script");

// First-night meta steps carry ST scripts.
byId.set("grandmother", role("grandmother", "Grandmother", "townsfolk", 40, 51));
const fnPlan = buildNightSteps(
  [wseat("a", "imp", true), wseat("b", "poisoner", true), wseat("c", "grandmother", true)],
  byId,
  "first",
);
ok(/first night/i.test(fnPlan.steps[0].script || ""), "Dusk has a first-night script");
ok(fnPlan.steps.some((x) => x.name === "Minion info" && x.script), "Minion info has a script");
ok(fnPlan.steps.some((x) => x.name === "Grandmother"), "Grandmother appears in the first-night order");

console.log(fail ? `\n${fail} FAILED` : "\nnight + win + actions/scripts OK");
process.exit(fail ? 1 : 0);
