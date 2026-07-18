import React, { useState } from "react";
import { CheckCircle2, Clock, AlarmClock, ChevronRight, Check } from "lucide-react";
import Modal from "./Modal.jsx";
import { formatDelta } from "./Deadline.jsx";

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

// How much deadline time was left when the note was completed. Positive = ahead
// of the deadline, negative = past it.
function DeadlineSlack({ deadlineIso, completedIso }) {
  const ms = new Date(deadlineIso).getTime() - new Date(completedIso).getTime();
  const ahead = ms >= 0;
  const Icon = ahead ? Clock : AlarmClock;
  return (
    <div className={"completed-slack" + (ahead ? "" : " over")}>
      <Icon size={13} />
      {ahead
        ? `Finished ${formatDelta(ms)} before deadline`
        : `Finished ${formatDelta(-ms)} after the deadline`}
    </div>
  );
}

function CompletedRow({ note }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={"completed-row" + (open ? " open" : "")} style={{ "--note-color": note.color }}>
      <button className="completed-row-head" onClick={() => setOpen((v) => !v)}>
        <ChevronRight size={15} className="completed-chevron" />
        <span className="completed-title">{note.title || "Untitled note"}</span>
        <span className="completed-when">{fmt(note.completedAt)}</span>
      </button>
      {open && (
        <div className="completed-detail">
          {note.deadlineAt && (
            <DeadlineSlack deadlineIso={note.deadlineAt} completedIso={note.completedAt} />
          )}
          {note.items.length === 0 ? (
            <p className="completed-empty">No steps — this note was marked complete directly.</p>
          ) : (
            <ul className="completed-steps">
              {note.items.map((it) => (
                <li key={it.id} className={it.done ? "done" : "undone"}>
                  <span className={"completed-check" + (it.done ? " on" : "")}>
                    {it.done && <Check size={11} />}
                  </span>
                  <span className="completed-step-text">{it.text}</span>
                  {it.done ? (
                    <span className="completed-step-meta">
                      {it.doneBy ? `${it.doneBy} · ` : ""}{fmt(it.doneAt) || "done"}
                    </span>
                  ) : (
                    <span className="completed-step-meta muted">not done</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// The "stack of notes" viewer: every completed note on a board, newest
// completion first, each expandable to show who finished which step and when,
// plus how much deadline time was left.
export default function CompletedNotesModal({ boardName, notes, onClose }) {
  const sorted = [...notes].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  return (
    <Modal title={`Completed on ${boardName}`} onClose={onClose} wide>
      {sorted.length === 0 ? (
        <p className="hint">
          Nothing finished here yet. Check off every step on a note, or use <CheckCircle2 size={13} />{" "}
          on a note to mark it complete.
        </p>
      ) : (
        <>
          <p className="hint">{sorted.length} completed · newest first. Click a note for the details.</p>
          <ul className="completed-list">
            {sorted.map((note) => (
              <CompletedRow key={note.id} note={note} />
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
