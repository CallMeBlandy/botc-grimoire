import type { Role } from "../types";
import { TEAM_NAMES, TEAM_ORDER, groupByTeam } from "../roles";
import { Token } from "./Token";

// The public character sheet for the script in play — every character that
// could be in the game, so players know what abilities exist. It does NOT
// reveal who has what.
export function ScriptSheet({ roles }: { roles: Role[] }) {
  const grouped = groupByTeam(roles);
  return (
    <div className="script-sheet">
      {TEAM_ORDER.map((team) =>
        grouped[team].length ? (
          <section key={team}>
            <h4 className={`team-head team-${team}`}>{TEAM_NAMES[team]}</h4>
            {grouped[team].map((r) => (
              <div key={r.id} className="script-row">
                <Token role={r} size={40} />
                <div>
                  <b className={`team-${team}`}>{r.name}</b>
                  <p className="muted small">{r.ability}</p>
                </div>
              </div>
            ))}
          </section>
        ) : null,
      )}
    </div>
  );
}
