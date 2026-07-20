import { createContext, useContext, useEffect, useState } from "react";
import type { Role } from "./types";
import { fetchRoles } from "./api";
import { buildRoleIndex } from "./roles";
import { Landing } from "./Landing";
import { Host } from "./Host";
import { Player } from "./Player";

interface RolesCtx {
  roles: Role[];
  byId: Map<string, Role>;
}
const RolesContext = createContext<RolesCtx | null>(null);
export const useRoles = () => {
  const ctx = useContext(RolesContext);
  if (!ctx) throw new Error("useRoles outside provider");
  return ctx;
};

type View =
  | { name: "landing" }
  | { name: "host" }
  | { name: "player"; roomId: string; code: string };

function initialView(): View {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (code) return { name: "landing" }; // Landing reads the code and shows join form
  if (location.pathname.startsWith("/host")) return { name: "host" };
  return { name: "landing" };
}

export function App() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);

  useEffect(() => {
    fetchRoles()
      .then(setRoles)
      .catch((e) => setErr(e.message));
  }, []);

  if (err)
    return (
      <div className="center-screen">
        <div className="card">
          <h2>Couldn't load character data</h2>
          <p className="muted">{err}</p>
          <p className="muted">
            Run <code>npm run fetch-roles</code> on the host machine, then reload.
          </p>
        </div>
      </div>
    );

  if (!roles)
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );

  const ctx: RolesCtx = { roles, byId: buildRoleIndex(roles) };

  return (
    <RolesContext.Provider value={ctx}>
      {view.name === "landing" && (
        <Landing
          onHost={() => {
            history.pushState({}, "", "/host");
            setView({ name: "host" });
          }}
          onPlay={(roomId, code) => setView({ name: "player", roomId, code })}
        />
      )}
      {view.name === "host" && (
        <Host
          onExit={() => {
            history.pushState({}, "", "/");
            setView({ name: "landing" });
          }}
        />
      )}
      {view.name === "player" && (
        <Player roomId={view.roomId} code={view.code} />
      )}
    </RolesContext.Provider>
  );
}
