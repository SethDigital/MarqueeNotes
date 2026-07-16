import React, { useRef, useState } from "react";
import { Plus, ArrowLeft, Pin, PinOff, Trash2, Check, ImagePlus, X } from "lucide-react";
import {
  uid, newNote, NOTE_COLORS, getMe, setMe,
  fileToDataURL, newDecoration, MAX_DECORATION_BYTES, DECORATION_TYPES,
} from "./store.js";
import WorkingAs from "./WorkingAs.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";

export default function BoardView({ team, project, onBack, onUpdateProject }) {
  const fileRef = useRef(null);
  const [me, setMeState] = useState(() => getMe(team.id));

  const changeMe = (name) => {
    setMe(team.id, name);
    setMeState(name);
  };

  const updateNote = (noteId, fn) =>
    onUpdateProject((p) => ({
      ...p,
      notes: p.notes.map((n) => (n.id === noteId ? fn(n) : n)),
    }));

  const addNote = () =>
    onUpdateProject((p) => ({ ...p, notes: [...p.notes, newNote(p.notes.length)] }));

  const deleteNote = (noteId) =>
    onUpdateProject((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== noteId) }));

  /* ------------------- decoration upload framework -------------------- */
  // "Add decoration" opens a hidden file input. The chosen image (PNG, JPEG,
  // WebP, or transparent GIF) is read as a data URL and saved with the board,
  // then rendered as a draggable, resizable sticker behind the notes.
  const uploadDecoration = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (file.size > MAX_DECORATION_BYTES) {
      window.alert(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the demo build keeps decorations under ${(MAX_DECORATION_BYTES / 1024 / 1024).toFixed(1)} MB so boards stay snappy.`
      );
      return;
    }
    const src = await fileToDataURL(file);
    onUpdateProject((p) => ({
      ...p,
      decorations: [...p.decorations, newDecoration(src, p.decorations.length)],
    }));
  };

  const updateDecoration = (decorId, fn) =>
    onUpdateProject((p) => ({
      ...p,
      decorations: p.decorations.map((d) => (d.id === decorId ? fn(d) : d)),
    }));

  const deleteDecoration = (decorId) =>
    onUpdateProject((p) => ({
      ...p,
      decorations: p.decorations.filter((d) => d.id !== decorId),
    }));

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> {team.name}</button>
        <h1>{project.name}</h1>
        <WorkingAs team={team} me={me} onChange={changeMe} />
        <ThemeSwitcher />
        {/* Hidden input backs the decoration upload button */}
        <input
          ref={fileRef}
          type="file"
          accept={DECORATION_TYPES}
          style={{ display: "none" }}
          onChange={uploadDecoration}
        />
        <button className="btn" title="Add an image or GIF to the board" onClick={() => fileRef.current.click()}>
          <ImagePlus size={16} /> Decorate
        </button>
        <button className="btn primary" onClick={addNote}><Plus size={16} /> New note</button>
      </header>

      <div className="board">
        {/* Decorations sit behind the notes; the grid lets clicks fall
            through to them everywhere except on the notes themselves. */}
        {project.decorations.map((d) => (
          <Decoration
            key={d.id}
            decor={d}
            onChange={(fn) => updateDecoration(d.id, fn)}
            onDelete={() => deleteDecoration(d.id)}
          />
        ))}

        {project.notes.length === 0 && (
          <p className="board-empty">A clean board. Stick up the first note — everyone opens to the same wall.</p>
        )}

        <div className="notes-grid">
          {project.notes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              members={team.members}
              me={me}
              onChange={(fn) => updateNote(note.id, fn)}
              onDelete={() => deleteNote(note.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- decorations ------------------------------- */
// A decoration is a floating image the user can drag anywhere on the board
// and resize from its corner handle. Stored per-project in store.js.
function Decoration({ decor, onChange, onDelete }) {
  const [live, setLive] = useState(null); // {x, y, w} while dragging/resizing

  const track = (e, apply) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let last = null;
    const move = (ev) => {
      last = apply(ev.clientX - startX, ev.clientY - startY);
      setLive(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLive(null);
      if (last) onChange(() => ({ ...decor, ...last }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startDrag = (e) => {
    if (e.target.closest("button")) return;
    track(e, (dx, dy) => ({
      x: Math.max(0, decor.x + dx),
      y: Math.max(0, decor.y + dy),
      w: decor.w,
    }));
  };

  const startResize = (e) =>
    track(e, (dx) => ({ x: decor.x, y: decor.y, w: Math.max(48, decor.w + dx) }));

  const pos = live || decor;
  return (
    <div
      className={"decoration" + (live ? " active" : "")}
      style={{ left: pos.x, top: pos.y, width: pos.w }}
      onPointerDown={startDrag}
    >
      <img src={decor.src} alt="" draggable={false} />
      <button className="icon-btn decor-delete" title="Remove decoration" onClick={onDelete}>
        <X size={13} />
      </button>
      <div className="decor-resize" title="Drag to resize" onPointerDown={startResize} />
    </div>
  );
}

/* ---------------------------- sticky note ------------------------------- */

function StickyNote({ note, members, me, onChange, onDelete }) {
  const [pinMenu, setPinMenu] = useState(false);
  const [newItem, setNewItem] = useState("");

  const doneCount = note.items.filter((i) => i.done).length;

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    onChange((n) => ({
      ...n,
      items: [...n.items, { id: uid(), text, done: false, assignee: null, doneBy: null }],
    }));
    setNewItem("");
  };

  const updateItem = (itemId, fn) =>
    onChange((n) => ({ ...n, items: n.items.map((i) => (i.id === itemId ? fn(i) : i)) }));

  return (
    <div className="note" style={{ "--note-color": note.color, transform: `rotate(${note.rot}deg)` }}>
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
        <button className="icon-btn" title="Take down this note" onClick={onDelete}>
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
              title={item.done ? "Mark as not done" : me ? `Check off as ${me}` : "Check off"}
              onClick={() =>
                updateItem(item.id, (i) => ({
                  ...i,
                  done: !i.done,
                  // Stamp who handled it so teammates don't redo the step.
                  doneBy: !i.done ? me || null : null,
                }))
              }
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
                onChange={(e) => updateItem(item.id, (i) => ({ ...i, assignee: e.target.value || null }))}
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
          value={newItem}
          placeholder="Add a step…"
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
