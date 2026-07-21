// End-to-end WebSocket smoke test: host + player, role reveal, nomination, vote.
import WebSocket from "ws";

const BASE = process.env.BASE || "http://localhost:3001";
const WS = BASE.replace("http", "ws") + "/ws";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, label) {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
}

function open(onMessage) {
  const ws = new WebSocket(WS);
  ws.on("message", (d) => onMessage(JSON.parse(d.toString())));
  return new Promise((res) => ws.on("open", () => res(ws)));
}

const send = (ws, m) => ws.send(JSON.stringify(m));

async function main() {
  const room = await (
    await fetch(`${BASE}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edition: "tb" }),
    })
  ).json();
  check(!!room.hostToken, "created room");

  let hostState = null;
  const host = await open((m) => {
    if (m.type === "state") hostState = m.state;
  });
  send(host, { type: "host:attach", roomId: room.roomId, hostToken: room.hostToken });
  await wait(150);
  check(hostState?.role === "host", "host attached & got host view");

  let playerState = null;
  let identity = null;
  const player = await open((m) => {
    if (m.type === "state") playerState = m.state;
    if (m.type === "identity") identity = m;
  });
  send(player, { type: "player:attach", roomId: room.roomId, name: "Tester" });
  await wait(150);
  check(!!identity?.playerToken, "player got identity token");
  check(playerState?.seats?.length === 1, "player sees 1 seat");
  check(hostState?.seats?.length === 1 && hostState.seats[0].connected, "host sees the connected seat");

  const seatId = hostState.seats[0].id;

  // Assign + reveal a role; player should learn only their own character.
  send(host, { type: "host:action", action: { kind: "assignCharacter", seatId, characterId: "imp" } });
  send(host, { type: "host:action", action: { kind: "revealRole", seatId, revealed: true } });
  await wait(150);
  check(playerState?.you?.characterId === "imp", "player sees their revealed role (imp)");

  // Before reveal is hidden the player must NOT see it.
  send(host, { type: "host:action", action: { kind: "revealRole", seatId, revealed: false } });
  await wait(150);
  check(playerState?.you?.characterId === null, "hidden role is not leaked to player");

  // Shown-as (Drunk): the player must see the SHOWN role, never their true one.
  send(host, { type: "host:action", action: { kind: "assignCharacter", seatId, characterId: "drunk" } });
  send(host, { type: "host:action", action: { kind: "setShownCharacter", seatId, characterId: "washerwoman" } });
  send(host, { type: "host:action", action: { kind: "revealRole", seatId, revealed: true } });
  await wait(150);
  check(playerState?.you?.characterId === "washerwoman", "player sees the SHOWN role (Washerwoman)");
  check(playerState?.you?.characterId !== "drunk", "player never sees they are really the Drunk");
  check(hostState?.seats?.[0]?.characterId === "drunk", "host still sees the true role (Drunk)");
  check(hostState?.seats?.[0]?.shownCharacterId === "washerwoman", "host sees what the player is shown");
  check(playerState?.allRevealed === true, "allRevealed true once every assigned seat is revealed");
  // Reassigning must drop the stale shown role.
  send(host, { type: "host:action", action: { kind: "assignCharacter", seatId, characterId: "imp" } });
  await wait(120);
  check(hostState?.seats?.[0]?.shownCharacterId === null, "reassigning clears the shown role");
  send(host, { type: "host:action", action: { kind: "revealRole", seatId, revealed: true } });
  await wait(120);

  // Nomination + player vote.
  send(host, { type: "host:action", action: { kind: "nominate", nominatorSeatId: seatId, nomineeSeatId: seatId } });
  await wait(120);
  send(player, { type: "player:vote", vote: true });
  await wait(150);
  check(hostState?.nomination?.count === 1, "host tally reflects player vote");
  check(playerState?.nomination?.yourVote === true, "player sees their own vote");

  // Poison/drunk: host tracks it; it must NEVER reach the player.
  send(host, { type: "host:action", action: { kind: "setStatus", seatId, key: "poisoned", value: true } });
  await wait(120);
  check(hostState?.seats?.[0]?.poisoned === true, "host sees the seat as poisoned");
  check(playerState?.you?.poisoned === undefined, "poisoned status is NOT leaked to the player");

  // Guide: step pointer advances, and changing phase resets it.
  send(host, { type: "host:action", action: { kind: "setStep", index: 4 } });
  await wait(120);
  check(hostState?.stepIndex === 4, "guide step pointer updates");
  send(host, { type: "host:action", action: { kind: "setPhase", phase: { type: "night", count: 1 } } });
  await wait(120);
  check(hostState?.stepIndex === 0, "changing phase resets the guide step");
  check(hostState?.phase?.type === "night", "phase advanced to night");
  check(hostState?.seats?.[0]?.poisoned === false, "poison auto-expired when night began");

  // Day + nominations (needs a second seat).
  send(host, { type: "host:action", action: { kind: "setPhase", phase: { type: "day", count: 1 } } });
  send(host, { type: "host:action", action: { kind: "addSeat", name: "Bob" } });
  await wait(150);
  const s2 = hostState.seats[1].id;
  send(host, { type: "host:action", action: { kind: "nominate", nominatorSeatId: seatId, nomineeSeatId: s2 } });
  await wait(120);
  check(hostState?.nomination?.nomineeSeatId === s2, "nomination created during the day");
  send(host, { type: "host:action", action: { kind: "clearNomination" } });
  await wait(100);
  send(host, { type: "host:action", action: { kind: "nominate", nominatorSeatId: seatId, nomineeSeatId: s2 } });
  await wait(120);
  check(hostState?.nomination === null, "re-nominating a used nominator/nominee is blocked");
  check(hostState?.day?.nominees?.includes(s2), "nominee tracked for the day");

  // Execution marks the player dead and is recorded.
  send(host, { type: "host:action", action: { kind: "recordExecution", seatId: s2 } });
  await wait(120);
  check(hostState?.seats?.find((x) => x.id === s2)?.alive === false, "execution marks the nominee dead");
  check(hostState?.day?.executedSeatId === s2, "execution recorded for the day");

  // Push a full-screen prompt to the player's phone and get their answer back.
  send(host, {
    type: "host:action",
    action: {
      kind: "openPrompt",
      prompt: { seatId, kind: "choose", title: "Choose", body: "pick", min: 1, max: 1, candidates: [s2], showToPlayer: true },
    },
  });
  await wait(150);
  check(playerState?.prompt?.title === "Choose", "player receives the pushed full-screen prompt");
  check(playerState?.prompt?.candidates?.length === 1, "prompt candidates delivered to the player");
  send(player, { type: "player:promptResponse", response: { seatIds: [s2] } });
  await wait(150);
  check(hostState?.prompt?.response?.seatIds?.[0] === s2, "player's prompt answer returns to the host");

  // Room-wide announcement shows on every phone.
  send(host, { type: "host:action", action: { kind: "setAnnouncement", title: "Good team wins! 🕊", body: "No Demon is alive." } });
  await wait(120);
  check(hostState?.announcement?.title?.includes("Good"), "host tracks the announcement");
  check(playerState?.announcement?.title?.includes("Good"), "announcement shows full-screen on the player");
  send(host, { type: "host:action", action: { kind: "clearAnnouncement" } });
  await wait(120);
  check(playerState?.announcement === null, "announcement clears on players");

  // Grimoire prompt (Spy): the whole board is pushed to that player's phone.
  send(host, {
    type: "host:action",
    action: { kind: "openPrompt", prompt: { seatId, kind: "grimoire", title: "The Grimoire", body: "look", showToPlayer: true } },
  });
  await wait(150);
  check(playerState?.prompt?.kind === "grimoire", "grimoire prompt reaches the player");
  check(
    Array.isArray(playerState?.prompt?.grimoire) &&
      playerState.prompt.grimoire.length === hostState.seats.length,
    "grimoire lists every seat",
  );
  check(playerState?.prompt?.grimoire?.[0]?.characterId === "imp", "grimoire reveals true roles to the Spy");

  host.close();
  player.close();
  await wait(100);
  console.log(failures ? `\n${failures} FAILED` : "\nAll WebSocket checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("smoke test error:", e);
  process.exit(1);
});
