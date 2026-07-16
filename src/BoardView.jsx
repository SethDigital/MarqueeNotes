import React, { useRef, useState, useEffect } from "react";
import {
  Plus, ArrowLeft, Pin, PinOff, Trash2, Check, ImagePlus, X,
  GripVertical, Clock, Bookmark, LayoutGrid,
} from "lucide-react";
import {
  uid, newNote, NOTE_COLORS, getMe, setMe, tidyPositions,
  fileToDataURL, newDecoration, MAX_DECORATION_BYTES, DECORATION_TYPES,
} from "./store.js";
import { db, usingBackend } from "./db/index.js";
import WorkingAs from "./WorkingAs.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import Deadline from "./Deadline.jsx";

export default function BoardView({ team, project, fixedMe, onBack, onPatchProject }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const [localMe, setLocalMe] = useState(() => getMe(team.id));
  const me = fixedMe || localMe;

  const changeMe = (name) => { setMe(team.id, name); setLocalMe(name); };

  // Coalesce rapid note edits into one write per note. On localStorage the
  // write is a cheap synchronous save, so persist immediately; on the backend,
  // debounce so typing doesn't fire a query (and a realtime echo) per keystroke.
  const pending = useRef(new Map()); // noteId -> { note, timer }
  const persistNote = (note) => {
    if (!usingBackend) { db.updateNote(team.id, project.id, note); return; }
    const existing = pending.current.get(note.id);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      pending.current.delete(note.id);
      db.updateNote(team.id, project.id, note);
    }, 450);
    pending.current.set(note.id, { note, timer });
  };
  const cancelPending = (noteId) => {
    const existing = pending.current.get(noteId);
    if (existing) { clearTimeout(existing.timer); pending.current.delete(noteId); }
  };
  // Leaving the board? Flush any edit still waiting so it isn't lost.
  useEffect(() => () => {
    for (const { note } of pending.current.values()) db.updateNote(team.id, project.id, note);
    pending.current.clear();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Every mutation updates the on-screen tree optimistically, then persists the
  // concrete object through the repository (localStorage or Supabase).
  const updateNote = (noteId, fn) => {
    const current = project.notes.find((n) => n.id === noteId);
    if (!current) return;
    const next = fn(current);
    onPatchProject((p) => ({ ...p, notes: p.notes.map((n) => (n.id === noteId ? next : n)) }));
    persistNote(next);
  };

  const addNote = () => {
    const note = newNote(project.notes.length);
    onPatchProject((p) => ({ ...p, notes: [...p.notes, note] }));
    db.createNote(team.id, project.id, note);
  };

  const deleteNote = (noteId) => {
    cancelPending(noteId); // drop any queued write for a note we're removing
    onPatchProject((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== noteId) }));
    db.deleteNote(team.id, project.id, noteId);
  };

  // "Tidy up" — snap the free-floating notes back into neat columns.
  const tidyUp = () => {
    const width = canvasRef.current?.clientWidth || 1200;
    const slots = tidyPositions(project.notes.length, width);
    const positions = project.notes.map((n, i) => ({ id: n.id, x: slots[i].x, y: slots[i].y }));
    const by = new Map(positions.map((x) => [x.id, x]));
    // Stale queued writes hold pre-tidy coordinates; drop them so they can't
    // undo the new layout.
    for (const id of [...pending.current.keys()]) cancelPending(id);
    onPatchProject((p) => ({ ...p, notes: p.notes.map((n) => ({ ...n, ...by.get(n.id) })) }));
    db.updateNotePositions(team.id, project.id, positions);
  };

  /* ------------------- decoration upload framework -------------------- */
  // "Decorate" opens a hidden file input. The chosen image (PNG, JPEG, WebP,
  // or transparent GIF) is read as a data URL and saved with the board, then
  // rendered as a draggable, resizable sticker behind the notes.
  const uploadDecoration = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_DECORATION_BYTES) {
      window.alert(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the demo build keeps decorations under ${(MAX_DECORATION_BYTES / 1024 / 1024).toFixed(1)} MB so boards stay snappy.`
      );
      return;
    }
    const src = await fileToDataURL(file);
    const deco = newDecoration(src, project.decorations.length);
    onPatchProject((p) => ({ ...p, decorations: [...p.decorations, deco] }));
    db.createDecoration(team.id, project.id, deco);
  };

  const updateDecoration = (decorId, fn) => {
    const current = project.decorations.find((d) => d.id === decorId);
    if (!current) return;
    const next = fn(current);
    onPatchProject((p) => ({ ...p, decorations: p.decorations.map((d) => (d.id === decorId ? next : d)) }));
    db.updateDecoration(team.id, project.id, next);
  };

  const deleteDecoration = (decorId) => {
    onPatchProject((p) => ({ ...p, decorations: p.decorations.filter((d) => d.id !== decorId) }));
    db.deleteDecoration(team.id, project.id, decorId);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> {team.name}</button>
        <h1>{project.name}</h1>
        {!fixedMe && <WorkingAs team={team} me={me} onChange={changeMe} />}
        <ThemeSwitcher />
        <button className="btn" title="Line the notes up in neat columns" onClick={tidyUp}>
          <LayoutGrid size={16} /> Tidy up
        </button>
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
        {/* The canvas is the positioned surface notes and decorations live on. */}
        <div className="canvas" ref={canvasRef}>
          {project.decorations.map((d) => (
            <Decoration
              key={d.id}
              decor={d}
              onChange={(fn) => updateDecoration(d.id, fn)}
              onDelete={() => deleteDecoration(d.id)}
            />
          ))}

          {project.notes.length === 0 && (
            <p className="board-empty">A clean board. Stick up the first note, then drag it anywhere.</p>
          )}

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
  const [live, setLive] = useState(null);

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
    track(e, (dx, dy) => ({ x: Math.max(0, decor.x + dx), y: Math.max(0, decor.y + dy), w: decor.w }));
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
  const rootRef = useRef(null);
  const [live, setLive] = useState(null);      // transient position while dragging
  const [pinMenu, setPinMenu] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [newItem, setNewItem] = useState("");

  const doneCount = note.items.filter((i) => i.done).length;
  const tunneled = me && note.tunnels.includes(me);

  /* --- free drag: reposition the note anywhere on the canvas --- */
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
    const text = newItem.trim();
    if (!text) return;
    onChange((n) => ({
      ...n,
      items: [...n.items, { id: uid(), text, done: false, assignee: null, assignedBy: null, doneBy: null }],
    }));
    setNewItem("");
  };

  const updateItem = (itemId, fn) =>
    onChange((n) => ({ ...n, items: n.items.map((i) => (i.id === itemId ? fn(i) : i)) }));

  // Tunnel this note onto my personal dashboard (a link, not a copy).
  const toggleTunnel = () => {
    if (!me) return window.alert("Pick who you are with the “You’re” menu up top, then you can tunnel notes to your dashboard.");
    onChange((n) => ({
      ...n,
      tunnels: n.tunnels.includes(me) ? n.tunnels.filter((x) => x !== me) : [...n.tunnels, me],
    }));
  };

  const setDeadline = (value) =>
    onChange((n) => ({ ...n, deadlineAt: value ? new Date(value + "T23:59:59").toISOString() : null }));

  const pos = live || note;
  return (
    <div
      ref={rootRef}
      className={"note" + (live ? " dragging" : "")}
      style={{ left: pos.x, top: pos.y, "--note-color": note.color, transform: `rotate(${note.rot}deg)` }}
      onPointerDown={startDrag}
    >
      {note.pin && (
        <div className="note-pin-flag">
          <Pin size={12} /> {note.pin.to === "team" ? "Team" : note.pin.member}
        </div>
      )}

      <div className="note-toolbar">
        <span className="note-grip" title="Drag to move"><GripVertical size={15} /></span>
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

      {note.deadlineAt && <Deadline deadlineIso={note.deadlineAt} />}

      <ul className="note-items">
        {note.items.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <button
              className={"check" + (item.done ? " checked" : "")}
              title={item.done ? "Mark as not done" : me ? `Check off as ${me}` : "Check off"}
              onClick={() =>
                updateItem(item.id, (i) => ({ ...i, done: !i.done, doneBy: !i.done ? me || null : null }))
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
            className={"icon-btn" + (tunneled ? " on" : "")}
            title={tunneled ? "Remove from your dashboard" : "Tunnel to your dashboard"}
            onClick={toggleTunnel}
          >
            <Bookmark size={15} />
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
