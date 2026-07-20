import { useMemo, useState } from "react";
import type { Role } from "../types";
import { TEAM_NAMES, TEAM_ORDER, groupByTeam } from "../roles";
import { Token } from "./Token";

interface Props {
  roles: Role[];
  onPick: (role: Role | null) => void;
  onClose: () => void;
  title?: string;
  allowClear?: boolean;
  selectedId?: string | null;
}

export function CharacterPicker({
  roles,
  onPick,
  onClose,
  title = "Choose a character",
  allowClear,
  selectedId,
}: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? roles.filter(
          (r) => r.name.toLowerCase().includes(s) || r.ability.toLowerCase().includes(s),
        )
      : roles;
  }, [roles, q]);
  const grouped = groupByTeam(filtered);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          autoFocus
          className="search"
          placeholder="Search name or ability…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="picker__body">
          {allowClear && (
            <button className="clear-role" onClick={() => onPick(null)}>
              Clear character
            </button>
          )}
          {TEAM_ORDER.map((team) =>
            grouped[team].length ? (
              <section key={team}>
                <h4 className={`team-head team-${team}`}>{TEAM_NAMES[team]}</h4>
                <div className="picker__grid">
                  {grouped[team].map((r) => (
                    <button
                      key={r.id}
                      className={`picker__item ${selectedId === r.id ? "sel" : ""}`}
                      onClick={() => onPick(r)}
                    >
                      <Token role={r} size={56} />
                      <b className="picker__name">{r.name}</b>
                      <span className="picker__ability">{r.ability}</span>
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
