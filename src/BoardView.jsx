import React, { useRef, useState, useEffect } from "react";
import { Plus, ArrowLeft, ImagePlus, X, LayoutGrid, Layers, Bookmark } from "lucide-react";
import {
  newNote, getMe, setMe, tidyPositions, isNoteComplete,
  fileToDataURL, newDecoration, MAX_DECORATION_BYTES, DECORATION_TYPES,
} from "./store.js";
import { db, usingBackend } from "./db/index.js";
import WorkingAs from "./WorkingAs.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import StickyNote from "./StickyNote.jsx";
import CompletedNotesModal from "./CompletedNotesModal.jsx";

export default function BoardView({ team, project, fixedMe, onBack, onOpenMyBoard, onPatchProject }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const [localMe, setLocalMe] = useState(() => getMe(team.id));
  const me = fixedMe || localMe;
  const [completedOpen, setCompletedOpen] = useState(false);
  const completedNotes = project.notes.filter(isNoteComplete);

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
        <button className="btn" title="Everything you've yoinked, across teams" onClick={onOpenMyBoard}>
          <Bookmark size={16} /> My Board
        </button>
        <ThemeSwitcher />
        <button
          className="btn"
          title="See everything finished on this board"
          onClick={() => setCompletedOpen(true)}
        >
          <Layers size={16} /> Completed
          {completedNotes.length > 0 && <span className="stack-count">{completedNotes.length}</span>}
        </button>
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

      {completedOpen && (
        <CompletedNotesModal
          boardName={project.name}
          notes={completedNotes}
          onClose={() => setCompletedOpen(false)}
        />
      )}
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
