import React, { useRef, useState } from "react";
import { Plus, ArrowLeft, Pin, PinOff, Trash2, Check } from "lucide-react";
import { uid, newNote, NOTE_COLORS } from "./store.js";

export default function BoardView({ team, project, onBack, onUpdateProject }) {
  const boardRef = useRef(null);

  const updateNote = (noteId, fn) =>
    onUpdateProject((p) => ({
      ...p,
      notes: p.notes.map((n) => (n.id === noteId ? fn(n) : n)),
    }));

  const addNote = () =>
    onUpdateProject((p) => ({ ...p, notes: [...p.notes, newNote(p.notes.length)] }));

  const deleteNote = (noteId) =>
    onUpdateProject((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== noteId) }));

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> {team.name}</button>
        <h1>{project.name}</h1>
        <button className="btn primary" onClick={addNote}><Plus size={16} /> New note</button>
      </header>

      <div className="board" ref={boardRef}>
        {project.notes.length === 0 && (
          <p className="board-empty">An empty board. Click “New note” to pin the first sticky.</p>
        )}
        {project.notes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            members={team.members}
            boardRef={boardRef}
            onChange={(fn) => updateNote(note.id, fn)}
            onDelete={() => deleteNote(note.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StickyNote({ note, members, boardRef, onChange, onDelete }) {
  const [drag, setDrag] = useState(null); // {x, y} while dragging
  const [pinMenu, setPinMenu] = useState(false);
  const [newItem, setNewItem] = useState("");

  const startDrag = (e) => {
    if (e.target.closest("input, button, select, textarea, label")) return;
    e.preventDefault();
    const board = boardRef.current.getBoundingClientRect();
    const offsetX = e.clientX - board.left - note.x + boardRef.current.scrollLeft;
    const offsetY = e.clientY - board.top - note.y + boardRef.current.scrollTop;

    const move = (ev) => {
      const b = boardRef.current.getBoundingClientRect();
      setDrag({
        x: Math.max(0, ev.clientX - b.left - offsetX + boardRef.current.scrollLeft),
        y: Math.max(0, ev.clientY - b.top - offsetY + boardRef.current.scrollTop),
      });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const b = boardRef.current.getBoundingClientRect();
      const x = Math.max(0, ev.clientX - b.left - offsetX + boardRef.current.scrollLeft);
      const y = Math.max(0, ev.clientY - b.top - offsetY + boardRef.current.scrollTop);
      setDrag(null);
      onChange((n) => ({ ...n, x, y }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pos = drag || { x: note.x, y: note.y };
  const doneCount = note.items.filter((i) => i.done).length;

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    onChange((n) => ({ ...n, items: [...n.items, { id: uid(), text, done: false }] }));
    setNewItem("");
  };

  return (
    <div
      className={"note" + (drag ? " dragging" : "")}
      style={{ left: pos.x, top: pos.y, background: note.color, transform: `rotate(${note.rot}deg)` }}
      onPointerDown={startDrag}
    >
      {note.pin && (
        <div className="note-pin-flag">
          <Pin size={12} /> {note.pin.to === "team" ? "Team" : note.pin.member}
        </div>
      )}

      <div className="note-toolbar">
        <div className="pin-wrap">
          <button
            className={"icon-btn" + (note.pin ? " pinned" : "")}
            title={note.pin ? "Change or remove pin" : "Pin this note"}
            onClick={() => setPinMenu((v) => !v)}
          >
            <Pin size={15} />
          </button>
          {pinMenu && (
            <div className="pin-menu" onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={() => { onChange((n) => ({ ...n, pin: { to: "team" } })); setPinMenu(false); }}>
                <Pin size={13} /> Whole team
              </button>
              {members.map((m) => (
                <button key={m} onClick={() => { onChange((n) => ({ ...n, pin: { to: "member", member: m } })); setPinMenu(false); }}>
                  {m}
                </button>
              ))}
              {members.length === 0 && <div className="pin-menu-hint">Add members in the team screen to pin to a person.</div>}
              {note.pin && (
                <button className="danger" onClick={() => { onChange((n) => ({ ...n, pin: null })); setPinMenu(false); }}>
                  <PinOff size={13} /> Unpin
                </button>
              )}
            </div>
          )}
        </div>
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
        <button className="icon-btn" title="Delete note" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>

      <input
        className="note-title"
        value={note.title}
        placeholder="Note title…"
        onChange={(e) => onChange((n) => ({ ...n, title: e.target.value }))}
      />

      <ul className="note-items">
        {note.items.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <button
              className={"check" + (item.done ? " checked" : "")}
              onClick={() =>
                onChange((n) => ({
                  ...n,
                  items: n.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                }))
              }
            >
              {item.done && <Check size={11} />}
            </button>
            <span>{item.text}</span>
            <button
              className="icon-btn item-delete"
              title="Remove item"
              onClick={() => onChange((n) => ({ ...n, items: n.items.filter((i) => i.id !== item.id) }))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="note-add">
        <input
          value={newItem}
          placeholder="Add list item…"
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.keyCode === 13) {
              e.preventDefault();
              addItem();
            }
          }}
        />
      </div>

      {note.items.length > 0 && (
        <div className="note-progress">{doneCount}/{note.items.length} done</div>
      )}
    </div>
  );
}
