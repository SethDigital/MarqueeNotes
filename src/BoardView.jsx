import React, { useRef, useState, useEffect } from "react";
import { Plus, ArrowLeft, X, LayoutGrid, Layers, Bookmark, Sticker as StickerIcon } from "lucide-react";
import {
  newNote, getMe, setMe, tidyPositions, isNoteComplete, isNoteActive,
  fileToDataURL, newDecoration, newSticker, MAX_STICKER_BYTES,
} from "./store.js";
import { db, usingBackend } from "./db/index.js";
import WorkingAs from "./WorkingAs.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import CustomizeButton from "./CustomizeButton.jsx";
import StickyNote from "./StickyNote.jsx";
import CompletedNotesModal from "./CompletedNotesModal.jsx";
import StickersModal from "./StickersModal.jsx";

export default function BoardView({ team, project, fixedMe, onBack, onOpenMyBoard, onPatchProject }) {
  const canvasRef = useRef(null);
  const [localMe, setLocalMe] = useState(() => getMe(team.id));
  const me = fixedMe || localMe;
  const [completedOpen, setCompletedOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  // Notes still on the board vs. the Completed stack (finished-in-place AND
  // soft-deleted notes — both carry a completedAt).
  const boardNotes = project.notes.filter(isNoteActive);
  const completedNotes = project.notes.filter(isNoteComplete);
  // Placed decorations only carry a stickerId; resolve each to its image here
  // so <Decoration> stays a dumb renderer.
  const stickerSrc = new Map(project.stickers.map((s) => [s.id, s.src]));

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

  // "Deleting" a note archives it: it leaves the board but is kept in the
  // Completed stack with its step-completion record intact. Marking it completed
  // (if it wasn't already) is what lands it there; deletedAt is what removes it
  // from the board. Persist immediately — this isn't debounced typing.
  const deleteNote = (noteId) => {
    const current = project.notes.find((n) => n.id === noteId);
    if (!current) return;
    cancelPending(noteId); // supersede any queued edit with this archive write
    const now = new Date().toISOString();
    const archived = { ...current, deletedAt: now, completedAt: current.completedAt || now };
    onPatchProject((p) => ({ ...p, notes: p.notes.map((n) => (n.id === noteId ? archived : n)) }));
    db.updateNote(team.id, project.id, archived);
  };

  // "Tidy up" — snap the free-floating notes back into neat columns. Only the
  // notes actually on the board; archived ones aren't shown, so skip them.
  const tidyUp = () => {
    const width = canvasRef.current?.clientWidth || 1200;
    const slots = tidyPositions(boardNotes.length, width);
    const positions = boardNotes.map((n, i) => ({ id: n.id, x: slots[i].x, y: slots[i].y }));
    const by = new Map(positions.map((x) => [x.id, x]));
    // Stale queued writes hold pre-tidy coordinates; drop them so they can't
    // undo the new layout.
    for (const id of [...pending.current.keys()]) cancelPending(id);
    onPatchProject((p) => ({ ...p, notes: p.notes.map((n) => ({ ...n, ...by.get(n.id) })) }));
    db.updateNotePositions(team.id, project.id, positions);
  };

  /* ------------------------ sticker library + placement ----------------- */
  // A "sticker" is the reusable image asset — stays with the board once
  // uploaded. A "decoration" is one placement of a sticker on the canvas;
  // many can point at the same sticker, so dropping it on again never
  // re-uploads. Uploading adds a library entry AND places one instance,
  // matching the old "pick a file, it appears" behavior; picking an existing
  // sticker from the library just adds another placement.
  const uploadSticker = async (file) => {
    if (file.size > MAX_STICKER_BYTES) {
      window.alert(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the demo build keeps stickers under ${(MAX_STICKER_BYTES / 1024 / 1024).toFixed(1)} MB so boards stay snappy.`
      );
      return;
    }
    const src = await fileToDataURL(file);
    const sticker = newSticker(src);
    onPatchProject((p) => ({ ...p, stickers: [...p.stickers, sticker] }));
    db.createSticker(team.id, project.id, sticker);
    placeSticker(sticker.id);
  };

  const placeSticker = (stickerId) => {
    const deco = newDecoration(stickerId, project.decorations.length);
    onPatchProject((p) => ({ ...p, decorations: [...p.decorations, deco] }));
    db.createDecoration(team.id, project.id, deco);
  };

  // Removing a sticker from the library takes every placement of it down too
  // (mirrors the ON DELETE CASCADE on decorations.sticker_id — see 0005_stickers.sql).
  const removeSticker = (stickerId) => {
    onPatchProject((p) => ({
      ...p,
      stickers: p.stickers.filter((s) => s.id !== stickerId),
      decorations: p.decorations.filter((d) => d.stickerId !== stickerId),
    }));
    db.deleteSticker(team.id, project.id, stickerId);
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
        <CustomizeButton />
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
        <button className="btn" title="Reusable images for this board" onClick={() => setStickersOpen(true)}>
          <StickerIcon size={16} /> Stickers
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
              src={stickerSrc.get(d.stickerId)}
              onChange={(fn) => updateDecoration(d.id, fn)}
              onDelete={() => deleteDecoration(d.id)}
            />
          ))}

          {boardNotes.length === 0 && (
            <p className="board-empty">A clean board. Stick up the first note, then drag it anywhere.</p>
          )}

          {boardNotes.map((note) => (
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

      {stickersOpen && (
        <StickersModal
          stickers={project.stickers}
          onUpload={uploadSticker}
          onPlace={placeSticker}
          onDelete={removeSticker}
          onClose={() => setStickersOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------------------------- decorations ------------------------------- */
// A decoration is one placement of a sticker: position/size only, dragged
// anywhere and resized from its corner handle. `src` is resolved by the
// caller from the sticker library (decor itself just carries a stickerId).
function Decoration({ decor, src, onChange, onDelete }) {
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

  if (!src) return null; // its sticker was just removed from the library

  const pos = live || decor;
  return (
    <div
      className={"decoration" + (live ? " active" : "")}
      style={{ left: pos.x, top: pos.y, width: pos.w }}
      onPointerDown={startDrag}
    >
      <img src={src} alt="" draggable={false} />
      <button className="icon-btn decor-delete" title="Remove this placement" onClick={onDelete}>
        <X size={13} />
      </button>
      <div className="decor-resize" title="Drag to resize" onPointerDown={startResize} />
    </div>
  );
}
