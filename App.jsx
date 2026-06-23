import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Check, Trash2, Pencil, Circle, Radio, Download, Share2, Lock, User, Undo2, X, ChevronDown, ChevronUp } from "lucide-react";
import { drive } from "./drive";

/* ------------------------------------------------------------------ */
/*  Pin board — to-do notes you can pick up, edit, and arrange.        */
/*  Two boards, both backed by the artifact's persistent storage:      */
/*   • Team board    — drive.storage shared=true  (everyone sees it)  */
/*   • My board      — drive.storage shared=false (private to you)    */
/*  Save a teammate's note to your board, or share yours to the team.  */
/* ------------------------------------------------------------------ */

const SCOPES = {
  public: { key: "pinboard-public-v1", shared: true },
  personal: { key: "pinboard-personal-v1", shared: false },
};
const ME_KEY = "pinboard-me-v1"; // your name, stored privately on this device
const POLL_MS = 2500;
const NOTE_W = 196;
const NOTE_W_OPEN = 320; // unfolded width when a note is expanded

const hasStore =
  typeof window !== "undefined" && drive.storage && drive.storage.get;

const COLORS = [
  { id: "butter", bg: "#F4DE74", edge: "#E7CC55" },
  { id: "coral", bg: "#F4A98E", edge: "#E79179" },
  { id: "sky", bg: "#A4D0E8", edge: "#8BBEDB" },
  { id: "mint", bg: "#AAD9B4", edge: "#92CB9E" },
  { id: "lilac", bg: "#CBB6EB", edge: "#B7A0E1" },
  { id: "card", bg: "#FBF6EA", edge: "#ECE3CF" },
];
const colorOf = (id) => COLORS.find((c) => c.id === id) || COLORS[0];

const HAND =
  "'Marker Felt','Segoe Print','Ink Free','Bradley Hand','Comic Sans MS',cursive";
const UI =
  "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// deterministic small tilt from id so a note looks the same for everyone
const tiltOf = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return ((h % 1000) / 1000) * 8 - 4; // -4..4 deg
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const agoText = (ts) => {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
};

const seed = () => [
  { title: "Draft Q3 roadmap", body: "Pull last quarter's notes first.", color: "card", x: 470, y: 150 },
  { title: "Send May invoices", body: "Acme + Bluefin, due Friday.", color: "butter", x: 250, y: 360 },
  { title: "Book offsite venue", body: "Need room for 14, with AV.", color: "mint", x: 760, y: 250 },
  { title: "Review PR #214", body: "", color: "coral", x: 560, y: 470 },
  { title: "Call the dentist back", body: "", color: "sky", x: 1010, y: 180 },
  { title: "Buy more coffee", body: "Dark roast this time.", color: "lilac", x: 940, y: 470 },
].map((n, i) => ({
  id: uid() + i,
  done: false,
  updatedAt: Date.now(),
  ...n,
}));

function Board({ profile }) {
  const [data, setData] = useState({ public: [], personal: [] });
  const [completed, setCompleted] = useState({ public: [], personal: [] });
  const [view, setView] = useState("public"); // 'public' | 'personal'
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState("");
  const [synced, setSynced] = useState(null);
  const [offline, setOffline] = useState(!hasStore);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });
  const [toast, setToast] = useState(null);
  const [spikeOpen, setSpikeOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [nameOpen, setNameOpen] = useState(false);
  const [bump, setBump] = useState(0); // pulses the spindle when something is spiked
  const [expandedId, setExpandedId] = useState(null); // note showing its checklist
  const [subDraft, setSubDraft] = useState(""); // new micro-task being typed

  const canvasRef = useRef(null);
  const dataRef = useRef({ public: [], personal: [] });
  const completedRef = useRef({ public: [], personal: [] });
  const dragRef = useRef(null);
  const lastSeen = useRef({ public: "", personal: "" });
  const writing = useRef({ public: false, personal: false });
  const toastTimer = useRef(null);
  const pendingComplete = useRef(null); // note awaiting a name before it can be spiked

  const notes = data[view];

  /* ----------------------------- storage --------------------------- */
  const applyLocal = useCallback((scope, next) => {
    dataRef.current = { ...dataRef.current, [scope]: next };
    setData((prev) => ({ ...prev, [scope]: next }));
  }, []);

  const applyLocalCompleted = useCallback((scope, next) => {
    completedRef.current = { ...completedRef.current, [scope]: next };
    setCompleted((prev) => ({ ...prev, [scope]: next }));
  }, []);

  // Serialize a scope's notes + completed archive together in one write.
  const writeScope = useCallback((scope) => {
    const json = JSON.stringify({
      notes: dataRef.current[scope],
      completed: completedRef.current[scope],
      t: Date.now(),
    });
    lastSeen.current[scope] = json;
    if (!hasStore) return;
    writing.current[scope] = true;
    drive.storage
      .set(SCOPES[scope].key, json, SCOPES[scope].shared)
      .then(() => {
        writing.current[scope] = false;
        setSynced(Date.now());
      })
      .catch(() => {
        writing.current[scope] = false;
        setOffline(true);
      });
  }, []);

  const commit = useCallback(
    (scope, next) => {
      applyLocal(scope, next);
      writeScope(scope);
    },
    [applyLocal, writeScope]
  );

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  /* ---- initial load (seed the team board only if it's empty) ---- */
  useEffect(() => {
    let alive = true;
    const loadScope = async (scope, seedIfEmpty) => {
      if (hasStore) {
        try {
          const res = await drive.storage.get(SCOPES[scope].key, SCOPES[scope].shared);
          if (res && res.value) {
            const parsed = JSON.parse(res.value);
            if (alive && parsed.notes) {
              lastSeen.current[scope] = res.value;
              applyLocal(scope, parsed.notes);
              applyLocalCompleted(scope, parsed.completed || []);
              return;
            }
          }
        } catch (e) {
          /* missing key — fall through */
        }
      }
      const init = seedIfEmpty ? seed() : [];
      if (alive) commit(scope, init);
    };
    (async () => {
      try {
        const me = await drive.storage.get(ME_KEY, false);
        const nm = me && me.value ? JSON.parse(me.value).name || "" : "";
        if (alive) setUserName(nm || (profile && profile.name) || "");
      } catch (e) {
        if (alive) setUserName((profile && profile.name) || "");
      }
      await Promise.all([loadScope("public", true), loadScope("personal", false)]);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [applyLocal, applyLocalCompleted, commit]);

  /* ---- poll team board always; my board while it's open ---- */
  useEffect(() => {
    if (!hasStore) return;
    let alive = true;
    const syncScope = async (scope) => {
      if (writing.current[scope]) return;
      try {
        const res = await drive.storage.get(SCOPES[scope].key, SCOPES[scope].shared);
        if (!alive || writing.current[scope] || !res || res.value === lastSeen.current[scope])
          return;
        lastSeen.current[scope] = res.value;
        const parsed = JSON.parse(res.value);
        const remote = parsed.notes || [];
        const activeId = scope === view ? dragRef.current?.id ?? editingId : null;
        if (activeId == null) {
          applyLocal(scope, remote);
        } else {
          const mine = dataRef.current[scope].find((n) => n.id === activeId);
          let merged = remote.map((n) => (n.id === activeId && mine ? mine : n));
          if (mine && !merged.some((n) => n.id === activeId)) merged = [...merged, mine];
          applyLocal(scope, merged);
        }
        applyLocalCompleted(scope, parsed.completed || []);
        setSynced(Date.now());
      } catch (e) {
        /* ignore transient errors */
      }
    };
    const tick = () => {
      syncScope("public");
      if (view === "personal") syncScope("personal");
    };
    tick(); // immediate refresh on mount / board switch
    const iv = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [view, editingId, applyLocal, applyLocalCompleted]);

  /* ---- track board size; keep both boards' notes inside the felt ---- */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setBoardSize({ w: cr.width, h: cr.height });
      const maxX = Math.max(0, cr.width - NOTE_W);
      const maxY = Math.max(0, cr.height - 130);
      ["public", "personal"].forEach((scope) => {
        const cur = dataRef.current[scope];
        let changed = false;
        const next = cur.map((n) => {
          const x = clamp(n.x, 0, maxX);
          const y = clamp(n.y, 0, maxY);
          if (x !== n.x || y !== n.y) {
            changed = true;
            return { ...n, x, y };
          }
          return n;
        });
        if (changed) applyLocal(scope, next);
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyLocal]);

  /* ----------------------------- helpers --------------------------- */
  const placePos = () => {
    const bw = boardSize.w || 900;
    const bh = boardSize.h || 600;
    return {
      x: clamp(bw / 2 - NOTE_W / 2 + (Math.random() * 200 - 100), 16, Math.max(16, bw - NOTE_W - 16)),
      y: clamp(bh / 2 - 80 + (Math.random() * 160 - 80), 16, Math.max(16, bh - 150)),
    };
  };

  const flash = (id, delay = 0) => {
    const run = () => {
      setFocusId(id);
      requestAnimationFrame(() => {
        const el = document.getElementById("note-" + id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      });
      setTimeout(() => setFocusId((f) => (f === id ? null : f)), 1300);
    };
    delay ? setTimeout(run, delay) : run();
  };

  /* ----------------------------- actions --------------------------- */
  const addNote = (title = "", openEditor = true) => {
    const n = {
      id: uid(),
      title,
      body: "",
      color: COLORS[Math.floor(Math.random() * COLORS.length)].id,
      done: false,
      ...placePos(),
      updatedAt: Date.now(),
    };
    commit(view, [...dataRef.current[view], n]);
    flash(n.id);
    if (openEditor) setEditingId(n.id);
    return n.id;
  };

  const patch = (id, fields, persist = true) => {
    const next = dataRef.current[view].map((n) =>
      n.id === id ? { ...n, ...fields, updatedAt: Date.now() } : n
    );
    persist ? commit(view, next) : applyLocal(view, next);
  };

  const remove = (id) => {
    if (editingId === id) setEditingId(null);
    if (expandedId === id) setExpandedId(null);
    commit(view, dataRef.current[view].filter((n) => n.id !== id));
  };

  /* --------------------- micro-tasks (checklist) ------------------- */
  const mutateSubs = (noteId, fn) => {
    const next = dataRef.current[view].map((n) =>
      n.id === noteId ? { ...n, subtasks: fn(n.subtasks || []), updatedAt: Date.now() } : n
    );
    commit(view, next);
  };
  const addSubtask = (noteId, text) => {
    const t = text.trim();
    if (!t) return;
    mutateSubs(noteId, (subs) => [...subs, { id: uid(), text: t, done: false }]);
  };
  const toggleSubtask = (noteId, subId) =>
    mutateSubs(noteId, (subs) => subs.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)));
  const deleteSubtask = (noteId, subId) =>
    mutateSubs(noteId, (subs) => subs.filter((s) => s.id !== subId));

  const toggleExpand = (id) => {
    setSubDraft("");
    const opening = expandedId !== id;
    if (opening) {
      const note = dataRef.current[view].find((n) => n.id === id);
      if (note) {
        const maxX = Math.max(8, (boardSize.w || 900) - NOTE_W_OPEN - 8);
        const maxY = Math.max(8, (boardSize.h || 600) - 360); // room for the checklist
        const nx = Math.min(note.x, maxX);
        const ny = Math.min(note.y, maxY);
        if (nx !== note.x || ny !== note.y) {
          commit(view, dataRef.current[view].map((n) => (n.id === id ? { ...n, x: nx, y: ny } : n)));
        }
      }
    }
    setExpandedId(opening ? id : null);
  };

  // Team note -> save a copy onto my board
  const saveToMine = (note) => {
    const existing = dataRef.current.personal.find((n) => n.sourceId === note.id);
    if (existing) {
      if (view === "personal") flash(existing.id);
      else showToast("Already on your board");
      return;
    }
    const copy = {
      ...note,
      id: uid(),
      sourceId: note.id,
      from: "team",
      done: false,
      subtasks: (note.subtasks || []).map((s) => ({ ...s })),
      ...placePos(),
      updatedAt: Date.now(),
    };
    commit("personal", [...dataRef.current.personal, copy]);
    if (view === "personal") flash(copy.id);
    else showToast("Saved to your board");
  };

  // My note -> share a copy to the team board
  const shareToTeam = (note) => {
    if (note.from === "team" && note.sourceId) {
      const orig = dataRef.current.public.find((n) => n.id === note.sourceId);
      if (orig) {
        if (view === "public") flash(orig.id);
        else showToast("Already on the team board");
        return;
      }
    }
    const already = dataRef.current.public.find((n) => n.sourceId === note.id);
    if (already) {
      if (view === "public") flash(already.id);
      else showToast("Already shared with the team");
      return;
    }
    const copy = {
      ...note,
      id: uid(),
      sourceId: note.id,
      from: "personal",
      subtasks: (note.subtasks || []).map((s) => ({ ...s })),
      ...placePos(),
      updatedAt: Date.now(),
    };
    commit("public", [...dataRef.current.public, copy]);
    if (view === "public") flash(copy.id);
    else showToast("Shared with the team");
  };

  const switchTo = (v) => {
    if (v === view) return;
    setEditingId(null);
    setDragId(null);
    setExpandedId(null);
    dragRef.current = null;
    setFilter("all");
    setView(v);
  };

  /* --------------------- completed spindle (team) ------------------ */
  // Move a team task off the board and skewer it on the completed spindle.
  const completeTask = (note, nameOverride) => {
    const who = (nameOverride ?? userName).trim();
    if (!who) {
      pendingComplete.current = note; // capture a name first, then spike it
      setNameDraft("");
      setNameOpen(true);
      return;
    }
    const item = {
      ...note,
      completedBy: who,
      completedAt: Date.now(),
    };
    if (editingId === note.id) setEditingId(null);
    if (expandedId === note.id) setExpandedId(null);
    applyLocal("public", dataRef.current.public.filter((n) => n.id !== note.id));
    applyLocalCompleted("public", [item, ...completedRef.current.public]);
    writeScope("public");
    setBump((b) => b + 1);
    showToast("Spiked ✓ completed");
  };

  const restoreTask = (item) => {
    applyLocalCompleted(
      "public",
      completedRef.current.public.filter((n) => n.id !== item.id)
    );
    const { completedBy, completedAt, ...rest } = item;
    applyLocal("public", [...dataRef.current.public, { ...rest, done: false, ...placePos(), updatedAt: Date.now() }]);
    writeScope("public");
    showToast("Back on the board");
  };

  const saveName = (name) => {
    const clean = name.trim();
    setUserName(clean);
    if (hasStore) {
      drive.storage.set(ME_KEY, JSON.stringify({ name: clean }), false).catch(() => {});
    }
    setNameOpen(false);
    const pending = pendingComplete.current;
    pendingComplete.current = null;
    if (pending && clean) completeTask(pending, clean); // resume the spike with the new name
  };

  /* ------------------------------- drag ---------------------------- */
  const onNotePointerDown = (e, note) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest("[data-control]")) return;
    if (editingId === note.id) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      id: note.id,
      dx: e.clientX - rect.left - note.x,
      dy: e.clientY - rect.top - note.y,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    };
    setDragId(note.id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onNotePointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const w = e.currentTarget.offsetWidth || NOTE_W;
    const h = e.currentTarget.offsetHeight || 120;
    const x = clamp(e.clientX - rect.left - d.dx, 0, rect.width - w);
    const y = clamp(e.clientY - rect.top - d.dy, 0, rect.height - Math.min(h, rect.height - 8));
    applyLocal(view, dataRef.current[view].map((n) => (n.id === d.id ? { ...n, x, y } : n)));
  };

  const onNotePointerUp = (e) => {
    const d = dragRef.current;
    if (!d) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
    setDragId(null);
    if (d.moved) patch(d.id, {});
    else toggleExpand(d.id); // a click unfolds the note to show its steps
  };

  /* ------------------------------ derived -------------------------- */
  const visible = notes.filter((n) =>
    filter === "active" ? !n.done : filter === "done" ? n.done : true
  );
  const doneCount = notes.filter((n) => n.done).length;
  const isPublic = view === "public";
  const completedList = completed.public;

  /* ------------------------------- view ---------------------------- */
  return (
    <div style={S.app}>
      <style>{CSS}</style>

      {/* top rail */}
      <header style={S.top}>
        <div style={S.brand}>
          <span style={S.brandPin} />
          <span style={S.brandName}>The Board</span>
        </div>

        <div style={S.switcher} role="tablist" aria-label="Choose a board">
          {[
            { id: "public", label: "Team board", count: data.public.length },
            { id: "personal", label: "My board", count: data.personal.length },
          ].map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={view === b.id}
              className="seg"
              onClick={() => switchTo(b.id)}
              style={{ ...S.segBtn, ...(view === b.id ? S.segOn : null) }}
            >
              {b.id === "personal" && <Lock size={12} style={{ marginRight: 5 }} />}
              {b.label}
              <span style={S.segCount}>{b.count}</span>
            </button>
          ))}
        </div>

        <div style={S.topRight}>
          <button
            className="nameBtn"
            style={S.nameBtn}
            onClick={() => {
              setNameDraft(userName);
              setNameOpen(true);
            }}
            title="This name is shown when you complete a team task. Stored privately on your device."
          >
            <User size={13} />
            {userName ? userName : "Add your name"}
          </button>
          <span
            style={{ ...S.live, color: offline ? "#E7CBA0" : isPublic ? "#D7F0DA" : "#E6DCC4" }}
            title={
              offline
                ? "Running locally — changes stay on this device"
                : isPublic
                ? "Live — everyone with this board sees the same notes"
                : "Private — only you can see this board"
            }
          >
            {isPublic ? (
              <Radio size={14} className={offline ? "" : "pulse"} />
            ) : (
              <Lock size={13} />
            )}
            {offline ? "Local only" : isPublic ? (synced ? "Live · synced" : "Live") : "Private"}
          </span>
          <button style={S.newBtn} onClick={() => addNote("")} className="newBtn">
            <Plus size={17} /> New note
          </button>
        </div>
      </header>

      <div style={S.body}>
        {/* sidebar */}
        <aside style={S.side}>
          <div style={S.sideHead}>
            <h2 style={S.sideTitle}>{isPublic ? "Team tasks" : "My tasks"}</h2>
            <span style={S.counter}>
              {isPublic
                ? `${notes.length} open · ${completedList.length} completed`
                : `${notes.length - doneCount} open · ${doneCount} done`}
            </span>
          </div>

          <div style={S.addRow}>
            <input
              style={S.addInput}
              placeholder={isPublic ? "Add a team task…" : "Add to my board…"}
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && adding.trim()) {
                  addNote(adding.trim(), false);
                  setAdding("");
                }
              }}
              aria-label="Add a task"
            />
            <button
              style={S.addBtn}
              className="iconBtn"
              disabled={!adding.trim()}
              onClick={() => {
                if (adding.trim()) {
                  addNote(adding.trim(), false);
                  setAdding("");
                }
              }}
              aria-label="Add task"
            >
              <Plus size={16} />
            </button>
          </div>

          {isPublic ? (
            <button
              className="completedLink"
              style={S.completedLink}
              onClick={() => setSpikeOpen(true)}
            >
              <Check size={13} /> View completed
              <span style={S.completedCount}>{completedList.length}</span>
            </button>
          ) : (
            <div style={S.tabs}>
              {["all", "active", "done"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="tab"
                  style={{ ...S.tab, ...(filter === f ? S.tabOn : null) }}
                >
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          )}

          <div style={S.list}>
            {visible.length === 0 && (
              <p style={S.empty}>
                {filter === "done"
                  ? "Nothing checked off yet."
                  : isPublic
                  ? "No team tasks yet. Add one above."
                  : "Nothing saved yet. Add a task, or pull one from the team board."}
              </p>
            )}
            {visible.map((n) => (
              <div key={n.id} className="taskRow" style={S.taskRow} onClick={() => flash(n.id)}>
                <button
                  data-control
                  className="checkbox"
                  style={{
                    ...S.checkbox,
                    background: n.done ? "#5b8f63" : "transparent",
                    borderColor: n.done ? "#5b8f63" : "#b9ad94",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    isPublic ? completeTask(n) : patch(n.id, { done: !n.done });
                  }}
                  aria-label={isPublic ? "Complete and spike" : n.done ? "Mark not done" : "Mark done"}
                  title={isPublic ? "Complete (move to the spindle)" : "Mark done"}
                >
                  {n.done && <Check size={12} color="#fff" strokeWidth={3} />}
                </button>
                <span
                  style={{
                    ...S.taskText,
                    textDecoration: n.done ? "line-through" : "none",
                    color: n.done ? "#a59a85" : "#46402f",
                  }}
                >
                  {n.title || "Untitled note"}
                </span>
                {n.subtasks && n.subtasks.length > 0 && (
                  <span
                    style={S.rowProg}
                    title={`${n.subtasks.filter((s) => s.done).length} of ${n.subtasks.length} steps done`}
                  >
                    {n.subtasks.filter((s) => s.done).length}/{n.subtasks.length}
                  </span>
                )}
                <button
                  data-control
                  className="rowAct"
                  style={S.rowAct}
                  onClick={(e) => {
                    e.stopPropagation();
                    isPublic ? saveToMine(n) : shareToTeam(n);
                  }}
                  title={isPublic ? "Save to my board" : "Share with the team"}
                  aria-label={isPublic ? "Save to my board" : "Share with the team"}
                >
                  {isPublic ? <Download size={14} /> : <Share2 size={14} />}
                </button>
              </div>
            ))}
          </div>

          <div style={S.sideFoot}>
            {isPublic
              ? "Everyone with this board shares these notes. Tap the arrow on any task to keep a copy on your private board."
              : "This board is private to you. Tap the share icon to push a copy to the team."}
          </div>
        </aside>

        {/* board */}
        <main style={S.boardWrap}>
          <div
            ref={canvasRef}
            style={{ ...S.canvas, backgroundColor: isPublic ? "#33433d" : "#3a4146" }}
            className="canvas"
          >
            {!loading && notes.length === 0 && (
              <div style={S.boardEmpty}>
                {isPublic ? (
                  <>
                    Press <b>New note</b> to pin the first team task.
                  </>
                ) : (
                  <>
                    Your board is empty. On the <b>team board</b>, tap the{" "}
                    <Download size={15} style={{ verticalAlign: "-2px" }} /> on any note to keep a
                    copy here — or press <b>New note</b>.
                  </>
                )}
              </div>
            )}

            {notes.map((n) => {
              const c = colorOf(n.color);
              const dragging = dragId === n.id;
              const editing = editingId === n.id;
              const expanded = expandedId === n.id && !editing;
              const tilt = tiltOf(n.id);
              const subs = n.subtasks || [];
              const subDone = subs.filter((s) => s.done).length;
              const pct = subs.length ? Math.round((subDone / subs.length) * 100) : 0;
              const origin =
                view === "personal" && n.from === "team"
                  ? "from team"
                  : view === "public" && n.from === "personal"
                  ? "shared"
                  : null;
              return (
                <div
                  id={"note-" + n.id}
                  key={n.id}
                  className={`note${dragging ? " dragging" : ""}${focusId === n.id ? " flash" : ""}`}
                  onPointerDown={(e) => onNotePointerDown(e, n)}
                  onPointerMove={onNotePointerMove}
                  onPointerUp={onNotePointerUp}
                  style={{
                    width: expanded ? NOTE_W_OPEN : NOTE_W,
                    perspective: 760,
                    background: c.bg,
                    transform: dragging
                      ? `translate3d(${n.x}px,${n.y}px,0) rotate(0deg) scale(1.045)`
                      : `translate3d(${n.x}px,${n.y}px,0) rotate(${tilt}deg) scale(1)`,
                    zIndex: dragging ? 50 : editing || expanded ? 40 : 1,
                    cursor: editing ? "default" : dragging ? "grabbing" : "grab",
                    boxShadow: dragging
                      ? "0 28px 46px rgba(0,0,0,.42), 0 10px 16px rgba(0,0,0,.30)"
                      : "0 10px 18px rgba(0,0,0,.32), 0 3px 6px rgba(0,0,0,.24)",
                    opacity: n.done && !editing ? 0.8 : 1,
                  }}
                >
                  <span className="pin" aria-hidden />

                  {editing ? (
                    <div data-control style={S.editor}>
                      <input
                        autoFocus
                        style={S.editTitle}
                        value={n.title}
                        placeholder="Title"
                        onChange={(e) => patch(n.id, { title: e.target.value }, false)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                      <textarea
                        style={S.editBody}
                        value={n.body}
                        placeholder="Add details…"
                        onChange={(e) => patch(n.id, { body: e.target.value }, false)}
                      />
                      <div style={S.swatches}>
                        {COLORS.map((col) => (
                          <button
                            key={col.id}
                            aria-label={`Color ${col.id}`}
                            onClick={() => patch(n.id, { color: col.id })}
                            className="dot"
                            style={{
                              ...S.dot,
                              background: col.bg,
                              outline: col.id === n.color ? "2px solid #3a352a" : "none",
                            }}
                          />
                        ))}
                      </div>
                      <div style={S.editBar}>
                        <button className="ghost" style={S.ghostDanger} onClick={() => remove(n.id)}>
                          <Trash2 size={14} /> Delete
                        </button>
                        <button
                          className="ghost"
                          style={S.ghostShare}
                          onClick={() => (isPublic ? saveToMine(n) : shareToTeam(n))}
                        >
                          {isPublic ? <Download size={14} /> : <Share2 size={14} />}
                          {isPublic ? "Mine" : "Team"}
                        </button>
                        <button
                          className="ghost"
                          style={S.ghostDone}
                          onClick={() => {
                            commit(view, dataRef.current[view]);
                            setEditingId(null);
                          }}
                        >
                          <Check size={14} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={S.noteHead}>
                        <span
                          style={{
                            ...S.noteTitle,
                            textDecoration: n.done ? "line-through" : "none",
                          }}
                        >
                          {n.title || "Untitled"}
                        </span>
                        <div style={S.noteActions} data-control>
                          <button
                            className="miniBtn"
                            style={S.miniBtn}
                            onClick={() => toggleExpand(n.id)}
                            aria-label={expanded ? "Hide steps" : "Show steps"}
                            title={expanded ? "Hide steps" : "Steps / checklist"}
                          >
                            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                          <button
                            className="miniBtn accent"
                            style={S.miniBtn}
                            onClick={() => (isPublic ? saveToMine(n) : shareToTeam(n))}
                            aria-label={isPublic ? "Save to my board" : "Share with the team"}
                            title={isPublic ? "Save to my board" : "Share with the team"}
                          >
                            {isPublic ? <Download size={13} /> : <Share2 size={13} />}
                          </button>
                          <button
                            className="miniBtn"
                            style={S.miniBtn}
                            onClick={() =>
                              isPublic ? completeTask(n) : patch(n.id, { done: !n.done })
                            }
                            aria-label={
                              isPublic ? "Complete and spike" : n.done ? "Mark not done" : "Mark done"
                            }
                            title={isPublic ? "Complete (move to the spindle)" : "Mark done"}
                          >
                            {!isPublic && n.done ? <Circle size={13} /> : <Check size={13} />}
                          </button>
                          <button
                            className="miniBtn"
                            style={S.miniBtn}
                            onClick={() => setEditingId(n.id)}
                            aria-label="Edit note"
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      </div>
                      {n.body && <p style={S.noteBody}>{n.body}</p>}

                      {subs.length > 0 && !expanded && (
                        <div style={S.ringWrap} aria-hidden>
                          <svg width="38" height="38" viewBox="0 0 38 38">
                            <circle cx="19" cy="19" r="15" fill="none" stroke="rgba(0,0,0,.13)" strokeWidth="4" />
                            <circle
                              cx="19"
                              cy="19"
                              r="15"
                              fill="none"
                              stroke="#5b8f63"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeDasharray={2 * Math.PI * 15}
                              strokeDashoffset={2 * Math.PI * 15 * (1 - pct / 100)}
                              transform="rotate(-90 19 19)"
                            />
                            <text
                              x="19"
                              y="20"
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{ fontFamily: UI, fontSize: 10, fontWeight: 800, fill: "#3c372a" }}
                            >
                              {pct}%
                            </text>
                          </svg>
                        </div>
                      )}

                      {expanded && (
                        <div data-control style={S.checklist} className="checklist">
                          {subs.length > 0 && (
                            <div style={S.checkProg}>
                              <span style={S.checkPct}>{pct}%</span>
                              <span style={S.progTrack}>
                                <span style={{ ...S.progFill, width: `${pct}%` }} />
                              </span>
                              <span style={S.checkProgLabel}>
                                {subDone}/{subs.length}
                              </span>
                            </div>
                          )}
                          <div style={S.subList}>
                            {subs.map((s) => (
                              <div key={s.id} className="subRow" style={S.subRow}>
                                <button
                                  className="subCheck"
                                  style={{
                                    ...S.subCheck,
                                    background: s.done ? "#5b8f63" : "rgba(255,255,255,.5)",
                                    borderColor: s.done ? "#5b8f63" : "rgba(0,0,0,.3)",
                                  }}
                                  onClick={() => toggleSubtask(n.id, s.id)}
                                  aria-label={s.done ? "Mark step undone" : "Mark step done"}
                                >
                                  {s.done && <Check size={11} color="#fff" strokeWidth={3} />}
                                </button>
                                <span
                                  style={{
                                    ...S.subText,
                                    textDecoration: s.done ? "line-through" : "none",
                                    opacity: s.done ? 0.55 : 1,
                                  }}
                                >
                                  {s.text}
                                </span>
                                <button
                                  className="subDel"
                                  style={S.subDel}
                                  onClick={() => deleteSubtask(n.id, s.id)}
                                  aria-label="Delete step"
                                  title="Delete step"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div style={S.subAddRow}>
                            <input
                              style={S.subInput}
                              value={subDraft}
                              placeholder="Add a step…"
                              onChange={(e) => setSubDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && subDraft.trim()) {
                                  addSubtask(n.id, subDraft);
                                  setSubDraft("");
                                }
                              }}
                              aria-label="Add a step"
                            />
                            <button
                              className="subAddBtn"
                              style={S.subAddBtn}
                              disabled={!subDraft.trim()}
                              onClick={() => {
                                if (subDraft.trim()) {
                                  addSubtask(n.id, subDraft);
                                  setSubDraft("");
                                }
                              }}
                              aria-label="Add step"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      )}

                      {origin && <span style={S.originChip}>{origin}</span>}
                      {n.done && <span style={S.doneStamp}>done</span>}
                    </>
                  )}
                </div>
              );
            })}

            {isPublic && (
              <button
                className="spindle"
                style={S.spindle}
                onClick={() => setSpikeOpen(true)}
                aria-label={`View ${completedList.length} completed tasks`}
                title="Completed tasks — click to view"
              >
                <div className="slips" key={bump} style={S.slips}>
                  {completedList.slice(0, 6).map((it, i) => (
                    <span
                      key={it.id}
                      className="slip"
                      style={{
                        ...S.slip,
                        background: colorOf(it.color).bg,
                        bottom: 16 + i * 6,
                        transform: `translateX(-50%) rotate(${(tiltOf(it.id) || 0) * 0.8}deg)`,
                        zIndex: 10 - i,
                      }}
                    >
                      <span style={S.slipHole} />
                    </span>
                  ))}
                </div>
                <span className="rod" style={S.rod} />
                <span style={S.spikeBase} />
                <span style={S.spikeLabel}>
                  Completed
                  <span style={S.spikeCount}>{completedList.length}</span>
                </span>
              </button>
            )}
          </div>

          {toast && (
            <div style={S.toast} className="toast" role="status">
              {toast}
            </div>
          )}

          {/* completed list */}
          {spikeOpen && (
            <div style={S.overlay} className="overlay" onClick={() => setSpikeOpen(false)}>
              <div style={S.modal} className="modal" onClick={(e) => e.stopPropagation()}>
                <div style={S.modalHead}>
                  <div>
                    <h3 style={S.modalTitle}>Completed tasks</h3>
                    <p style={S.modalSub}>
                      {completedList.length
                        ? "Spiked so nothing slips through the cracks."
                        : "Nothing here yet."}
                    </p>
                  </div>
                  <button
                    style={S.closeBtn}
                    className="iconBtn"
                    onClick={() => setSpikeOpen(false)}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div style={S.modalList}>
                  {completedList.length === 0 && (
                    <p style={S.empty}>
                      Check off a team task to spike it here. You'll see what was done and who
                      finished it.
                    </p>
                  )}
                  {completedList.map((it) => (
                    <div key={it.id} style={S.doneRow}>
                      <span style={{ ...S.doneSwatch, background: colorOf(it.color).bg }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.doneRowTitle}>{it.title || "Untitled note"}</div>
                        <div style={S.doneRowMeta}>
                          <Check size={11} /> {it.completedBy || "someone"} · {agoText(it.completedAt)}
                        </div>
                      </div>
                      <button
                        style={S.restoreBtn}
                        className="iconBtn"
                        onClick={() => restoreTask(it)}
                        title="Put back on the board"
                        aria-label="Put back on the board"
                      >
                        <Undo2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* name capture */}
          {nameOpen && (
            <div style={S.overlay} className="overlay" onClick={() => setNameOpen(false)}>
              <div style={S.nameModal} className="modal" onClick={(e) => e.stopPropagation()}>
                <h3 style={S.modalTitle}>What's your name?</h3>
                <p style={S.modalSub}>
                  Shown next to tasks you complete on the team board. Kept private to this device —
                  not shared anywhere else.
                </p>
                <input
                  autoFocus
                  style={S.nameInput}
                  value={nameDraft}
                  placeholder="e.g. Jordan"
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && nameDraft.trim() && saveName(nameDraft)}
                />
                <div style={S.nameBar}>
                  <button
                    style={S.ghostDanger}
                    className="ghost"
                    onClick={() => {
                      drive.signOut();
                      window.location.reload();
                    }}
                  >
                    Disconnect
                  </button>
                  <button
                    style={S.ghostDanger}
                    className="ghost"
                    onClick={() => {
                      pendingComplete.current = null;
                      setNameOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    style={S.saveNameBtn}
                    className="newBtn"
                    disabled={!nameDraft.trim()}
                    onClick={() => nameDraft.trim() && saveName(nameDraft)}
                  >
                    Save name
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ------------------------------- styles ------------------------------- */
const S = {
  app: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    fontFamily: UI,
    color: "#2b2920",
    background: "#1c2420",
    overflow: "hidden",
  },
  top: {
    flex: "0 0 auto",
    height: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 18px",
    background:
      "linear-gradient(180deg,#6b5238 0%,#5a4630 55%,#4c3a27 100%)",
    borderBottom: "3px solid #3a2c1d",
    boxShadow: "0 4px 10px rgba(0,0,0,.3)",
    zIndex: 5,
  },
  brand: { display: "flex", alignItems: "baseline", gap: 10 },
  brandPin: {
    width: 13,
    height: 13,
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 30%,#f0726a,#b3322b)",
    boxShadow: "0 1px 2px rgba(0,0,0,.4)",
    alignSelf: "center",
  },
  brandName: { fontSize: 21, fontWeight: 700, color: "#fbf3e6", letterSpacing: 0.2 },
  brandSub: { fontSize: 12.5, color: "#e3cda9", opacity: 0.8 },
  switcher: {
    display: "flex",
    gap: 3,
    padding: 3,
    borderRadius: 10,
    background: "rgba(0,0,0,.22)",
    boxShadow: "inset 0 1px 3px rgba(0,0,0,.35)",
  },
  segBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "none",
    background: "transparent",
    color: "#e8d8bd",
    fontSize: 13,
    fontWeight: 600,
    padding: "6px 13px",
    borderRadius: 7,
    cursor: "pointer",
  },
  segOn: {
    background: "#f6e7cf",
    color: "#473420",
    boxShadow: "0 1px 2px rgba(0,0,0,.25)",
  },
  segCount: {
    fontSize: 11,
    fontWeight: 700,
    opacity: 0.6,
    minWidth: 14,
    textAlign: "center",
  },
  topRight: { display: "flex", alignItems: "center", gap: 14 },
  live: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    fontWeight: 600,
  },
  newBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "#f6e7cf",
    color: "#473420",
    fontWeight: 700,
    fontSize: 13.5,
    padding: "8px 14px",
    borderRadius: 8,
    cursor: "pointer",
    boxShadow: "0 2px 0 #c9a878",
  },
  body: { flex: "1 1 auto", display: "flex", minHeight: 0 },

  /* sidebar — ruled notepad */
  side: {
    flex: "0 0 270px",
    display: "flex",
    flexDirection: "column",
    background:
      "linear-gradient(#f5efe2,#f5efe2) padding-box",
    backgroundColor: "#f5efe2",
    borderRight: "1px solid #d8cdb4",
    boxShadow: "inset -6px 0 14px rgba(0,0,0,.04)",
    minHeight: 0,
  },
  sideHead: {
    padding: "16px 18px 8px",
    borderBottom: "1px solid #e4dac3",
  },
  sideTitle: { margin: 0, fontFamily: HAND, fontSize: 26, color: "#3c372a", letterSpacing: 0.3 },
  counter: { fontSize: 11.5, color: "#8c8369", letterSpacing: 0.3 },
  addRow: { display: "flex", gap: 6, padding: "12px 14px 6px" },
  addInput: {
    flex: 1,
    border: "1px solid #d8cdb4",
    background: "#fffdf8",
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 13.5,
    fontFamily: UI,
    color: "#3c372a",
    outline: "none",
  },
  addBtn: {
    border: "1px solid #cdbf9f",
    background: "#ece1c8",
    color: "#5a4a2e",
    borderRadius: 7,
    width: 34,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  tabs: { display: "flex", gap: 4, padding: "4px 14px 8px" },
  tab: {
    flex: 1,
    border: "none",
    background: "transparent",
    color: "#8c8369",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 0",
    borderRadius: 6,
    cursor: "pointer",
  },
  tabOn: { background: "#e7dcc2", color: "#4a4231" },
  list: { flex: 1, overflowY: "auto", padding: "2px 8px 8px" },
  empty: {
    color: "#9b927b",
    fontSize: 13,
    textAlign: "center",
    padding: "26px 16px",
    lineHeight: 1.5,
  },
  taskRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 8,
    cursor: "pointer",
    borderBottom: "1px solid #ece3d0",
  },
  checkbox: {
    flex: "0 0 auto",
    width: 18,
    height: 18,
    borderRadius: 5,
    border: "2px solid #b9ad94",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
  },
  taskText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: HAND,
    lineHeight: 1.25,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  swatch: { flex: "0 0 auto", width: 10, height: 10, borderRadius: "50%", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" },
  rowAct: {
    flex: "0 0 auto",
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "#8a7f64",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    opacity: 0,
    transition: "opacity .12s ease, background .12s ease",
  },
  sideFoot: {
    padding: "12px 16px",
    fontSize: 11,
    lineHeight: 1.5,
    color: "#9a9079",
    borderTop: "1px solid #e4dac3",
  },

  /* board */
  boardWrap: { flex: 1, overflow: "hidden", minWidth: 0, position: "relative" },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "#33433d",
    backgroundImage:
      "repeating-linear-gradient(45deg,rgba(255,255,255,.022) 0 2px,transparent 2px 4px),repeating-linear-gradient(-45deg,rgba(0,0,0,.05) 0 2px,transparent 2px 4px)",
    boxShadow: "inset 0 0 160px rgba(0,0,0,.5)",
  },
  boardEmpty: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#cdd6cf",
    opacity: 0.65,
    fontSize: 16,
  },
  editor: { display: "flex", flexDirection: "column", gap: 7 },
  editTitle: {
    border: "none",
    background: "rgba(255,255,255,.45)",
    borderRadius: 5,
    padding: "5px 7px",
    fontFamily: HAND,
    fontSize: 16,
    fontWeight: 700,
    color: "#33302a",
    outline: "none",
  },
  editBody: {
    border: "none",
    background: "rgba(255,255,255,.4)",
    borderRadius: 5,
    padding: "6px 7px",
    fontFamily: HAND,
    fontSize: 14,
    color: "#33302a",
    minHeight: 66,
    resize: "none",
    outline: "none",
    lineHeight: 1.35,
  },
  swatches: { display: "flex", gap: 5, justifyContent: "space-between" },
  dot: { width: 19, height: 19, borderRadius: "50%", border: "1px solid rgba(0,0,0,.15)", cursor: "pointer", padding: 0 },
  editBar: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 },
  ghostDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "none",
    background: "transparent",
    color: "#9c3a31",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    padding: "3px 4px",
  },
  ghostDone: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "none",
    background: "rgba(0,0,0,.08)",
    color: "#2f3a2c",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    padding: "4px 9px",
    borderRadius: 6,
  },
  ghostShare: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "none",
    background: "rgba(0,0,0,.06)",
    color: "#3a4a36",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 6,
  },
  noteHead: { display: "flex", alignItems: "flex-start", gap: 6, justifyContent: "space-between" },
  noteTitle: {
    fontFamily: HAND,
    fontSize: 16.5,
    fontWeight: 700,
    color: "#33302a",
    lineHeight: 1.2,
    wordBreak: "break-word",
    flex: 1,
  },
  noteActions: { display: "flex", gap: 3, flex: "0 0 auto" },
  miniBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    border: "none",
    background: "rgba(0,0,0,.07)",
    color: "#3a352a",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
  },
  noteBody: {
    margin: "7px 0 0",
    fontFamily: HAND,
    fontSize: 14,
    color: "#4a4639",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },

  /* micro-task checklist */
  progTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    background: "rgba(0,0,0,.14)",
    overflow: "hidden",
    display: "inline-block",
  },
  progFill: {
    display: "block",
    height: "100%",
    borderRadius: 3,
    background: "#5b8f63",
    transition: "width .2s ease",
  },
  progChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    marginTop: 9,
    border: "none",
    background: "rgba(0,0,0,.06)",
    color: "#46402f",
    fontFamily: UI,
    fontSize: 11.5,
    fontWeight: 700,
    padding: "5px 8px",
    borderRadius: 6,
    cursor: "pointer",
  },
  checklist: {
    marginTop: 9,
    paddingTop: 9,
    borderTop: "1px dashed rgba(0,0,0,.18)",
  },
  checkProg: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  checkPct: { fontSize: 13, fontWeight: 800, color: "#3c4a37", minWidth: 34 },
  checkProgLabel: { fontSize: 11, fontWeight: 700, color: "#46402f" },
  ringWrap: {
    position: "absolute",
    right: 9,
    bottom: 9,
    width: 38,
    height: 38,
    pointerEvents: "none",
    filter: "drop-shadow(0 1px 1px rgba(0,0,0,.15))",
  },
  subList: { display: "flex", flexDirection: "column", maxHeight: 200, overflowY: "auto" },
  subRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", minWidth: 0 },
  subCheck: {
    flex: "0 0 auto",
    width: 17,
    height: 17,
    borderRadius: 4,
    border: "1.5px solid rgba(0,0,0,.3)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
  },
  subText: {
    flex: 1,
    minWidth: 0,
    fontFamily: HAND,
    fontSize: 14.5,
    lineHeight: 1.3,
    color: "#33302a",
    wordBreak: "break-word",
  },
  subDel: {
    flex: "0 0 auto",
    width: 18,
    height: 18,
    border: "none",
    background: "transparent",
    color: "rgba(60,55,40,.45)",
    borderRadius: 4,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    opacity: 0,
    padding: 0,
  },
  subAddRow: { display: "flex", gap: 6, marginTop: 8, minWidth: 0 },
  subInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    background: "rgba(255,255,255,.55)",
    borderRadius: 6,
    padding: "7px 9px",
    fontFamily: HAND,
    fontSize: 14.5,
    color: "#33302a",
    outline: "none",
  },
  subAddBtn: {
    flex: "0 0 auto",
    width: 30,
    border: "none",
    background: "rgba(0,0,0,.1)",
    color: "#3a352a",
    borderRadius: 6,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  rowProg: {
    flex: "0 0 auto",
    fontSize: 10.5,
    fontWeight: 700,
    color: "#8a7f64",
    background: "#ece2cc",
    borderRadius: 10,
    padding: "1px 7px",
  },
  doneStamp: {
    position: "absolute",
    right: 10,
    bottom: 8,
    fontFamily: HAND,
    fontSize: 15,
    fontWeight: 700,
    color: "rgba(150,40,30,.55)",
    border: "2px solid rgba(150,40,30,.45)",
    borderRadius: 5,
    padding: "0 6px",
    transform: "rotate(-8deg)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  originChip: {
    display: "inline-block",
    marginTop: 8,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(40,40,30,.5)",
    background: "rgba(0,0,0,.08)",
    borderRadius: 4,
    padding: "2px 6px",
  },
  toast: {
    position: "absolute",
    bottom: 22,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(28,34,30,.94)",
    color: "#f3ead8",
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 16px",
    borderRadius: 9,
    boxShadow: "0 8px 22px rgba(0,0,0,.4)",
    zIndex: 60,
    pointerEvents: "none",
  },

  /* identity */
  nameBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.18)",
    color: "#f0e2c9",
    fontSize: 12.5,
    fontWeight: 600,
    padding: "6px 11px",
    borderRadius: 8,
    cursor: "pointer",
    maxWidth: 160,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },

  /* sidebar: view completed */
  completedLink: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: "4px 14px 8px",
    border: "1px solid #ddd0b4",
    background: "#efe6d2",
    color: "#5b5038",
    fontSize: 12.5,
    fontWeight: 600,
    padding: "8px 11px",
    borderRadius: 8,
    cursor: "pointer",
  },
  completedCount: {
    marginLeft: "auto",
    background: "#5b8f63",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 20,
    minWidth: 20,
    padding: "1px 6px",
    textAlign: "center",
  },

  /* the spindle */
  spindle: {
    position: "absolute",
    right: 26,
    bottom: 22,
    width: 132,
    height: 150,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    zIndex: 30,
    padding: 0,
  },
  slips: { position: "absolute", left: "50%", bottom: 0, width: 0, height: 0 },
  slip: {
    position: "absolute",
    left: "50%",
    width: 96,
    height: 30,
    marginLeft: -48,
    borderRadius: 3,
    boxShadow: "0 3px 6px rgba(0,0,0,.32)",
    transformOrigin: "50% 100%",
  },
  slipHole: {
    position: "absolute",
    top: 5,
    left: "50%",
    width: 7,
    height: 7,
    marginLeft: -3.5,
    borderRadius: "50%",
    background: "rgba(0,0,0,.32)",
    boxShadow: "inset 0 1px 1px rgba(0,0,0,.5)",
  },
  rod: {
    position: "absolute",
    left: "50%",
    bottom: 8,
    marginLeft: -2,
    width: 4,
    height: 138,
    borderRadius: 2,
    background: "linear-gradient(90deg,#7d8893,#cfd6dc 45%,#aab2bb 60%,#6c757f)",
    boxShadow: "0 2px 4px rgba(0,0,0,.3)",
    zIndex: 20,
  },
  spikeBase: {
    position: "absolute",
    left: "50%",
    bottom: 0,
    marginLeft: -28,
    width: 56,
    height: 16,
    borderRadius: "50%",
    background: "radial-gradient(ellipse at 50% 30%,#c2cad1,#828c95 70%,#5d666e)",
    boxShadow: "0 5px 10px rgba(0,0,0,.4)",
    zIndex: 19,
  },
  spikeLabel: {
    position: "absolute",
    bottom: -2,
    left: "50%",
    transform: "translateX(-50%)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: UI,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#dfe6df",
    textShadow: "0 1px 2px rgba(0,0,0,.5)",
    whiteSpace: "nowrap",
  },
  spikeCount: {
    background: "#5b8f63",
    color: "#fff",
    borderRadius: 20,
    minWidth: 18,
    padding: "1px 6px",
    textAlign: "center",
  },

  /* modals */
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(15,20,17,.5)",
    backdropFilter: "blur(2px)",
    display: "grid",
    placeItems: "center",
    zIndex: 80,
    padding: 20,
  },
  modal: {
    width: "min(440px,100%)",
    maxHeight: "82%",
    display: "flex",
    flexDirection: "column",
    background: "#f5efe2",
    borderRadius: 14,
    boxShadow: "0 24px 60px rgba(0,0,0,.45)",
    overflow: "hidden",
  },
  modalHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    padding: "16px 16px 12px",
    borderBottom: "1px solid #e4dac3",
  },
  modalTitle: { margin: 0, fontFamily: HAND, fontSize: 23, color: "#3c372a" },
  modalSub: { margin: "3px 0 0", fontSize: 12.5, color: "#8c8369" },
  closeBtn: {
    flex: "0 0 auto",
    width: 32,
    height: 32,
    border: "none",
    background: "#e7dcc2",
    color: "#5a4f37",
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  modalList: { overflowY: "auto", padding: "8px 10px 14px" },
  doneRow: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 10px",
    borderRadius: 9,
    borderBottom: "1px solid #ece3d0",
  },
  doneSwatch: {
    flex: "0 0 auto",
    width: 12,
    height: 12,
    borderRadius: 3,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)",
  },
  doneRowTitle: {
    fontFamily: HAND,
    fontSize: 15.5,
    color: "#3c372a",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  doneRowMeta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11.5,
    color: "#8c8369",
    marginTop: 2,
  },
  restoreBtn: {
    flex: "0 0 auto",
    width: 32,
    height: 32,
    border: "1px solid #d8cdb4",
    background: "#fffdf8",
    color: "#6b5f44",
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  nameModal: {
    width: "min(380px,100%)",
    background: "#f5efe2",
    borderRadius: 14,
    boxShadow: "0 24px 60px rgba(0,0,0,.45)",
    padding: "18px 18px 16px",
  },
  nameInput: {
    width: "100%",
    marginTop: 12,
    border: "1px solid #d8cdb4",
    background: "#fffdf8",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 15,
    fontFamily: UI,
    color: "#3c372a",
    outline: "none",
  },
  nameBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  saveNameBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "#f6e7cf",
    color: "#473420",
    fontWeight: 700,
    fontSize: 13.5,
    padding: "9px 16px",
    borderRadius: 8,
    cursor: "pointer",
    boxShadow: "0 2px 0 #c9a878",
  },
};

const CSS = `
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 11px; height: 11px; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,.28); border-radius: 6px; border: 3px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-track { background: transparent; }

.note {
  position: absolute;
  top: 0; left: 0;
  padding: 12px 13px 14px;
  border-radius: 3px;
  transform-origin: 50% 9px;            /* pivot at the pin */
  transition: transform .2s cubic-bezier(.22,.68,.32,1), box-shadow .18s ease, width .26s cubic-bezier(.22,.68,.32,1);
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.note.dragging {
  transition: box-shadow .12s ease;     /* position tracks the cursor 1:1, no easing */
  will-change: transform;
}
.note .pin {
  position: absolute;
  top: -7px; left: 50%; transform: translateX(-50%);
  width: 15px; height: 15px; border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #f0726a 0%, #cf463d 55%, #9c2f28 100%);
  box-shadow: 0 3px 5px rgba(0,0,0,.4), inset 0 1px 1px rgba(255,255,255,.5);
}
.note.flash { animation: flash 1.3s ease; }
@keyframes flash {
  0%,100% { outline: 0 solid rgba(246,223,116,0); outline-offset: 2px; }
  30%,55% { outline: 4px solid rgba(246,223,116,.95); outline-offset: 3px; }
}
.note input::placeholder, .note textarea::placeholder { color: rgba(60,55,40,.5); }

.miniBtn, .dot, .checkbox, .iconBtn { transition: filter .12s ease, transform .12s ease; }
.miniBtn:hover, .iconBtn:hover { filter: brightness(.92); }
.miniBtn.accent { background: rgba(70,110,75,.18); color: #2f4a31; }
.miniBtn.accent:hover { background: rgba(70,110,75,.30); filter: none; }
.dot:hover { transform: scale(1.12); }
.newBtn:hover { filter: brightness(.97); }
.newBtn:active { transform: translateY(1px); box-shadow: 0 1px 0 #c9a878; }
.seg:hover { filter: brightness(.97); }
.tab:hover { background: rgba(0,0,0,.05); }
.taskRow:hover { background: #efe6d2; }
.taskRow:hover .rowAct { opacity: 1; }
.rowAct:hover { background: rgba(0,0,0,.08); color: #4a4231; }
.taskRow:last-child { border-bottom: none; }
.ghost:hover { filter: brightness(.95); }
.pulse { animation: pulse 1.8s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
.toast { animation: toastIn .22s ease; }
@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

.spindle { transition: transform .15s ease, filter .15s ease; }
.spindle:hover { transform: translateY(-3px); filter: brightness(1.04); }
.spindle:active { transform: translateY(-1px); }
.spindle .slips { animation: spikeBump .42s cubic-bezier(.3,1.5,.5,1); }
@keyframes spikeBump {
  0% { transform: translateY(-10px) scale(1.04); }
  60% { transform: translateY(2px); }
  100% { transform: translateY(0) scale(1); }
}
.completedLink:hover { filter: brightness(.98); }
.progChip:hover { background: rgba(0,0,0,.10); }
.checklist { transform-origin: top center; animation: unfold .34s cubic-bezier(.22,.72,.3,1); }
@keyframes unfold {
  from { opacity: 0; transform: perspective(720px) rotateX(-80deg); }
  55%  { opacity: 1; }
  to   { opacity: 1; transform: perspective(720px) rotateX(0deg); }
}
.subRow:hover .subDel { opacity: 1; }
.subDel:hover { color: #9c3a31; background: rgba(0,0,0,.07); }
.subCheck:hover { filter: brightness(.96); }
.subAddBtn:hover { background: rgba(0,0,0,.16); }
.subAddBtn:disabled { opacity: .4; cursor: default; }
.subInput::placeholder { color: rgba(60,55,40,.5); }
.nameBtn:hover { background: rgba(0,0,0,.28); }
.overlay { animation: fadeIn .16s ease; }
.modal { animation: popIn .2s cubic-bezier(.3,1.2,.5,1); }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes popIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
.doneRow:last-child { border-bottom: none; }
.doneRow:hover { background: #efe6d2; }

button:focus-visible, input:focus-visible, textarea:focus-visible, .taskRow:focus-visible {
  outline: 2px solid #6fae77; outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .note { transition: box-shadow .15s ease; }
  .note.dragging { transition: none; }
  .note.flash, .pulse, .toast, .spindle .slips, .overlay, .modal, .checklist { animation: none; }
}
`;

/* ===================================================================== */
/*  Root: Google sign-in + team-board setup, then renders the Board.     */
/* ===================================================================== */
export default function App() {
  const [step, setStep] = useState("loading"); // loading|signin|setup|ready|error
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [join, setJoin] = useState("");

  useEffect(() => {
    if (!drive.isConfigured()) {
      setErr("Missing VITE_GOOGLE_CLIENT_ID. Add it to your .env (see README).");
      setStep("error");
      return;
    }
    drive
      .init()
      .then(() => setStep("signin"))
      .catch((e) => {
        setErr(String(e.message || e));
        setStep("error");
      });
  }, []);

  const afterAuth = async () => {
    await drive.ensureFiles();
    setStep(drive.hasTeamFile() ? "ready" : "setup");
  };

  const signIn = async () => {
    setBusy(true);
    setErr("");
    try {
      await drive.signIn();
      await afterAuth();
    } catch (e) {
      // a configured-but-inaccessible team file lands here -> let them re-pick
      setErr(String(e.message || e));
      setStep(drive.profile ? "setup" : "signin");
    } finally {
      setBusy(false);
    }
  };

  const createTeam = async () => {
    setBusy(true);
    setErr("");
    try {
      await drive.createTeamFile();
      await drive.ensureFiles();
      setStep("ready");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const joinTeam = async () => {
    if (!join.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await drive.useTeamFile(join.trim());
      await drive.ensureFiles();
      setStep("ready");
    } catch (e) {
      setErr("Couldn't open that file. Make sure it's shared with you. (" + (e.message || e) + ")");
    } finally {
      setBusy(false);
    }
  };

  if (step === "ready") return <Board profile={drive.profile} />;

  return (
    <div style={G.wrap}>
      <div style={G.card}>
        <div style={G.logoRow}>
          <span style={G.pin} />
          <span style={G.logo}>The Board</span>
        </div>

        {step === "loading" && <p style={G.sub}>Starting…</p>}

        {step === "error" && (
          <>
            <p style={G.sub}>Setup needed</p>
            <p style={G.errBox}>{err}</p>
          </>
        )}

        {step === "signin" && (
          <>
            <p style={G.sub}>
              Sign in with Google to load your private board and the shared team board
              from Google Drive.
            </p>
            <button style={G.primary} onClick={signIn} disabled={busy}>
              {busy ? "Connecting…" : "Connect Google Drive"}
            </button>
            {err && <p style={G.errBox}>{err}</p>}
          </>
        )}

        {step === "setup" && (
          <>
            <p style={G.sub}>
              Set up the shared team board. Create a new one, or join an existing
              board by pasting its Drive share link.
            </p>
            <button style={G.primary} onClick={createTeam} disabled={busy}>
              {busy ? "Working…" : "Create a new team board"}
            </button>
            <div style={G.or}>or join an existing one</div>
            <input
              style={G.input}
              value={join}
              placeholder="Paste a Drive share link or file ID"
              onChange={(e) => setJoin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinTeam()}
            />
            <button style={G.secondary} onClick={joinTeam} disabled={busy || !join.trim()}>
              Join team board
            </button>
            <p style={G.hint}>
              After creating, open the file in Google Drive and share it with your
              teammates (or set link-sharing to “anyone with the link can edit”) so
              they can join.
            </p>
            {err && <p style={G.errBox}>{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

const G = {
  wrap: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background:
      "radial-gradient(1200px 600px at 50% -10%, #3a4a44, #232c28 60%, #1c2420)",
    fontFamily:
      "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  },
  card: {
    width: "min(420px,100%)",
    background: "#f5efe2",
    borderRadius: 16,
    padding: "26px 24px",
    boxShadow: "0 24px 60px rgba(0,0,0,.45)",
  },
  logoRow: { display: "flex", alignItems: "center", gap: 9, marginBottom: 10 },
  pin: {
    width: 13,
    height: 13,
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 30%,#f0726a,#b3322b)",
    boxShadow: "0 1px 2px rgba(0,0,0,.4)",
  },
  logo: { fontSize: 22, fontWeight: 800, color: "#3c372a" },
  sub: { fontSize: 14, lineHeight: 1.5, color: "#6b6149", margin: "2px 0 16px" },
  primary: {
    width: "100%",
    border: "none",
    background: "#f6e7cf",
    color: "#473420",
    fontWeight: 700,
    fontSize: 15,
    padding: "12px 16px",
    borderRadius: 10,
    cursor: "pointer",
    boxShadow: "0 2px 0 #c9a878",
  },
  secondary: {
    width: "100%",
    marginTop: 8,
    border: "1px solid #cdbf9f",
    background: "#ece1c8",
    color: "#5a4a2e",
    fontWeight: 700,
    fontSize: 14,
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
  },
  or: { textAlign: "center", fontSize: 12, color: "#9a9079", margin: "14px 0 10px" },
  input: {
    width: "100%",
    border: "1px solid #d8cdb4",
    background: "#fffdf8",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 14,
    color: "#3c372a",
    outline: "none",
    boxSizing: "border-box",
  },
  hint: { fontSize: 12, lineHeight: 1.5, color: "#9a9079", marginTop: 14 },
  errBox: {
    marginTop: 14,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "#8a3a31",
    background: "#f3e0db",
    border: "1px solid #e2c4bd",
    borderRadius: 8,
    padding: "8px 10px",
    wordBreak: "break-word",
  },
};
