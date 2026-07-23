import React, { useRef, useState, useEffect } from "react";
import {
  Plus, ArrowLeft, X, LayoutGrid, Layers, Bookmark, Sticker as StickerIcon,
  ChevronUp, ChevronDown, Bookmark as BookmarkIcon, RotateCcw,
} from "lucide-react";
import {
  newNote, getMe, setMe, tidyPositions, isNoteComplete, isNoteActive,
  fileToDataURL, newDecoration, newSticker, MAX_STICKER_BYTES,
  nextZ, bringForward, sendBackward,
} from "./store.js";
import { db, usingBackend } from "./db/index.js";
import WorkingAs from "./WorkingAs.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import CustomizeButton from "./CustomizeButton.jsx";
import StickyNote from "./StickyNote.jsx";
import CompletedNotesModal from "./CompletedNotesModal.jsx";
import StickersModal from "./StickersModal.jsx";

export default function BoardView({ team, project, fixedMe, onBack, onOpenMyBoard, onPatchProject, stash, onAddToStash, onRemoveFromStash }) {
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
    const note = { ...newNote(project.notes.length), z: nextZ(project) };
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
    const deco = { ...newDecoration(stickerId, project.decorations.length), z: nextZ(project) };
    onPatchProject((p) => ({ ...p, decorations: [...p.decorations, deco] }));
    db.createDecoration(team.id, project.id, deco);
  };

  // Place a sticker from the personal stash onto this board. The stash image
  // isn't in this board's library yet, so add it first (deduped by src), then
  // drop a decoration that references the new library entry.
  const placeFromStash = (src) => {
    let sticker = project.stickers.find((s) => s.src === src);
    if (!sticker) {
      sticker = newSticker(src);
      onPatchProject((p) => ({ ...p, stickers: [...p.stickers, sticker] }));
      db.createSticker(team.id, project.id, sticker);
    }
    placeSticker(sticker.id);
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

  /* ----------------------------- layering ------------------------------- */
  // Notes and decorations share one z stack. A one-step move swaps z with the
  // nearest neighbor, so both items get updated — here we apply both sides to
  // the tree and persist each through its own repo method.
  const combinedLayers = () => [
    ...project.decorations.map((d) => ({ id: d.id, z: d.z, kind: "decor" })),
    ...project.notes.map((n) => ({ id: n.id, z: n.z, kind: "note" })),
  ];
  const applyLayerSwap = (changes) => {
    if (!changes.size) return;
    const updatedNotes = {}, updatedDecors = {};
    for (const [id, z] of changes) {
      const item = combinedLayers().find((x) => x.id === id);
      if (!item) continue;
      (item.kind === "note" ? updatedNotes : updatedDecors)[id] = z;
    }
    if (Object.keys(updatedNotes).length) {
      onPatchProject((p) => ({
        ...p,
        notes: p.notes.map((n) => (n.id in updatedNotes ? { ...n, z: updatedNotes[n.id] } : n)),
      }));
      for (const [id, z] of Object.entries(updatedNotes)) {
        const n = project.notes.find((x) => x.id === id);
        if (n) db.updateNote(team.id, project.id, { ...n, z });
      }
    }
    if (Object.keys(updatedDecors).length) {
      onPatchProject((p) => ({
        ...p,
        decorations: p.decorations.map((d) => (d.id in updatedDecors ? { ...d, z: updatedDecors[d.id] } : d)),
      }));
      for (const [id, z] of Object.entries(updatedDecors)) {
        const d = project.decorations.find((x) => x.id === id);
        if (d) db.updateDecoration(team.id, project.id, { ...d, z });
      }
    }
  };
  const bringForwardItem = (id) => applyLayerSwap(bringForward(combinedLayers(), id));
  const sendBackwardItem = (id) => applyLayerSwap(sendBackward(combinedLayers(), id));

  // Save a placed sticker's image to the personal stash (deduped by src).
  const saveToStash = (src) => { if (src && onAddToStash) onAddToStash(src); };

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
              onBringForward={() => bringForwardItem(d.id)}
              onSendBackward={() => sendBackwardItem(d.id)}
              onSaveToStash={() => saveToStash(stickerSrc.get(d.stickerId))}
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
              onBringForward={() => bringForwardItem(note.id)}
              onSendBackward={() => sendBackwardItem(note.id)}
            />
          ))}
        </div>
      </div>

      {completedOpen && (
        <CompletedNotesModal
          boardName={project.name}
          notes={completedNotes}
          members={team.members}
          onClose={() => setCompletedOpen(false)}
        />
      )}

      {stickersOpen && (
        <StickersModal
          stickers={project.stickers}
          stash={stash || []}
          onUpload={uploadSticker}
          onPlace={placeSticker}
          onDelete={removeSticker}
          onPlaceFromStash={placeFromStash}
          onRemoveFromStash={(stashId) => onRemoveFromStash?.(stashId)}
          onClose={() => setStickersOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------------------------- decorations ------------------------------- */
// A decoration is one placement of a sticker: draggable anywhere, resized and
// rotated from corner handles, and reorderable in the shared note/decoration
// z-stack. `src` is resolved by the caller from the sticker library (decor
// itself just carries a stickerId).
function Decoration({ decor, src, onChange, onDelete, onBringForward, onSendBackward, onSaveToStash }) {
  const [live, setLive] = useState(null);
  const [liveRot, setLiveRot] = useState(null);

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
    if (e.target.closest("button,.decor-resize,.decor-rotate")) return;
    track(e, (dx, dy) => ({ x: Math.max(0, decor.x + dx), y: Math.max(0, decor.y + dy), w: decor.w }));
  };
  // Resize by width only — the image keeps its aspect ratio (height is auto),
  // so we never distort it. Project the pointer delta onto the image's own
  // x-axis so the handle tracks correctly even while rotated.
  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = decor.w || 180;
    const rad = -(decor.rot || 0) * (Math.PI / 180);
    const cos = Math.cos(rad), sin = Math.sin(rad);
    let latest = startW;
    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      latest = Math.max(48, Math.round(startW + dx * cos - dy * sin));
      setLive((l) => ({ ...(l || decor), w: latest }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLive(null);
      onChange(() => ({ ...decor, w: latest }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // Rotate around the sticker's center, delta-based — same math as notes.
  const startRotate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget.parentElement;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const rot0 = decor.rot || 0;
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
      onChange(() => ({ ...decor, rot: latest }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resetRotation = () => onChange(() => ({ ...decor, rot: 0 }));

  if (!src) return null; // its sticker was just removed from the library

  const pos = live || decor;
  const rot = liveRot ?? decor.rot ?? 0;
  const transforming = live || liveRot != null;
  return (
    <div
      className={"decoration" + (transforming ? " transforming" : "")}
      style={{ left: pos.x, top: pos.y, width: pos.w, transform: `rotate(${rot}deg)`, zIndex: transforming ? 30 : decor.z ?? 0 }}
      onPointerDown={startDrag}
    >
      <img src={src} alt="" draggable={false} />
      <button className="icon-btn decor-delete" title="Remove this placement" onClick={onDelete}>
        <X size={13} />
      </button>
      <div className="decor-resize" title="Drag to resize" onPointerDown={startResize} />
      <div className="decor-rotate" title="Drag to rotate" onPointerDown={startRotate} />
      {Math.round(rot) !== 0 && (
        <button className="icon-btn decor-straighten" title="Straighten" onClick={resetRotation}>
          <RotateCcw size={13} />
        </button>
      )}
      {/* Layer + save-to-stash controls, stacked on the right edge. */}
      <div className="decor-side">
        <button className="icon-btn decor-layer" title="Bring forward" onClick={onBringForward}>
          <ChevronUp size={14} />
        </button>
        <button className="icon-btn decor-layer" title="Send backward" onClick={onSendBackward}>
          <ChevronDown size={14} />
        </button>
        <button className="icon-btn decor-save" title="Save to my stash" onClick={onSaveToStash}>
          <BookmarkIcon size={13} />
        </button>
      </div>
    </div>
  );
}
