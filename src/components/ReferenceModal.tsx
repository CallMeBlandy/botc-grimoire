import { useState } from "react";
import type { Role } from "../types";
import { TEAM_NAMES, TEAM_ORDER, groupByTeam } from "../roles";
import { Token } from "./Token";

// A reference of EVERY character on the script. Tap one to blow it up
// full-screen — handy for physically showing a player their token
// (e.g. showing the Demon its 3 bluffs, or a Washerwoman a Townsfolk).
export function ReferenceModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const [big, setBig] = useState<Role | null>(null);
  const grouped = groupByTeam(roles);

  if (big) {
    return (
      <div className="show-overlay" onClick={() => setBig(null)}>
        <Token role={big} size={Math.min(260, window.innerWidth - 80)} />
        <h2 className={`team-${big.team}`}>{big.name}</h2>
        <span className={`team-pill team-${big.team}`}>{TEAM_NAMES[big.team]}</span>
        <p className="show-ability">{big.ability}</p>
        <p className="muted small">Tap anywhere to go back</p>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>All characters — tap to show a player</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="picker__body">
          {TEAM_ORDER.map((team) =>
            grouped[team].length ? (
              <section key={team}>
                <h4 className={`team-head team-${team}`}>{TEAM_NAMES[team]}</h4>
                <div className="picker__grid">
                  {grouped[team].map((r) => (
                    <button key={r.id} className="picker__item" onClick={() => setBig(r)}>
                      <Token role={r} size={56} />
                      <b className="picker__name">{r.name}</b>
                    </button>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
