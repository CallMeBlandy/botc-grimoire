import { useState } from "react";
import type { Role } from "../types";
import { nightOrder } from "../roles";
import { Token } from "./Token";

interface Props {
  inPlay: Role[];
  onClose: () => void;
}

// The ordered night sheet for the characters currently on the grimoire.
export function NightOrderPanel({ inPlay, onClose }: Props) {
  const [which, setWhich] = useState<"first" | "other">("first");
  const steps = nightOrder(inPlay, which);

  return (
    <div className="side-panel">
      <div className="side-panel__head">
        <h3>Night order</h3>
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="tabs small">
        <button className={which === "first" ? "active" : ""} onClick={() => setWhich("first")}>
          First night
        </button>
        <button className={which === "other" ? "active" : ""} onClick={() => setWhich("other")}>
          Other nights
        </button>
      </div>
      <ol className="night-list">
        {steps.length === 0 && (
          <li className="muted">No characters act on this night yet.</li>
        )}
        {steps.map((s, i) => (
          <li key={s.role.id}>
            <span className="night-num">{i + 1}</span>
            <Token role={s.role} size={40} />
            <div className="night-text">
              <b>{s.role.name}</b>
              <span className="muted small">{s.reminder}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
