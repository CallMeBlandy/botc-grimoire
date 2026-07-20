import { useState } from "react";
import type { PlayerState, Role } from "./types";
import { useRoles } from "./App";
import { useGame } from "./useGame";
import { loadPlayerToken, savePlayerToken } from "./api";
import { EDITION_NAMES, TEAM_NAMES } from "./roles";
import { Token } from "./components/Token";
import { PlayerPrompt } from "./components/PlayerPrompt";
import { ScriptSheet } from "./components/ScriptSheet";

export function Player({ roomId, code }: { roomId: string; code: string }) {
  const { roles, byId } = useRoles();
  const [name] = useState(localStorage.getItem("botc.name") ?? "");

  const { state, connected, error, sendVote, sendPromptResponse } = useGame({
    attach: {
      type: "player:attach",
      roomId,
      name,
      playerToken: loadPlayerToken(roomId),
    },
    onIdentity: (msg) => savePlayerToken(roomId, msg.playerToken),
  });

  const s = state as PlayerState | null;

  if (!s) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p className="muted">{connected ? "Joining…" : "Connecting…"}</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <>
      {s.prompt && <PlayerPrompt prompt={s.prompt} onRespond={sendPromptResponse} />}
      {s.announcement && (
        <div className="prompt-overlay">
          <div className="prompt-card">
            <div className="prompt-title">{s.announcement.title}</div>
            {s.announcement.body && <p className="prompt-body">{s.announcement.body}</p>}
          </div>
        </div>
      )}
      <PlayerScreen
        state={s}
        code={code}
        byId={byId}
        editionRoles={roles.filter((r) => r.edition === s.edition)}
        connected={connected}
        sendVote={sendVote}
      />
    </>
  );
}

function PlayerScreen({
  state: s,
  code,
  byId,
  editionRoles,
  connected,
  sendVote,
}: {
  state: PlayerState;
  code: string;
  byId: Map<string, Role>;
  editionRoles: Role[];
  connected: boolean;
  sendVote: (vote: boolean) => void;
}) {
  const me = s.you;
  const role = me?.characterId ? byId.get(me.characterId) : null;

  // "I know my role" is confirmed per revealed character (resets if it changes).
  const confirmKey = `botc.confirmed.${s.id}`;
  const [confirmed, setConfirmed] = useState<string | null>(
    () => localStorage.getItem(confirmKey),
  );
  const hasConfirmed = !!role && confirmed === me?.characterId;
  const confirmRole = () => {
    if (me?.characterId) {
      localStorage.setItem(confirmKey, me.characterId);
      setConfirmed(me.characterId);
    }
  };
  const nom = s.nomination;
  const nominee = nom ? s.seats.find((x) => x.id === nom.nomineeSeatId) : null;
  const canVote = !!nom && nom.open && !!me && (me.alive || me.ghostVoteAvailable);

  return (
    <div
      className={`player ${s.phase.type === "night" ? "is-night" : ""} ${
        me && !me.alive ? "is-dead" : ""
      }`}
    >
      <header className="player__bar">
        <span className={`phase-badge ${s.phase.type}`}>
          {s.phase.type === "setup"
            ? "Not started"
            : `${s.phase.type === "night" ? "Night" : "Day"} ${s.phase.count}`}
        </span>
        <span className="muted small">
          {EDITION_NAMES[s.edition]} · {code}
        </span>
        {!connected && <span className="dot away" title="Reconnecting" />}
      </header>

      <section className={`role-card ${hasConfirmed ? "role-card--compact" : ""}`}>
        {role ? (
          <>
            <Token role={role} size={hasConfirmed ? 64 : 120} dead={me ? !me.alive : false} />
            <h2 className={`team-${role.team}`}>{role.name}</h2>
            {!hasConfirmed && (
              <>
                <span className={`team-pill team-${role.team}`}>{TEAM_NAMES[role.team]}</span>
                <p className="ability">{role.ability}</p>
                <button className="primary big" onClick={confirmRole}>
                  I understand my role
                </button>
              </>
            )}
          </>
        ) : (
          <div className="waiting">
            <div className="waiting__orb" />
            <p>Waiting for the Storyteller to reveal your character…</p>
          </div>
        )}
      </section>

      {hasConfirmed && (
        <section className="script-section">
          {s.allRevealed ? (
            <>
              <h3>The script — {EDITION_NAMES[s.edition]}</h3>
              <p className="muted small">
                Every character that could be in this game. Not who has what.
              </p>
              <ScriptSheet roles={editionRoles} />
            </>
          ) : (
            <p className="muted center-text">
              You're set. Waiting for the Storyteller to reveal everyone's role…
            </p>
          )}
        </section>
      )}

      {me && (
        <div className="status-row">
          <span className={me.alive ? "alive" : "dead"}>{me.alive ? "Alive" : "Dead"}</span>
          {!me.alive && (
            <span className={me.ghostVoteAvailable ? "gv-ok" : "gv-used"}>
              {me.ghostVoteAvailable ? "🗳 Ghost vote available" : "Ghost vote used"}
            </span>
          )}
        </div>
      )}

      {nom && nominee && (
        <section className="nom-card">
          <h3>⚖ {nominee.name} is on the block</h3>
          <div className={`tally ${nom.count >= s.threshold ? "pass" : ""}`}>
            {nom.count} / {s.threshold} needed
          </div>
          {nom.open ? (
            canVote ? (
              <div className="vote-btns">
                <button
                  className={`vote yes ${nom.yourVote === true ? "on" : ""}`}
                  onClick={() => sendVote(true)}
                >
                  ✋ Vote yes
                </button>
                <button
                  className={`vote no ${nom.yourVote === false ? "on" : ""}`}
                  onClick={() => sendVote(false)}
                >
                  ✕ No
                </button>
              </div>
            ) : (
              <p className="muted">
                {me && !me.alive && !me.ghostVoteAvailable
                  ? "You've used your ghost vote."
                  : "You can't vote right now."}
              </p>
            )
          ) : (
            <p className="muted">Voting closed.</p>
          )}
        </section>
      )}

      <section className="seating">
        <h4 className="muted small">Town ({s.aliveCount} alive)</h4>
        <ul>
          {s.seats.map((seat) => (
            <li
              key={seat.id}
              className={`${seat.isYou ? "you" : ""} ${!seat.alive ? "dead" : ""}`}
            >
              <span className="seat-num">{seat.index + 1}</span>
              <span className="seat-name">{seat.name}</span>
              {seat.isYou && <span className="you-tag">you</span>}
              {!seat.alive && <span className="skull">☠</span>}
              {nom && nom.nomineeSeatId === seat.id && <span className="block-tag">on block</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
