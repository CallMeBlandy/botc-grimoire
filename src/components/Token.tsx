import { useState } from "react";
import type { Role } from "../types";

interface Props {
  role: Role | null | undefined;
  size?: number;
  dead?: boolean;
  faded?: boolean;
  onClick?: () => void;
  title?: string;
}

// A circular character token: icon art with a graceful text fallback.
export function Token({ role, size = 72, dead, faded, onClick, title }: Props) {
  const [broken, setBroken] = useState(false);
  const px = `${size}px`;

  return (
    <div
      className={`token ${dead ? "token--dead" : ""} ${faded ? "token--faded" : ""} ${
        onClick ? "token--btn" : ""
      }`}
      style={{ width: px, height: px }}
      onClick={onClick}
      title={title ?? role?.name}
    >
      {role && !broken ? (
        <img
          src={`/icons/${role.id}.png`}
          alt={role.name}
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="token__text">{role ? role.name : "—"}</span>
      )}
      {dead && <span className="token__shroud" aria-label="dead">☠</span>}
    </div>
  );
}
