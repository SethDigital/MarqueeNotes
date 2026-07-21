import React, { useRef, useState, useLayoutEffect } from "react";
import {
  Pin, PinOff, Trash2, Check, CheckCircle2, GripVertical, Clock, Bookmark, X, Palette, RotateCcw,
} from "lucide-react";
import { newItem, NOTE_COLORS, isNoteComplete, normalizeHexColor } from "./store.js";
import Deadline from "./Deadline.jsx";

const MIN_NOTE_W = 180;
const MIN_NOTE_H = 150;

// One sticky note. Two layouts via `variant`:
//   "board"  — free-drag on the team-board canvas (absolute positioning).
//   "static" — fixed in a grid on My Board; edits still write through to the
//              same note object, so they land on the original team-board note.
export default function StickyNote({ note, members, me, onChange, onDelete, variant = "board" }) {
  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const [live, setLive] = useState(null);      // transient position while dragging
  const [liveRot, setLiveRot] = useState(null);   // transient angle while rotating
  const [liveSize, setLiveSize] = useState(null); // transient {w,h} while resizing
  const [pinMenu, setPinMenu] = useState(false);
  const [colorMenu, setColorMenu] = useState(false);
  const [hexDraft, setHexDraft] = useState(note.color);
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

  const setColor = (hex) => {
    onChange((n) => ({ ...n, color: hex }));
    setHexDraft(hex);
  };
  const openColorMenu = () => {
    setHexDraft(note.color);
    setColorMenu(true);
  };
  // Commit the typed hex on blur/Enter; an incomplete or invalid value just
  // reverts to the note's current color rather than erroring loudly.
  const commitHexDraft = () => {
    const normalized = normalizeHexColor(hexDraft);
    if (normalized) setColor(normalized);
    else setHexDraft(note.color);
  };

  // Drag the corner handle to rotate around the note's center. Delta-based, so
  // it works from any handle position and regardless of the starting angle.
  const startRotate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = rootRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const rot0 = note.rot || 0;
    let latest = rot0;
    const move = (ev) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      latest = Math.round(rot0 + ((a - a0) * 180) / Math.PI);
      setLiveRot(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLiveRot(null);
      onChange((n) => ({ ...n, rot: latest }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resetRotation = () => onChange((n) => ({ ...n, rot: 0 }));

  // Drag the bottom-right handle to resize. The pointer delta is rotated back
  // into the note's own axes so "wider/taller" tracks the note even when it's
  // been turned. First drag starts from the note's current rendered height so
  // an auto-height note doesn't jump.
  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = note.w || rootRef.current.offsetWidth || 240;
    const startH = note.h || rootRef.current.offsetHeight || 200;
    const rad = -(note.rot || 0) * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let latest = { w: startW, h: startH };
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      latest = {
        w: Math.max(MIN_NOTE_W, Math.round(startW + dx * cos - dy * sin)),
        h: Math.max(MIN_NOTE_H, Math.round(startH + dx * sin + dy * cos)),
      };
      setLiveSize({ ...latest });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLiveSize(null);
      onChange((n) => ({ ...n, w: latest.w, h: latest.h }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Keep the title textarea sized to its wrapped content (it wraps instead of
  // scrolling sideways). Re-runs when the text or the note's width changes.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [note.title, note.w, liveSize]);

  const pos = live || note;
  const size = liveSize || note;
  const rot = liveRot ?? note.rot;
  const style = isStatic
    ? { "--note-color": note.color }
    : {
        left: pos.x,
        top: pos.y,
        width: size.w || 240,
        ...(size.h ? { height: size.h } : {}),
        "--note-color": note.color,
        transform: `rotate(${rot}deg)`,
      };

  return (
    <div
      ref={rootRef}
      className={
        "note" +
        (isStatic ? " static" : "") +
        (live ? " dragging" : "") +
        (liveSize || liveRot != null ? " transforming" : "") +
        (completed ? " completed" : "")
      }
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
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="color-wrap">
          <button
            className="icon-btn"
            title="Custom color"
            onClick={() => (colorMenu ? setColorMenu(false) : openColorMenu())}
          >
            <Palette size={14} />
          </button>
          {colorMenu && (
            <div className="color-menu">
              <input
                type="color"
                className="color-native"
                value={note.color}
                title="Pick a color"
                onChange={(e) => setColor(e.target.value)}
              />
              <input
                className="color-hex-input"
                value={hexDraft}
                placeholder="#RRGGBB"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={commitHexDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitHexDraft(); }
                }}
              />
            </div>
          )}
        </div>
        {!isStatic && (
          <button className="icon-btn" title="Take this note down (kept in Completed)" onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <div className="note-scroll">
      <textarea
        ref={titleRef}
        className="note-title"
        rows={1}
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
          {!isStatic && Math.round(note.rot) !== 0 && (
            <button className="icon-btn" title="Straighten (reset rotation)" onClick={resetRotation}>
              <RotateCcw size={15} />
            </button>
          )}
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

      {!isStatic && (
        <>
          <div className="note-rotate" title="Drag to rotate" onPointerDown={startRotate} />
          <div className="note-resize" title="Drag to resize" onPointerDown={startResize} />
        </>
      )}
    </div>
  );
}
