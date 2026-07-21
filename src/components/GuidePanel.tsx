import { useState, type ReactNode } from "react";
import type { HostState } from "../types";
import type { WalkStep } from "../roles";
import { DAY_STEPS, SETUP_CHECK } from "../roles";

interface Props {
  state: HostState;
  nightSteps: WalkStep[];
  skipped: string[];
  showDead: boolean;
  onToggleDead: () => void;
  seatName: (id: string) => string;
  act: (a: any) => void;
  canAutoFill: boolean;
  onAutoFill: () => void;
  onRevealAll: () => void;
  actionable: boolean;
  onOpenAction: () => void;
  onPushInstruction: () => void;
}

// Collapsible "words to say aloud" block for the current step.
function SayThis({ script }: { script?: string }) {
  const [open, setOpen] = useState(true);
  if (!script) return null;
  return (
    <div className="guide__script-wrap">
      <button className="linkish" onClick={() => setOpen((v) => !v)}>
        📖 {open ? "Hide script" : "Say this"}
      </button>
      {open && <p className="guide__script">“{script}”</p>}
    </div>
  );
}

// The interactive Storyteller guide. Drives the game (setup → nights → days).
// The detailed body slides away when minimised so it doesn't cover the grimoire,
// while Back/Next stay available.
export function GuidePanel(props: Props) {
  const { state: s, nightSteps, skipped, showDead, onToggleDead, seatName, act } = props;
  const [collapsed, setCollapsed] = useState(false);
  const setStep = (index: number) => act({ kind: "setStep", index });
  const goPhase = (phase: HostState["phase"]) => act({ kind: "setPhase", phase });

  let variant = "setup";
  let phaseLabel = "Setup";
  let info = "";
  let title = "";
  let body: ReactNode = null;
  let back: ReactNode = null;
  let primary: ReactNode = null;

  if (s.phase.type === "setup") {
    const assigned = s.seats.filter((x) => x.characterId).length;
    const revealed = s.seats.filter((x) => x.roleRevealed).length;
    const bluffs = s.bluffs.filter(Boolean).length;
    const allAssigned = assigned === s.seats.length && assigned > 0;
    const ready = s.seats.length >= 5 && allAssigned;
    const done = [s.seats.length >= 5, allAssigned, bluffs === 3, revealed === s.seats.length && revealed > 0];
    variant = "setup";
    title = "Setup";
    info = `${assigned}/${s.seats.length} assigned · ${bluffs}/3 bluffs · ${revealed} revealed`;
    body = (
      <>
        <ol className="guide__checklist">
          {SETUP_CHECK.map((t, i) => (
            <li key={i} className={done[i] ? "ok" : ""}>
              <span className="tick">{done[i] ? "✓" : i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        <div className="guide__actions">
          <button className="pbtn" disabled={!props.canAutoFill} onClick={props.onAutoFill}>
            🎲 Auto-fill roles
          </button>
          <button className="pbtn" disabled={!allAssigned} onClick={props.onRevealAll}>
            👁 Reveal all to players
          </button>
        </div>
        {!ready && <p className="muted small">Assign a character to every seat (min 5 players) to begin.</p>}
      </>
    );
    primary = (
      <button className="pbtn primary-btn" disabled={!ready} onClick={() => goPhase({ type: "night", count: 1 })}>
        Begin Night 1 ▶
      </button>
    );
  } else if (s.phase.type === "night") {
    const idx = Math.min(s.stepIndex, nightSteps.length - 1);
    const step = nightSteps[idx];
    const atEnd = idx >= nightSteps.length - 1;
    const names = step?.seatIds.map(seatName).filter(Boolean) ?? [];
    const impaired = (step?.seatIds ?? [])
      .map((id) => s.seats.find((x) => x.id === id))
      .filter((x): x is HostState["seats"][number] => !!x && (x.poisoned || x.drunk))
      .map((x) => `${x.name} is ${x.poisoned ? "poisoned" : "drunk"}`);
    const fakes = (step?.seatIds ?? [])
      .map((id) => s.seats.find((x) => x.id === id))
      .filter((x): x is HostState["seats"][number] => !!x && !!x.shownCharacterId)
      .map((x) => x.name);
    variant = "night";
    phaseLabel = `Night ${s.phase.count}`;
    info = `Step ${idx + 1} / ${nightSteps.length}`;
    title = `${step?.meta ? "◆ " : ""}${step?.name ?? ""}`;
    body = (
      <>
        <div className="guide__title">{title}</div>
        <p className="guide__text">{step?.reminder}</p>
        {names.length > 0 && (
          <p className="guide__who">
            Wake: <b>{names.join(", ")}</b>
            {step?.dead && <span className="muted small"> (dead — normally skipped)</span>}
          </p>
        )}
        {impaired.length > 0 && (
          <p className="guide__warn">
            ⚠ {impaired.join(", ")} — their ability malfunctions. Act as if it doesn't work (give false or no
            information).
          </p>
        )}
        {fakes.length > 0 && (
          <p className="guide__warn">
            🎭 {fakes.join(", ")} aren't really this character (Drunk/Lunatic). Wake them to keep up the act, but
            their ability does nothing.
          </p>
        )}
        <SayThis script={step?.script} />
        {names.length > 0 && (
          <div className="guide__actions">
            {props.actionable && (
              <button className="pbtn primary-btn" onClick={props.onOpenAction}>
                🎯 Resolve on screen
              </button>
            )}
            <button className="pbtn" onClick={props.onPushInstruction}>
              📱 Show on their phone
            </button>
          </div>
        )}
        {(skipped.length > 0 || showDead) && (
          <div className="guide__skip">
            {skipped.length > 0 && (
              <span className="muted small">
                Skipped (dead): <b>{skipped.join(", ")}</b>
              </span>
            )}
            <button className="linkish" onClick={onToggleDead}>
              {showDead ? "Hide dead" : "Show dead"}
            </button>
          </div>
        )}
      </>
    );
    back = (
      <button className="pbtn" disabled={idx === 0} onClick={() => setStep(idx - 1)}>
        ◀ Back
      </button>
    );
    primary = atEnd ? (
      <button className="pbtn primary-btn" onClick={() => goPhase({ type: "day", count: s.phase.count })}>
        Start Day {s.phase.count} ▶
      </button>
    ) : (
      <button className="pbtn primary-btn" onClick={() => setStep(idx + 1)}>
        Next ▶
      </button>
    );
  } else {
    // Day
    const idx = Math.min(s.stepIndex, DAY_STEPS.length - 1);
    const step = DAY_STEPS[idx];
    const atEnd = idx >= DAY_STEPS.length - 1;
    const executed = s.day.executedSeatId ? seatName(s.day.executedSeatId) : null;
    variant = "day";
    phaseLabel = `Day ${s.phase.count}`;
    info = `Step ${idx + 1} / ${DAY_STEPS.length}`;
    title = step.title;
    body = (
      <>
        <div className="guide__title">{step.title}</div>
        <p className="guide__text">{step.text}</p>
        {(step.id === "voting" || step.id === "endday") && (
          <p className="guide__who">
            {executed ? (
              <>
                Executed today: <b>{executed}</b>
              </>
            ) : s.day.noExecution ? (
              <>No execution today.</>
            ) : (
              <span className="muted">Execution not confirmed. Close a vote to execute, or mark no execution.</span>
            )}
          </p>
        )}
        <SayThis script={step.script} />
        {step.id === "endday" && !executed && !s.day.noExecution && (
          <div className="guide__actions">
            <button className="pbtn" onClick={() => act({ kind: "recordExecution", seatId: null })}>
              Confirm: no one executed today
            </button>
          </div>
        )}
      </>
    );
    back = (
      <button className="pbtn" disabled={idx === 0} onClick={() => setStep(idx - 1)}>
        ◀ Back
      </button>
    );
    primary = atEnd ? (
      <button className="pbtn primary-btn" onClick={() => goPhase({ type: "night", count: s.phase.count + 1 })}>
        Start Night {s.phase.count + 1} ▶
      </button>
    ) : (
      <button className="pbtn primary-btn" onClick={() => setStep(idx + 1)}>
        Next ▶
      </button>
    );
  }

  return (
    <div className={`guide guide--${variant} ${collapsed ? "guide--collapsed" : ""}`}>
      <div className="guide__bar" onClick={() => setCollapsed((c) => !c)}>
        <span className="guide__grip" />
        <span className="guide__phase">{phaseLabel}</span>
        <span className="guide__count">{collapsed ? title : info}</span>
        <span className="guide__chevron">{collapsed ? "▲" : "▼"}</span>
      </div>
      {!collapsed && <div className="guide__content">{body}</div>}
      <div className="guide__nav">
        {back}
        {primary}
      </div>
    </div>
  );
}
