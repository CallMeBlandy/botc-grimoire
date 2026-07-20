import { useState } from "react";
import type { Edition } from "./types";
import { createRoom, resolveCode, saveHostCreds } from "./api";
import { EDITION_INFO, EDITION_NAMES } from "./roles";

interface Props {
  onHost: () => void;
  onPlay: (roomId: string, code: string) => void;
}

export function Landing({ onHost, onPlay }: Props) {
  const prefill = new URLSearchParams(location.search).get("code") ?? "";
  const [tab, setTab] = useState<"join" | "host">(prefill ? "join" : "join");

  return (
    <div className="center-screen landing">
      <header className="landing__title">
        <h1>Blood on the Clocktower</h1>
        <p className="muted">A personal digital grimoire — play on your own network.</p>
      </header>

      <div className="tabs">
        <button className={tab === "join" ? "active" : ""} onClick={() => setTab("join")}>
          Join a game
        </button>
        <button className={tab === "host" ? "active" : ""} onClick={() => setTab("host")}>
          Storyteller
        </button>
      </div>

      {tab === "join" ? (
        <JoinForm prefill={prefill} onPlay={onPlay} />
      ) : (
        <HostForm onHost={onHost} />
      )}
    </div>
  );
}

function JoinForm({ prefill, onPlay }: { prefill: string; onPlay: Props["onPlay"] }) {
  const [code, setCode] = useState(prefill.toUpperCase());
  const [name, setName] = useState(localStorage.getItem("botc.name") ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setErr(null);
    if (!name.trim()) return setErr("Enter your name");
    if (!code.trim()) return setErr("Enter the game code");
    setBusy(true);
    try {
      const { roomId, code: c } = await resolveCode(code.trim().toUpperCase());
      localStorage.setItem("botc.name", name.trim());
      onPlay(roomId, c);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <label>
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          maxLength={24}
        />
      </label>
      <label>
        Game code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD"
          maxLength={4}
          className="code-input"
        />
      </label>
      {err && <p className="error">{err}</p>}
      <button className="primary big" disabled={busy} onClick={join}>
        {busy ? "Joining…" : "Join game"}
      </button>
    </div>
  );
}

function HostForm({ onHost }: { onHost: () => void }) {
  const [edition, setEdition] = useState<Edition>("tb");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const creds = await createRoom(edition);
      saveHostCreds(creds);
      onHost();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const info = EDITION_INFO[edition];

  return (
    <div className="card">
      <p className="muted">Choose a script to run:</p>
      <div className="edition-pick">
        {(Object.keys(EDITION_NAMES) as Edition[]).map((e) => (
          <button
            key={e}
            className={`edition ${edition === e ? "active" : ""}`}
            onClick={() => setEdition(e)}
          >
            <span>{EDITION_NAMES[e]}</span>
            <span className="edition__level">{EDITION_INFO[e].level}</span>
          </button>
        ))}
      </div>

      <div className="edition-info">
        <div className="edition-info__head">
          <b>{EDITION_NAMES[edition]}</b>
          <span className={`level-pill level-${info.level.replace(/\s/g, "")}`}>{info.level}</span>
          <button className="info-btn" onClick={() => setShowInfo((v) => !v)} title="About this script">
            {showInfo ? "▲" : "ⓘ"}
          </button>
        </div>
        <p className="edition-info__tag">{info.tagline}</p>
        {showInfo && (
          <>
            <p className="small">{info.about}</p>
            <p className="small why">
              <b>Why play it: </b>
              {info.why}
            </p>
          </>
        )}
      </div>

      {err && <p className="error">{err}</p>}
      <button className="primary big" disabled={busy} onClick={create}>
        {busy ? "Creating…" : "Create game"}
      </button>
      <p className="muted small">
        You'll get a code and QR for players to join from their phones.
      </p>
    </div>
  );
}
