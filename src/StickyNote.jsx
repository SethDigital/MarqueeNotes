import React, { useRef, useState } from "react";
import {
  Pin, PinOff, Trash2, Check, CheckCircle2, GripVertical, Clock, Bookmark, X,
} from "lucide-react";
import { newItem, NOTE_COLORS, isNoteComplete } from "./store.js";
import Deadline from "./Deadline.jsx";

// One sticky note. Two layouts via `variant`:
//   "board"  — free-drag on the team-board canvas (absolute positioning).
//   "static" — fixed in a grid on My Board; edits still write through to the
//              same note object, so they land on the original team-board note.
export default function StickyNote({ note, members, me, onChange, onDelete, variant = "board" }) {
  const rootRef = useRef(null);
  const [live, setLive] = useState(null);      // transient position while dragging
  const [pinMenu, setPinMenu] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [newText, setNewText] = useState("");

  const isStatic = variant === "static";
  const doneCount = note.items.filter((i) => i.done).length;
  const yoinked = me && note.tunnels.includes(me);
  const completed = isNoteComplete(note);

  /* --- free drag: reposition the note anywhere on the canvas (board only) --- */
  const startDrag = (e) => {
    // Don't start a drag when grabbing a control — only the note body/handle.
    if (e.target.closest("input,button,select,textarea,a,.swatch")) return;
    e.preventDefault();
    const canvas = rootRef.current.parentElement.getBoundingClientRect();
    const grabX = e.clientX - canvas.left - note.x;
    const grabY = e.clientY - canvas.top - note.y;
    let latest = { x: note.x, y: note.y };
    const move = (ev) => {
      const c = rootRef.current.parentElement.getBoundingClientRect();
      latest = {
        x: Math.max(0, ev.clientX - c.left - grabX),
        y: Math.max(0, ev.clientY - c.top - grabY),
      };
      setLive({ ...latest });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLive(null);
      onChange((n) => ({ ...n, x: latest.x, y: latest.y })); // persist final spot
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    onChange((n) => ({ ...n, items: [...n.items, newItem(text)] }));
    setNewText("");
  };

  const updateItem = (itemId, fn) =>
    onChange((n) => ({ ...n, items: n.items.map((i) => (i.id === itemId ? fn(i) : i)) }));

  // Check/uncheck a step. Stamps who/when on check, and keeps the note's own
  // completedAt in sync: the last step checked auto-completes the note; an
  // unchecked step reopens it. (An explicit "Mark complete" stays put when you
  // *check* remaining steps — only unchecking reopens.)
  const toggleItemDone = (item) =>
    onChange((n) => {
      const nowChecking = !item.done;
      const iso = new Date().toISOString();
      const items = n.items.map((i) =>
        i.id === item.id
          ? { ...i, done: nowChecking, doneBy: nowChecking ? me || null : null, doneAt: nowChecking ? iso : null }
          : i
      );
      const allDone = items.length > 0 && items.every((i) => i.done);
      let completedAt = n.completedAt;
      if (nowChecking && allDone && !completedAt) completedAt = iso; // auto-complete
      if (!nowChecking && completedAt) completedAt = null;           // uncheck reopens
      return { ...n, items, completedAt };
    });

  // Explicit complete / reopen — the "end a note early" path (works even with
  // steps still open).
  const toggleComplete = () =>
    onChange((n) => ({ ...n, completedAt: n.completedAt ? null : new Date().toISOString() }));

  // Yoink this note onto my personal board (a link, not a copy). In the static
  // My Board variant this same toggle removes it from my board.
  const toggleYoink = () => {
    if (!me) return window.alert("Pick who you are with the “You’re” menu up top, then you can Yoink notes onto My Board.");
    onChange((n) => ({
      ...n,
      tunnels: n.tunnels.includes(me) ? n.tunnels.filter((x) => x !== me) : [...n.tunnels, me],
    }));
  };

  const setDeadline = (value) =>
    onChange((n) => ({ ...n, deadlineAt: value ? new Date(value + "T23:59:59").toISOString() : null }));

  const pos = live || note;
  const style = isStatic
    ? { "--note-color": note.color }
    : { left: pos.x, top: pos.y, "--note-color": note.color, transform: `rotate(${note.rot}deg)` };

  return (
    <div
      ref={rootRef}
      className={"note" + (isStatic ? " static" : "") + (live ? " dragging" : "") + (completed ? " completed" : "")}
      style={style}
      onPointerDown={isStatic ? undefined : startDrag}
    >
      {note.pin && !isStatic && (
        <div className="note-pin-flag">
          <Pin size={12} /> {note.pin.to === "team" ? "Team" : note.pin.member}
        </div>
      )}
      {completed && (
        <div className="note-completed-flag" title="This note is completed">
          <CheckCircle2 size={12} /> Done
        </div>
      )}

      <div className="note-toolbar">
        {!isStatic && <span className="note-grip" title="Drag to move"><GripVertical size={15} /></span>}
        {!isStatic && (
          <div className="pin-wrap">
            <button
              className={"icon-btn" + (note.pin ? " pinned" : "")}
              title={note.pin ? "Change or remove pin" : "Pin this note"}
              onClick={() => setPinMenu((v) => !v)}
            >
              <Pin size={15} />
            </button>
            {pinMenu && (
              <div className="pin-menu">
                <button onClick={() => { onChange((n) => ({ ...n, pin: { to: "team" } })); setPinMenu(false); }}>
                  <Pin size={13} /> Whole team
                </button>
                {members.map((m) => (
                  <button key={m} onClick={() => { onChange((n) => ({ ...n, pin: { to: "member", member: m } })); setPinMenu(false); }}>
                    {m}
                  </button>
                ))}
                {members.length === 0 && <div className="pin-menu-hint">Add members on the team screen to pin to a person.</div>}
                {note.pin && (
                  <button className="danger" onClick={() => { onChange((n) => ({ ...n, pin: null })); setPinMenu(false); }}>
                    <PinOff size={13} /> Unpin
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="swatches">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              className={"swatch" + (c === note.color ? " current" : "")}
              style={{ background: c }}
              title="Note color"
              onClick={() => onChange((n) => ({ ...n, color: c }))}
            />
          ))}
        </div>
        {!isStatic && (
          <button className="icon-btn" title="Take down this note" onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <input
        className="note-title"
        value={note.title}
        placeholder="Note title…"
        onChange={(e) => onChange((n) => ({ ...n, title: e.target.value }))}
      />

      {note.deadlineAt && <Deadline deadlineIso={note.deadlineAt} />}

      <ul className="note-items">
        {note.items.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <button
              className={"check" + (item.done ? " checked" : "")}
              title={item.done ? "Mark as not done" : me ? `Check off as ${me}` : "Check off"}
              onClick={() => toggleItemDone(item)}
            >
              {item.done && <Check size={11} />}
            </button>
            <span className="item-text">{item.text}</span>
            {item.done ? (
              item.doneBy && <span className="done-by" title={`Handled by ${item.doneBy}`}>{item.doneBy} ✓</span>
            ) : (
              <select
                className="assignee"
                title="Who's on this step?"
                value={item.assignee || ""}
                onChange={(e) =>
                  updateItem(item.id, (i) => ({
                    ...i,
                    assignee: e.target.value || null,
                    // Record who handed it out, so it shows under their "Distributed".
                    assignedBy: e.target.value ? me || null : null,
                  }))
                }
              >
                <option value="">–</option>
                {members.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
            <button
              className="icon-btn item-delete"
              title="Remove step"
              onClick={() => onChange((n) => ({ ...n, items: n.items.filter((i) => i.id !== item.id) }))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="note-add">
        <input
          value={newText}
          placeholder="Add a step…"
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.keyCode === 13) {
              e.preventDefault();
              addItem();
            }
          }}
        />
      </div>

      <div className="note-footer">
        <div className="note-actions">
          <button
            className={"icon-btn" + (note.deadlineAt ? " on" : "")}
            title="Set a deadline"
            onClick={() => setDateOpen((v) => !v)}
          >
            <Clock size={15} />
          </button>
          <button
            className={"icon-btn" + (yoinked ? " on" : "")}
            title={
              isStatic
                ? "Remove from My Board"
                : yoinked
                ? "Remove from My Board"
                : "Yoink to My Board"
            }
            onClick={toggleYoink}
          >
            <Bookmark size={15} />
          </button>
          <button
            className={"icon-btn" + (completed ? " complete-on" : "")}
            title={completed ? "Reopen note" : "Mark complete (can end early)"}
            onClick={toggleComplete}
          >
            <CheckCircle2 size={15} />
          </button>
        </div>
        {note.items.length > 0 && <span className="note-progress">{doneCount}/{note.items.length} done</span>}
      </div>

      {dateOpen && (
        <div className="note-deadline-edit">
          <input
            type="date"
            value={note.deadlineAt ? note.deadlineAt.slice(0, 10) : ""}
            onChange={(e) => setDeadline(e.target.value)}
          />
          {note.deadlineAt && (
            <button className="icon-btn" title="Clear deadline" onClick={() => setDeadline("")}>
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
