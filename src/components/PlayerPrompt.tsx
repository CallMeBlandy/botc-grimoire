import { useState } from "react";
import type { PlayerPrompt as Prompt, Role } from "../types";
import { Token } from "./Token";

interface Props {
  prompt: Prompt;
  byId: Map<string, Role>;
  onRespond: (r: { seatIds?: string[]; value?: boolean | null }) => void;
}

// Full-screen instruction the Storyteller pushed to this player's phone — so
// there's no need to mime or whisper. Info prompts just show text; choose/
// confirm prompts collect the player's answer and send it back.
export function PlayerPrompt({ prompt, byId, onRespond }: Props) {
  const [picked, setPicked] = useState<string[]>([]);

  // Spy/Widow: a read-only view of the whole grimoire.
  if (prompt.kind === "grimoire") {
    return (
      <div className="prompt-overlay">
        <div className="prompt-card grim-card">
          <div className="prompt-title">{prompt.title || "The Grimoire"}</div>
          {prompt.body && <p className="prompt-body">{prompt.body}</p>}
          <div className="grim-list">
            {(prompt.grimoire ?? []).map((seat) => {
              const role = seat.characterId ? byId.get(seat.characterId) : null;
              return (
                <div key={seat.index} className={`grim-item ${seat.alive ? "" : "dead"}`}>
                  <Token role={role} size={44} dead={!seat.alive} faded={!role} />
                  <div className="grim-item__info">
                    <b>{seat.name}</b>
                    <span className="muted small">{role ? role.name : "—"}</span>
                    {seat.reminders.length > 0 && (
                      <span className="muted small">{seat.reminders.join(", ")}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="primary big" onClick={() => onRespond({ value: true })}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (prompt.responded) {
    return (
      <div className="prompt-overlay">
        <div className="prompt-card">
          <div className="prompt-title">{prompt.title}</div>
          <div className="waiting__orb small" />
          <p className="muted">Answer sent. Wait for the Storyteller…</p>
        </div>
      </div>
    );
  }

  const toggle = (id: string) => {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= prompt.max) {
        // At the cap: replace the oldest pick (nice for single-select).
        return prompt.max === 1 ? [id] : [...cur.slice(1), id];
      }
      return [...cur, id];
    });
  };

  const enough = picked.length >= prompt.min && picked.length <= prompt.max;

  return (
    <div className="prompt-overlay">
      <div className="prompt-card">
        <div className="prompt-title">{prompt.title}</div>
        {prompt.body && <p className="prompt-body">{prompt.body}</p>}

        {prompt.kind === "info" && (
          <button className="primary big" onClick={() => onRespond({ value: true })}>
            Got it
          </button>
        )}

        {prompt.kind === "confirm" && (
          <div className="vote-btns">
            <button className="vote yes" onClick={() => onRespond({ value: true })}>
              Yes
            </button>
            <button className="vote no" onClick={() => onRespond({ value: false })}>
              No
            </button>
          </div>
        )}

        {prompt.kind === "choose" && (
          <>
            <p className="muted small">
              Choose {prompt.min === prompt.max ? prompt.min : `${prompt.min}–${prompt.max}`}
            </p>
            <div className="prompt-choices">
              {prompt.candidates.map((c) => (
                <button
                  key={c.id}
                  className={`prompt-choice ${picked.includes(c.id) ? "sel" : ""}`}
                  onClick={() => toggle(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <button
              className="primary big"
              disabled={!enough}
              onClick={() => onRespond({ seatIds: picked })}
            >
              Confirm
            </button>
          </>
        )}
      </div>
    </div>
  );
}
