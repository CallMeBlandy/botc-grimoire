import { useState } from "react";
import type { HostAction, HostState, Role } from "../types";
import type { NightAction } from "../roles";

interface Props {
  role: Role;
  action: NightAction;
  actingSeatId: string;
  state: HostState;
  act: (a: HostAction) => void;
  onClose: () => void;
}

// Opens when the guide reaches a character who targets player(s) at night.
// The ST can resolve it on their own screen, or push the choice to the acting
// player's phone and get their answer back.
export function NightActionDialog({ role, action, actingSeatId, state, act, onClose }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const actor = state.seats.find((s) => s.id === actingSeatId);
  // Who can be targeted: dead (e.g. Professor revive), everyone, or (default) alive.
  const pool =
    action.pool === "dead"
      ? state.seats.filter((s) => !s.alive)
      : action.pool === "all"
        ? state.seats
        : state.seats.filter((s) => s.alive);
  const name = (id: string) => state.seats.find((s) => s.id === id)?.name ?? "?";

  // Is there a prompt we pushed to this player? (drives the "waiting/answered" UI)
  const pushed =
    state.prompt && state.prompt.seatId === actingSeatId ? state.prompt : null;
  const answer = pushed?.response ?? null;

  const enough = picked.length >= action.min && picked.length <= action.max;

  function toggle(id: string) {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= action.max)
        return action.max === 1 ? [id] : [...cur.slice(1), id];
      return [...cur, id];
    });
  }

  function applyEffect(ids: string[]) {
    for (const id of ids) {
      if (action.effect === "kill") {
        act({ kind: "setAlive", seatId: id, alive: false });
        // Grandmother link: if her "grandchild" is killed by the Demon, she dies too.
        const killed = state.seats.find((x) => x.id === id);
        if (killed?.reminders.some((r) => /grandchild/i.test(r.label))) {
          const gran = state.seats.find((x) => x.characterId === "grandmother" && x.alive);
          if (gran) act({ kind: "setAlive", seatId: gran.id, alive: false });
        }
      } else if (action.effect === "revive") {
        act({ kind: "setAlive", seatId: id, alive: true });
      } else if (action.effect === "poison") {
        act({ kind: "setStatus", seatId: id, key: "poisoned", value: true });
      } else {
        act({
          kind: "addReminder",
          seatId: id,
          characterId: role.id,
          label: `${role.name}: ${action.reminder ?? "Chosen"}`,
        });
      }
    }
  }

  function askOnPhone() {
    act({
      kind: "openPrompt",
      prompt: {
        seatId: actingSeatId,
        kind: "choose",
        title: role.name,
        body: action.prompt,
        min: action.min,
        max: action.max,
        candidates: pool.filter((s) => s.id !== actingSeatId).map((s) => s.id),
        showToPlayer: true,
      },
    });
  }

  function sendInfo(body: string) {
    act({
      kind: "openPrompt",
      prompt: { seatId: actingSeatId, kind: "info", title: role.name, body, showToPlayer: true },
    });
  }

  const closeAll = () => {
    if (pushed) act({ kind: "clearPrompt" });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={closeAll}>
      <div className="modal night-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>
            {role.name}
            {actor && <span className="muted"> · {actor.name}</span>}
          </h3>
          <button className="icon-btn" onClick={closeAll}>
            ✕
          </button>
        </div>
        <p className="prompt-body">{action.prompt}</p>

        {actor && (actor.shownCharacterId || actor.poisoned || actor.drunk) && (
          <p className="guide__warn">
            ⚠ {actor.name}'s ability doesn't actually work
            {actor.shownCharacterId
              ? " — they aren't really this character"
              : actor.poisoned
                ? " — they're poisoned"
                : " — they're drunk"}
            . Go through the motions, but don't apply a real effect.
          </p>
        )}

        {/* A prompt was pushed to the player's phone. */}
        {pushed ? (
          <div className="night-dialog__pushed">
            {!answer ? (
              <>
                <div className="waiting__orb small" />
                <p className="muted">Sent to {actor?.name}'s phone — waiting for their choice…</p>
                <button className="pbtn" onClick={() => act({ kind: "clearPrompt" })}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p className="answered">
                  {actor?.name} chose: <b>{answer.seatIds.map(name).join(", ") || "—"}</b>
                </p>
                {action.effect === "fortune" ? (
                  <div className="vote-btns">
                    <button className="vote yes" onClick={() => { sendInfo("The Storyteller says: YES."); }}>
                      Send “Yes”
                    </button>
                    <button className="vote no" onClick={() => { sendInfo("The Storyteller says: NO."); }}>
                      Send “No”
                    </button>
                  </div>
                ) : (
                  <button
                    className="pbtn primary-btn"
                    onClick={() => {
                      applyEffect(answer.seatIds);
                      act({ kind: "clearPrompt" });
                      onClose();
                    }}
                  >
                    Apply {action.effect} to {answer.seatIds.map(name).join(", ")}
                  </button>
                )}
                <button className="pbtn" onClick={closeAll}>
                  Done
                </button>
              </>
            )}
          </div>
        ) : (
          /* Resolve on the ST's own screen. */
          <>
            <p className="muted small">
              Select {action.min === action.max ? action.min : `${action.min}–${action.max}`} on this screen, or push it to their phone.
            </p>
            <div className="pick-grid">
              {pool.map((s) => (
                <button
                  key={s.id}
                  className={`pick ${picked.includes(s.id) ? "sel" : ""}`}
                  onClick={() => toggle(s.id)}
                >
                  {s.name}
                  {s.id === actingSeatId && <span className="muted small"> (self)</span>}
                </button>
              ))}
            </div>
            <div className="night-dialog__actions">
              {action.effect === "fortune" ? (
                <>
                  <button className="pbtn" disabled={!enough} onClick={() => sendInfo("The Storyteller says: YES.")}>
                    Answer Yes
                  </button>
                  <button className="pbtn" disabled={!enough} onClick={() => sendInfo("The Storyteller says: NO.")}>
                    Answer No
                  </button>
                </>
              ) : (
                <button
                  className="pbtn primary-btn"
                  disabled={!enough}
                  onClick={() => {
                    applyEffect(picked);
                    onClose();
                  }}
                >
                  Apply {action.effect}
                </button>
              )}
              <button className="pbtn" onClick={askOnPhone}>
                📱 Ask on their phone
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
