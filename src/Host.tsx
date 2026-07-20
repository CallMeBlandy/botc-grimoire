import { useEffect, useMemo, useRef, useState } from "react";
import type { HostAction, HostSeat, HostState, Phase, Role } from "./types";
import { useRoles } from "./App";
import { useGame } from "./useGame";
import { loadHostCreds } from "./api";
import {
  EDITION_NAMES,
  NIGHT_ACTIONS,
  SHOWN_AS,
  buildNightSteps,
  computeWin,
  groupByTeam,
  setupFor,
} from "./roles";
import { Token } from "./components/Token";
import { SeatCircle } from "./components/SeatCircle";
import { CharacterPicker } from "./components/CharacterPicker";
import { JoinModal } from "./components/JoinModal";
import { NightOrderPanel } from "./components/NightOrderPanel";
import { GuidePanel } from "./components/GuidePanel";
import { NightActionDialog } from "./components/NightActionDialog";

type Modal =
  | { kind: "none" }
  | { kind: "assign"; seatId: string }
  | { kind: "shown"; seatId: string }
  | { kind: "bluff"; index: number }
  | { kind: "reminder"; seatId: string }
  | { kind: "join" }
  | { kind: "night" };

export function Host({ onExit }: { onExit: () => void }) {
  const creds = loadHostCreds();
  if (!creds) {
    return (
      <div className="center-screen">
        <div className="card">
          <h2>No active game</h2>
          <button className="primary" onClick={onExit}>
            Back
          </button>
        </div>
      </div>
    );
  }
  return <HostGame creds={creds} onExit={onExit} />;
}

function HostGame({
  creds,
  onExit,
}: {
  creds: NonNullable<ReturnType<typeof loadHostCreds>>;
  onExit: () => void;
}) {
  const { roles, byId } = useRoles();

  const { state, connected, error, sendHostAction } = useGame({
    attach: { type: "host:attach", roomId: creds.roomId, hostToken: creds.hostToken },
  });

  const [modal, setModal] = useState<Modal>({ kind: "none" });
  const [selected, setSelected] = useState<string | null>(null);

  const s = state as HostState | null;

  const editionRoles = useMemo(
    () => (s ? roles.filter((r) => r.edition === s.edition) : []),
    [roles, s?.edition],
  );

  const inPlayRoles = useMemo(() => {
    if (!s) return [];
    return s.seats
      .map((seat) => (seat.characterId ? byId.get(seat.characterId) : null))
      .filter((r): r is Role => !!r);
  }, [s, byId]);

  const [showDead, setShowDead] = useState(false);
  const night = useMemo(() => {
    if (!s) return { steps: [], skipped: [] };
    const which = s.phase.type === "night" && s.phase.count > 1 ? "other" : "first";
    return buildNightSteps(s.seats, byId, which, showDead);
  }, [s?.seats, s?.phase.type, s?.phase.count, byId, showDead]);

  // Auto-open the night action dialog when the guide reaches a targeting role.
  const [nightDialogOpen, setNightDialogOpen] = useState(false);
  const dismissedRef = useRef<Set<string>>(new Set());
  const [nominating, setNominating] = useState<string | null>(null); // nominee awaiting a nominator
  const [winDismissed, setWinDismissed] = useState<string | null>(null);

  const stepKey = s ? `${s.phase.type}${s.phase.count}:${s.stepIndex}` : "";
  useEffect(() => {
    if (!s || s.phase.type !== "night") {
      setNightDialogOpen(false);
      return;
    }
    const step = night.steps[Math.min(s.stepIndex, Math.max(0, night.steps.length - 1))];
    const roleId = step?.role?.id;
    const action = roleId ? NIGHT_ACTIONS[roleId] : undefined;
    const which = s.phase.count > 1 ? "other" : "first";
    const actionable =
      !!action && step.seatIds.length > 0 && (!action.when || action.when === which);
    setNightDialogOpen(actionable && !dismissedRef.current.has(stepKey));
  }, [stepKey, night, s?.phase.type]);

  if (!s) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p className="muted">{connected ? "Loading grimoire…" : "Connecting…"}</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const act = sendHostAction;
  const selectedSeat = s.seats.find((x) => x.id === selected) || null;
  const seatName = (id: string) => s.seats.find((x) => x.id === id)?.name ?? "";

  const nightSteps = night.steps;
  // Seats to highlight for the current night step (who the ST should wake).
  const currentNightStep =
    s.phase.type === "night"
      ? nightSteps[Math.min(s.stepIndex, Math.max(0, nightSteps.length - 1))]
      : null;
  const highlightIds = new Set<string>(currentNightStep?.seatIds ?? []);

  function stepPhase(dir: 1 | -1) {
    const { type, count } = s!.phase;
    let next: Phase;
    if (dir === 1) {
      if (type === "setup") next = { type: "night", count: 1 };
      else if (type === "night") next = { type: "day", count };
      else next = { type: "night", count: count + 1 };
    } else {
      if (type === "setup") next = { type: "setup", count: 0 };
      else if (type === "day") next = { type: "night", count };
      else if (count <= 1) next = { type: "setup", count: 0 };
      else next = { type: "day", count: count - 1 };
    }
    act({ kind: "setPhase", phase: next });
  }

  const phaseLabel =
    s.phase.type === "setup" ? "Setup" : `${s.phase.type === "night" ? "Night" : "Day"} ${s.phase.count}`;

  const claimed = s.seats.filter((x) => x.claimed).length;
  const alive = s.seats.filter((x) => x.alive).length;
  const comp = setupFor(s.seats.length);

  function closeNightDialog() {
    dismissedRef.current.add(stepKey);
    setNightDialogOpen(false);
  }
  function openNightDialog() {
    dismissedRef.current.delete(stepKey);
    setNightDialogOpen(true);
  }

  // Randomly assign a legal team composition to the seats.
  function autoFill() {
    const seats = s!.seats;
    const c = setupFor(seats.length);
    if (!c) return;
    const grouped = groupByTeam(editionRoles);
    const draw = (arr: Role[], n: number) => {
      const pool = [...arr];
      const out: Role[] = [];
      for (let i = 0; i < n && pool.length; i++)
        out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return out;
    };
    const chosen = [
      ...draw(grouped.townsfolk, c[0]),
      ...draw(grouped.outsider, c[1]),
      ...draw(grouped.minion, c[2]),
      ...draw(grouped.demon, c[3]),
    ];
    // Shuffle so identical seats aren't clustered, then assign.
    for (let i = chosen.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
    }
    seats.forEach((seat, i) => {
      const role = chosen[i];
      act({ kind: "assignCharacter", seatId: seat.id, characterId: role ? role.id : null });
    });

    // Demon bluffs: 3 good characters (Townsfolk/Outsider) NOT in play.
    const inPlay = new Set(chosen.map((r) => r.id));
    const goodPool = editionRoles.filter(
      (r) => (r.team === "townsfolk" || r.team === "outsider") && !inPlay.has(r.id),
    );
    const bluffs: (string | null)[] = [];
    const pool = [...goodPool];
    for (let i = 0; i < 3 && pool.length; i++)
      bluffs.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
    while (bluffs.length < 3) bluffs.push(null);
    act({ kind: "setBluffs", bluffs });

    // Drunk/Lunatic: pick a not-in-play role of the right team to show them.
    seats.forEach((seat, i) => {
      const role = chosen[i];
      const hint = role ? SHOWN_AS[role.id] : undefined;
      if (!hint) return;
      const opts = editionRoles.filter((r) => r.team === hint.team && !inPlay.has(r.id));
      if (opts.length)
        act({
          kind: "setShownCharacter",
          seatId: seat.id,
          characterId: opts[Math.floor(Math.random() * opts.length)].id,
        });
    });
  }

  // Push the current night step's instruction to the acting player's phone.
  function pushInstruction() {
    const step = currentNightStep;
    if (!step || !step.seatIds.length) return;
    act({
      kind: "openPrompt",
      prompt: {
        seatId: step.seatIds[0],
        kind: "info",
        title: step.name,
        body: step.reminder,
        showToPlayer: true,
      },
    });
  }

  const nightWhich = s.phase.type === "night" && s.phase.count > 1 ? "other" : "first";
  const dialogRole = currentNightStep?.role;
  const rawAction = dialogRole ? NIGHT_ACTIONS[dialogRole.id] : undefined;
  const dialogAction =
    rawAction && (!rawAction.when || rawAction.when === nightWhich) ? rawAction : undefined;

  const win = computeWin(s, byId);
  const showWin = win && winDismissed !== win.reason && !s.announcement;

  return (
    <div className={`host ${s.phase.type === "night" ? "is-night" : ""}`}>
      <header className="host__bar">
        <button className="chip" onClick={() => setModal({ kind: "join" })}>
          🔗 Code <b>{s.code}</b> · {claimed} joined
        </button>

        <div className="phase-ctl">
          <button className="icon-btn" onClick={() => stepPhase(-1)} title="Previous phase">
            ◀
          </button>
          <span className={`phase-badge ${s.phase.type}`}>{phaseLabel}</span>
          <button className="icon-btn" onClick={() => stepPhase(1)} title="Next phase">
            ▶
          </button>
        </div>

        <div className="host__bar-right">
          <span className="muted small hide-sm">{EDITION_NAMES[s.edition]}</span>
          <button className="chip" onClick={() => setModal({ kind: "night" })}>
            ☾ Night order
          </button>
          <HostMenu
            onReset={() => {
              if (confirm("Reset the game? Characters, life and reminders clear. Players keep their seats."))
                act({ kind: "resetGame" });
            }}
            onRevealAll={() => act({ kind: "revealAll" })}
            onExit={onExit}
          />
        </div>
      </header>

      {!connected && <div className="reconnect-bar">Reconnecting…</div>}

      {showWin && win && (
        <div className={`win-banner win-${win.winner}`}>
          <div className="win-banner__text">
            <b>{win.winner === "good" ? "Good team may have won" : "Evil team may have won"}</b>
            <span className="muted small">{win.reason} — confirm, then announce.</span>
          </div>
          <div className="win-banner__actions">
            <button
              className="pbtn primary-btn"
              onClick={() =>
                act({
                  kind: "setAnnouncement",
                  title: win.winner === "good" ? "Good team wins! 🕊" : "Evil team wins! 😈",
                  body: win.reason,
                })
              }
            >
              📢 Announce to all
            </button>
            <button className="pbtn" onClick={() => setWinDismissed(win.reason)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {s.announcement && (
        <div className="win-banner win-live">
          <div className="win-banner__text">
            <b>Showing on all phones: {s.announcement.title}</b>
          </div>
          <button className="pbtn" onClick={() => act({ kind: "clearAnnouncement" })}>
            Clear
          </button>
        </div>
      )}

      <main className="host__stage">
        <SeatCircle
          count={s.seats.length}
          center={
            <div className="grim-center">
              <div className="grim-center__phase">{phaseLabel}</div>
              <div className="muted small">
                {alive}/{s.seats.length} alive
              </div>
              {comp && (
                <div className="muted small comp">
                  {comp[0]}T · {comp[1]}O · {comp[2]}M · {comp[3]}D
                </div>
              )}
              <div className="bluffs">
                <span className="muted small">Demon bluffs</span>
                <div className="bluffs__row">
                  {[0, 1, 2].map((i) => {
                    const r = s.bluffs[i] ? byId.get(s.bluffs[i]!) : null;
                    return (
                      <div key={i} className="bluff" onClick={() => setModal({ kind: "bluff", index: i })}>
                        <Token role={r} size={44} faded={!r} title="Set bluff" />
                        <span className="bluff__name">{r ? r.name : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          }
          renderSeat={(i) => {
            const seat = s.seats[i];
            const role = seat.characterId ? byId.get(seat.characterId) : null;
            const shownRole = seat.shownCharacterId ? byId.get(seat.shownCharacterId) : null;
            return (
              <HostSeatView
                seat={seat}
                role={role}
                shownRole={shownRole}
                selected={selected === seat.id}
                highlight={highlightIds.has(seat.id)}
                onSelect={() => setSelected(selected === seat.id ? null : seat.id)}
              />
            );
          }}
        />

        {s.seats.length === 0 && (
          <div className="empty-hint">
            <p>No seats yet.</p>
            <p className="muted">Add seats below, or let players join with code <b>{s.code}</b>.</p>
          </div>
        )}
      </main>

      <div className="host__foot">
        <GuidePanel
          state={s}
          nightSteps={nightSteps}
          skipped={night.skipped}
          showDead={showDead}
          onToggleDead={() => setShowDead((v) => !v)}
          seatName={seatName}
          act={act}
          canAutoFill={!!comp}
          onAutoFill={autoFill}
          onRevealAll={() => act({ kind: "revealAll" })}
          actionable={s.phase.type === "night" && !!dialogAction}
          onOpenAction={openNightDialog}
          onPushInstruction={pushInstruction}
        />
        {s.nomination && <NominationBar state={s} byId={byId} act={act} />}
        <button className="ghost" onClick={() => act({ kind: "addSeat" })}>
          ＋ Add seat
        </button>
      </div>

      {selectedSeat && (
        <SeatPanel
          seat={selectedSeat}
          role={selectedSeat.characterId ? byId.get(selectedSeat.characterId) : null}
          state={s}
          act={act}
          onAssign={() => setModal({ kind: "assign", seatId: selectedSeat.id })}
          onReminder={() => setModal({ kind: "reminder", seatId: selectedSeat.id })}
          onNominate={(id) => {
            setSelected(null);
            setNominating(id);
          }}
          onShownAs={() => setModal({ kind: "shown", seatId: selectedSeat.id })}
          onClose={() => setSelected(null)}
          byId={byId}
        />
      )}

      {modal.kind === "assign" && (
        <CharacterPicker
          roles={editionRoles}
          allowClear
          title="Assign character"
          onPick={(r) => {
            act({ kind: "assignCharacter", seatId: modal.seatId, characterId: r?.id ?? null });
            setModal({ kind: "none" });
          }}
          onClose={() => setModal({ kind: "none" })}
        />
      )}

      {modal.kind === "shown" && (
        <ShownAsPicker
          seatId={modal.seatId}
          state={s}
          editionRoles={editionRoles}
          act={act}
          onClose={() => setModal({ kind: "none" })}
        />
      )}

      {modal.kind === "bluff" && (
        <CharacterPicker
          roles={editionRoles}
          allowClear
          title="Set demon bluff"
          onPick={(r) => {
            const bluffs = [...s.bluffs];
            bluffs[modal.index] = r?.id ?? null;
            act({ kind: "setBluffs", bluffs });
            setModal({ kind: "none" });
          }}
          onClose={() => setModal({ kind: "none" })}
        />
      )}

      {modal.kind === "reminder" && (
        <ReminderPicker
          inPlay={inPlayRoles}
          onPick={(characterId, label) => {
            act({ kind: "addReminder", seatId: modal.seatId, characterId, label });
            setModal({ kind: "none" });
          }}
          onClose={() => setModal({ kind: "none" })}
        />
      )}

      {modal.kind === "join" && (
        <JoinModal code={s.code} onClose={() => setModal({ kind: "none" })} />
      )}

      {modal.kind === "night" && (
        <NightOrderPanel inPlay={inPlayRoles} onClose={() => setModal({ kind: "none" })} />
      )}

      {nightDialogOpen && dialogRole && dialogAction && currentNightStep && (
        <NightActionDialog
          role={dialogRole}
          action={dialogAction}
          actingSeatId={currentNightStep.seatIds[0]}
          state={s}
          act={act}
          onClose={closeNightDialog}
        />
      )}

      {nominating && (
        <NominateDialog
          nomineeSeatId={nominating}
          state={s}
          act={act}
          onClose={() => setNominating(null)}
        />
      )}
    </div>
  );
}

function HostSeatView({
  seat,
  role,
  shownRole,
  selected,
  highlight,
  onSelect,
}: {
  seat: HostSeat;
  role: Role | null | undefined;
  shownRole: Role | null | undefined;
  selected: boolean;
  highlight?: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`hseat ${selected ? "hseat--sel" : ""} ${highlight ? "hseat--active" : ""}`}
      onClick={onSelect}
    >
      <div className="hseat__tokenwrap">
        <Token role={role} size={68} dead={!seat.alive} faded={!role} />
        {(seat.poisoned || seat.drunk) && (
          <span className="hseat__status" title={seat.poisoned ? "Poisoned" : "Drunk"}>
            {seat.poisoned ? "🧪" : "🍺"}
          </span>
        )}
      </div>
      {role && <div className="hseat__char">{role.name}</div>}
      <div className="hseat__name">
        <span className={`dot ${seat.connected ? "on" : seat.claimed ? "away" : "empty"}`} />
        {seat.name}
        {seat.roleRevealed && role && <span className="revealed" title="Revealed to player">👁</span>}
      </div>
      {shownRole && (
        <div className="hseat__shownas" title="What the player is shown">
          🎭 sees: {shownRole.name}
        </div>
      )}
      {seat.reminders.length > 0 && (
        <div className="hseat__reminders">
          {seat.reminders.map((r) => (
            <span key={r.id} className="rem-chip">
              {r.label}
            </span>
          ))}
        </div>
      )}
      {!seat.alive && !seat.ghostVoteUsed && <span className="ghost-vote" title="Ghost vote available">🗳</span>}
    </div>
  );
}

function SeatPanel({
  seat,
  role,
  state,
  act,
  onAssign,
  onReminder,
  onNominate,
  onShownAs,
  onClose,
  byId,
}: {
  seat: HostSeat;
  role: Role | null | undefined;
  state: HostState;
  act: ReturnType<typeof useGame>["sendHostAction"];
  onAssign: () => void;
  onReminder: () => void;
  onNominate: (seatId: string) => void;
  onShownAs: () => void;
  onClose: () => void;
  byId: Map<string, Role>;
}) {
  const [name, setName] = useState(seat.name);
  const alreadyNominated = state.day.nominees.includes(seat.id);
  const canNominate = state.phase.type === "day" && !state.nomination;
  const shownRole = seat.shownCharacterId ? byId.get(seat.shownCharacterId) : null;
  const shownHint = role ? SHOWN_AS[role.id] : undefined;

  return (
    <div className="seat-panel">
      <div className="seat-panel__head">
        <Token role={role} size={52} dead={!seat.alive} faded={!role} />
        <input
          className="name-edit"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== seat.name && act({ kind: "renameSeat", seatId: seat.id, name })}
        />
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      {role && (
        <>
          <h3 className={`seat-panel__role team-${role.team}`}>{role.name}</h3>
          <p className="ability">{role.ability}</p>
        </>
      )}

      {(shownHint || shownRole) && (
        <div className={`shown-row ${shownHint && !shownRole ? "shown-row--todo" : ""}`}>
          <span>
            🎭 Player sees:{" "}
            <b>{shownRole ? shownRole.name : "not set"}</b>
            {shownHint && <span className="muted small"> — {shownHint.note}</span>}
          </span>
          <button className="pbtn" onClick={onShownAs}>
            {shownRole ? "Change" : "Set shown role"}
          </button>
        </div>
      )}

      <div className="seat-panel__grid">
        <button className="pbtn" onClick={onAssign}>
          {role ? "Change role" : "Assign role"}
        </button>
        <button
          className={`pbtn ${seat.roleRevealed ? "on" : ""}`}
          disabled={!role}
          onClick={() => act({ kind: "revealRole", seatId: seat.id, revealed: !seat.roleRevealed })}
        >
          {seat.roleRevealed ? "👁 Revealed" : "Reveal to player"}
        </button>
        <button
          className={`pbtn ${!seat.alive ? "danger" : ""}`}
          onClick={() => act({ kind: "setAlive", seatId: seat.id, alive: !seat.alive })}
        >
          {seat.alive ? "☠ Kill" : "Revive"}
        </button>
        {!seat.alive && (
          <button
            className={`pbtn ${seat.ghostVoteUsed ? "" : "on"}`}
            onClick={() => act({ kind: "setGhostVoteUsed", seatId: seat.id, used: !seat.ghostVoteUsed })}
          >
            {seat.ghostVoteUsed ? "Ghost vote used" : "🗳 Ghost vote ready"}
          </button>
        )}
        <button
          className={`pbtn ${seat.poisoned ? "poison" : ""}`}
          onClick={() => act({ kind: "setStatus", seatId: seat.id, key: "poisoned", value: !seat.poisoned })}
        >
          {seat.poisoned ? "🧪 Poisoned" : "Poison"}
        </button>
        <button
          className={`pbtn ${seat.drunk ? "drunk" : ""}`}
          onClick={() => act({ kind: "setStatus", seatId: seat.id, key: "drunk", value: !seat.drunk })}
        >
          {seat.drunk ? "🍺 Drunk" : "Make drunk"}
        </button>
        <button className="pbtn" onClick={onReminder}>
          ＋ Reminder
        </button>
        {canNominate && (
          <button
            className="pbtn"
            disabled={alreadyNominated}
            onClick={() => onNominate(seat.id)}
          >
            {alreadyNominated ? "Already nominated" : "⚖ Nominate"}
          </button>
        )}
        <button
          className="pbtn danger"
          onClick={() => {
            if (confirm(`Remove ${seat.name}'s seat?`)) {
              act({ kind: "removeSeat", seatId: seat.id });
              onClose();
            }
          }}
        >
          Remove seat
        </button>
      </div>

      {seat.reminders.length > 0 && (
        <div className="reminder-list">
          {seat.reminders.map((r) => (
            <button
              key={r.id}
              className="rem-chip removable"
              onClick={() => act({ kind: "removeReminder", seatId: seat.id, reminderId: r.id })}
            >
              {r.label} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderPicker({
  inPlay,
  onPick,
  onClose,
}: {
  inPlay: Role[];
  onPick: (characterId: string, label: string) => void;
  onClose: () => void;
}) {
  const items: { characterId: string; label: string }[] = [];
  for (const r of inPlay) {
    for (const label of r.reminders) items.push({ characterId: r.id, label: `${r.name}: ${label}` });
  }
  // A few generic markers that don't belong to a character.
  const generic = ["Poisoned", "Drunk", "Dead", "No ability", "Used"];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Add reminder</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="reminder-picker">
          {items.map((it, i) => (
            <button key={i} className="rem-opt" onClick={() => onPick(it.characterId, it.label)}>
              {it.label}
            </button>
          ))}
          <div className="rem-generic">
            {generic.map((g) => (
              <button key={g} className="rem-opt" onClick={() => onPick("_generic", g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShownAsPicker({
  seatId,
  state,
  editionRoles,
  act,
  onClose,
}: {
  seatId: string;
  state: HostState;
  editionRoles: Role[];
  act: ReturnType<typeof useGame>["sendHostAction"];
  onClose: () => void;
}) {
  const seat = state.seats.find((s) => s.id === seatId);
  const hint = seat?.characterId ? SHOWN_AS[seat.characterId] : undefined;
  // For the Drunk/Lunatic, restrict to the team they must appear as.
  const roles = hint ? editionRoles.filter((r) => r.team === hint.team) : editionRoles;
  return (
    <CharacterPicker
      roles={roles}
      allowClear
      title={hint ? `Show player as a ${hint.team}` : "Show player as…"}
      selectedId={seat?.shownCharacterId ?? null}
      onPick={(r) => {
        act({ kind: "setShownCharacter", seatId, characterId: r?.id ?? null });
        onClose();
      }}
      onClose={onClose}
    />
  );
}

function NominationBar({
  state,
  byId,
  act,
}: {
  state: HostState;
  byId: Map<string, Role>;
  act: ReturnType<typeof useGame>["sendHostAction"];
}) {
  const nom = state.nomination!;
  const nominee = state.seats.find((s) => s.id === nom.nomineeSeatId);
  const alive = state.seats.filter((s) => s.alive).length;
  const threshold = Math.ceil(alive / 2);
  return (
    <div className="nom-bar">
      <div className="nom-bar__info">
        <b>Nominated: {nominee?.name}</b>
        <span className={`tally ${nom.count >= threshold ? "pass" : ""}`}>
          {nom.count} / {threshold} to execute
        </span>
      </div>
      <div className="nom-bar__seats">
        {state.seats.map((s) => (
          <button
            key={s.id}
            className={`vote-pip ${nom.votes[s.id] ? "yes" : ""} ${!s.alive ? "dead" : ""}`}
            title={s.name}
            onClick={() => act({ kind: "setVote", seatId: s.id, vote: !nom.votes[s.id] })}
          >
            {s.name.slice(0, 6)}
          </button>
        ))}
      </div>
      <div className="nom-bar__actions">
        {nom.open ? (
          <button className="pbtn primary-btn" onClick={() => act({ kind: "closeNomination" })}>
            Close vote
          </button>
        ) : (
          <>
            <button
              className="pbtn danger"
              onClick={() => act({ kind: "recordExecution", seatId: nom.nomineeSeatId })}
            >
              ☠ Execute {nominee?.name}
            </button>
            <button className="pbtn" onClick={() => act({ kind: "clearNomination" })}>
              Not executed
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Pick who is nominating the chosen nominee. Players who've already nominated
// (or the nominee themselves) are disabled — each player nominates once a day.
function NominateDialog({
  nomineeSeatId,
  state,
  act,
  onClose,
}: {
  nomineeSeatId: string;
  state: HostState;
  act: ReturnType<typeof useGame>["sendHostAction"];
  onClose: () => void;
}) {
  const nominee = state.seats.find((s) => s.id === nomineeSeatId);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Who nominates {nominee?.name}?</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="pick-grid">
          {state.seats.map((s) => {
            const used = state.day.nominators.includes(s.id);
            const disabled = used || s.id === nomineeSeatId || !s.alive;
            return (
              <button
                key={s.id}
                className={`pick ${disabled ? "off" : ""}`}
                disabled={disabled}
                onClick={() => {
                  act({ kind: "nominate", nominatorSeatId: s.id, nomineeSeatId });
                  onClose();
                }}
              >
                {s.name}
                {used && <span className="muted small"> (used)</span>}
                {!s.alive && <span className="muted small"> ☠</span>}
              </button>
            );
          })}
        </div>
        <p className="muted small">Each player may nominate once per day.</p>
      </div>
    </div>
  );
}

function HostMenu({
  onReset,
  onRevealAll,
  onExit,
}: {
  onReset: () => void;
  onRevealAll: () => void;
  onExit: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu">
      <button className="icon-btn" onClick={() => setOpen((o) => !o)}>
        ⋮
      </button>
      {open && (
        <div className="menu__pop" onMouseLeave={() => setOpen(false)}>
          <button onClick={() => { onRevealAll(); setOpen(false); }}>👁 Reveal all roles</button>
          <button onClick={() => { onReset(); setOpen(false); }}>↺ Reset game</button>
          <button onClick={() => { onExit(); setOpen(false); }}>← Leave grimoire</button>
        </div>
      )}
    </div>
  );
}
