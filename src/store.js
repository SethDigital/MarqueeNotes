// store.js — all persistence lives here so the localStorage demo backend can
// later be swapped for a real API without touching the UI.
//
// Data shape:
// {
//   teams: [{
//     id, name, members: [string],
//     projects: [{
//       id, name,
//       notes: [{
//         id, title, color, rot, x, y,          // x/y drive free-drag positioning
//         w, h,                                  // px size; h null = auto-height (grows with content)
//         z,                                     // stacking order — notes + decorations share one z stack
//         createdAt, deadlineAt,                 // ISO strings; deadlineAt may be null
//         items: [{ id, text, done, assignee, assignedBy, doneBy }],
//         pin: null | { to: "team" } | { to: "member", member },
//         tunnels: [string],                     // names who pinned this to their dashboard
//         textColor: string | null,              // optional per-note text color (null = smart default)
//         gradient: null | { stops: [hex,hex,hex], angle: 0-360 } // 3-stop fill override
//       }],
//       stickers: [{ id, src }],            // reusable image library for the board
//       decorations: [{ id, stickerId, x, y, w, rot, z }]  // placed instances of a sticker
//     }]
//   }]
// }
//
// The personal sticker stash lives OUTSIDE the team tree (it's per-account,
// cross-board). In the demo it's held in its own localStorage key; under the
// backend it's the user_stickers table scoped by auth.uid(). Either way it's
// attached to the loaded workspace as `data.stash: [{ id, src }]`.
//
// NOTE ON IDENTITY: assignee / assignedBy / doneBy / tunnels are name strings
// here because the demo has no real accounts. Under the backend phase they
// become user IDs and the shape is otherwise unchanged.

const KEY = "marquee-notes-v1";

// UUIDs so client-generated ids are valid Postgres uuid primary keys — the
// same id works in localStorage today and in Supabase after the swap.
export const uid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

// Bring any note up to the current shape. Runs on load so saves from earlier
// versions (no x/y, no deadlines, no yoinks/tunnels, no completion) keep working
// instead of breaking.
function migrateNote(n, i) {
  return {
    rot: 0,
    pin: null,
    completedAt: null,
    deletedAt: null,
    ...n,
    // Sanitize the fill color on load: older or corrupted saves may carry a
    // non-string color (object/array/number) that would throw in the render
    // path. Fall back to a default note color instead of preserving it.
    color: normalizeHexColor(n.color) || NOTE_COLORS[i % NOTE_COLORS.length],
    x: typeof n.x === "number" ? n.x : 28 + (i % 4) * 260,
    y: typeof n.y === "number" ? n.y : 28 + Math.floor(i / 4) * 250,
    w: typeof n.w === "number" ? n.w : 240,
    h: typeof n.h === "number" ? n.h : null, // null = auto height until resized
    z: typeof n.z === "number" ? n.z : 0,    // stacking order (backfilled per-board)
    createdAt: n.createdAt || new Date().toISOString(),
    deadlineAt: n.deadlineAt || null,
    completedAt: n.completedAt || null,
    deletedAt: n.deletedAt || null,
    // `tunnels` is the underlying field for the Yoink feature — names who
    // yoinked this note onto their personal board.
    tunnels: Array.isArray(n.tunnels) ? n.tunnels : [],
    // Per-note text color and an optional 3-stop gradient fill. Both are null
    // for older notes; null textColor falls back to a contrast-aware default.
    textColor: typeof n.textColor === "string" ? n.textColor : null,
    gradient: normalizeGradient(n.gradient),
    items: (n.items || []).map((it) => ({
      assignee: null, assignedBy: null, doneBy: null, doneAt: null, ...it,
    })),
  };
}

// Bring a project's images up to the sticker-library shape. Runs on load so
// boards saved before stickers existed (decorations carrying their own inline
// `src`) keep working: each unique image becomes a library entry, and the
// decoration that placed it is rewritten to just reference it.
export function migrateProjectAssets(p) {
  const stickers = Array.isArray(p.stickers) ? p.stickers : [];
  const bySrc = new Map(stickers.map((s) => [s.src, s.id]));
  p.decorations = (p.decorations || []).map((d) => {
    if (d.stickerId) return d; // already in the current shape
    let stickerId = bySrc.get(d.src);
    if (!stickerId) {
      stickerId = uid();
      stickers.push({ id: stickerId, src: d.src });
      bySrc.set(d.src, stickerId);
    }
    return { id: d.id, stickerId, x: d.x, y: d.y, w: d.w };
  });
  p.stickers = stickers;
}

// Backfill stacking order for boards saved before layering existed. Notes and
// decorations share ONE z stack, so we assign z across both: decorations first
// (they used to sit beneath notes via CSS), then notes — reproducing the exact
// pre-layering look. Anything that already has a numeric z keeps it.
export function migrateProjectZ(p) {
  const decs = p.decorations || [];
  const notes = (p.notes || []).filter((n) => n && !n.deletedAt);
  let z = 0;
  for (const d of decs) if (typeof d.z !== "number") d.z = z++;
  for (const n of notes) if (typeof n.z !== "number") n.z = z++;
  // Archived notes still need a valid z so a restore-to-board can't collide.
  for (const n of (p.notes || [])) if (n && n.deletedAt && typeof n.z !== "number") n.z = z++;
}

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.teams)) {
      for (const t of data.teams)
        for (const p of t.projects) {
          migrateProjectAssets(p);
          p.notes = (p.notes || []).map(migrateNote);
          migrateProjectZ(p);
        }
      return data;
    }
  } catch {}
  return { teams: [] };
}

export function save(data) {
  // The stash is stored in its own key; never let it sneak into the team tree.
  const { stash, ...rest } = data || {};
  localStorage.setItem(KEY, JSON.stringify(rest));
}

/* ------------------------- personal sticker stash ----------------------- */
// Per-account, cross-board saved stickers. Kept separate from the team tree
// (like UI overrides) so a sticker you saved from one board is yours on every
// board. The backend equivalent is the user_stickers table; see db/supabase.js.
const STASH_KEY = "marquee-notes-sticker-stash";

// Dedupe by src — saving the same image twice just keeps the first entry.
export function normalizeStash(list) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || typeof s.src !== "string" || seen.has(s.src)) continue;
    seen.add(s.src);
    out.push({ id: typeof s.id === "string" ? s.id : uid(), src: s.src });
  }
  return out;
}

export function getStash() {
  try { return normalizeStash(JSON.parse(localStorage.getItem(STASH_KEY))); }
  catch { return []; }
}

export function saveStash(stash) {
  const clean = normalizeStash(stash);
  localStorage.setItem(STASH_KEY, JSON.stringify(clean));
  return clean;
}

// Returns the (possibly already-saved) stash entry for `src`. Idempotent.
export function addToStash(src) {
  const stash = getStash();
  if (stash.some((s) => s.src === src)) return stash;
  const next = [...stash, { id: uid(), src }];
  return saveStash(next);
}

export function removeFromStash(stashId) {
  return saveStash(getStash().filter((s) => s.id !== stashId));
}

// Board theme — a per-browser preference, like picking where the real board
// hangs. "cork" is the classic default.
export const THEMES = { cork: "Corkboard", white: "Whiteboard", neon: "Neon" };

export function getTheme() {
  const t = localStorage.getItem("marquee-notes-theme");
  return THEMES[t] ? t : "cork";
}

export function setTheme(t) {
  localStorage.setItem("marquee-notes-theme", t);
  document.documentElement.dataset.theme = t;
  // Re-apply UI overrides so they still compose on top of the newly chosen theme.
  applyUiOverrides(getUiOverrides());
}

/* -------------------------- interface colors ---------------------------- */
// Per-browser overrides for the curated set of interface tokens (accent,
// controls, text, background, panel). Each override is either null (use the
// theme token), { color: hex } for a solid, or { gradient: {stops, angle} }
// for a 3-stop fill (background/panel only). Overrides compose on top of
// whichever board theme is active; clearing one returns it to the theme value.
const UI_KEY = "marquee-notes-ui-overrides";
const UI_PRESET_KEY = "marquee-notes-ui-presets";

// The curated override keys and the CSS custom property each one drives. Kept
// short on purpose — a handful of meaningful knobs rather than every token.
export const UI_OVERRIDE_KEYS = {
  accent: "--accent",
  controls: "--control",
  text: "--text",
  background: "--bg",
  panel: "--panel",
};
// Which overrides may be a gradient instead of a solid.
export const UI_GRADIENT_KEYS = ["background", "panel"];

function sanitizeOverride(value, allowGradient) {
  if (value == null) return null;
  if (typeof value === "string") {
    const c = normalizeHexColor(value);
    return c ? { color: c } : null;
  }
  if (allowGradient && value.gradient) {
    const g = normalizeGradient(value.gradient);
    return g ? { gradient: g } : null;
  }
  if (value.color) {
    const c = normalizeHexColor(value.color);
    return c ? { color: c } : null;
  }
  return null;
}

// Coerce a raw object into a clean overrides map (only known keys, validated).
export function normalizeUiOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(UI_OVERRIDE_KEYS)) {
    const v = sanitizeOverride(raw[key], UI_GRADIENT_KEYS.includes(key));
    if (v) out[key] = v;
  }
  return out;
}

export function getUiOverrides() {
  try {
    return normalizeUiOverrides(JSON.parse(localStorage.getItem(UI_KEY)));
  } catch {
    return {};
  }
}

export function saveUiOverrides(overrides) {
  const clean = normalizeUiOverrides(overrides);
  localStorage.setItem(UI_KEY, JSON.stringify(clean));
  applyUiOverrides(clean);
  return clean;
}

// Resolve an override to the actual CSS value string for setProperty.
function overrideCssValue(key, override) {
  if (override.color) return override.color;
  if (override.gradient) return gradientCss(override.gradient);
  return null;
}

// Write the overrides onto :root as inline custom properties. Keys without an
// override are cleared so the theme token shows through again.
export function applyUiOverrides(overrides) {
  const clean = normalizeUiOverrides(overrides);
  const root = document.documentElement;
  for (const [key, token] of Object.entries(UI_OVERRIDE_KEYS)) {
    const v = clean[key] ? overrideCssValue(key, clean[key]) : null;
    if (v) root.style.setProperty(token, v);
    else root.style.removeProperty(token);
  }
}

// Named presets — saved combinations loadable from the customize panel.
export function getUiPresets() {
  try {
    const list = JSON.parse(localStorage.getItem(UI_PRESET_KEY));
    return Array.isArray(list) ? list.filter((p) => p && p.id && p.name) : [];
  } catch {
    return [];
  }
}

export function saveUiPreset(name, overrides) {
  const list = getUiPresets();
  const preset = { id: uid(), name: name.trim() || "Untitled", overrides: normalizeUiOverrides(overrides) };
  list.push(preset);
  localStorage.setItem(UI_PRESET_KEY, JSON.stringify(list));
  return list;
}

export function deleteUiPreset(id) {
  const list = getUiPresets().filter((p) => p.id !== id);
  localStorage.setItem(UI_PRESET_KEY, JSON.stringify(list));
  return list;
}

// "Working as" — a lightweight per-browser name so checked-off steps can say
// who handled them. Deliberately not authentication; it's the demo-phase
// equivalent of initialing your work on a shared whiteboard.
export const getMe = (teamId) => localStorage.getItem("marquee-notes-me-" + teamId) || "";
export const setMe = (teamId, name) => localStorage.setItem("marquee-notes-me-" + teamId, name);

// My Board is cross-team, so in the demo it needs one identity that isn't tied
// to a single team's "working as" name. Under the real backend the signed-in
// user is used instead and this is ignored.
export const getGlobalMe = () => localStorage.getItem("marquee-notes-me-global") || "";
export const setGlobalMe = (name) => localStorage.setItem("marquee-notes-me-global", name);

// Each My Board section (one per team) can wear its own board theme, kept as a
// per-browser preference so your personal organization doesn't touch the team's.
export const getSectionTheme = (teamId) => {
  const t = localStorage.getItem("marquee-myboard-theme-" + teamId);
  return THEMES[t] ? t : "cork";
};
export const setSectionTheme = (teamId, t) =>
  localStorage.setItem("marquee-myboard-theme-" + teamId, t);

// Each My Board section's surface height (px), dragged from its bottom edge and
// remembered per team, same as the section theme.
export const SECTION_MIN_HEIGHT = 220;
export const getSectionHeight = (teamId) => {
  const h = parseInt(localStorage.getItem("marquee-myboard-height-" + teamId), 10);
  return Number.isFinite(h) ? Math.max(SECTION_MIN_HEIGHT, h) : 420;
};
export const setSectionHeight = (teamId, h) =>
  localStorage.setItem("marquee-myboard-height-" + teamId, String(Math.round(h)));

/* ------------------------------- invites -------------------------------- */
// Shareable team codes: one code, many joiners, good until it expires. The real
// ones are minted server-side by gen_invite_code() in migration 0002; this
// mirrors that alphabet so the demo backend produces the same look. Ambiguous
// chars (0/O, 1/I/L) are left out.
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// How long a code stays usable — keep in sync with the interval in
// create_invite() (migration 0002). Used by the demo backend and the countdown.
export const INVITE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export function genInviteCode() {
  let out = "";
  for (let i = 0; i < 8; i++)
    out += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  return out;
}

// Storage keeps the raw 8 chars; humans read it grouped as ABCD-EFGH.
export const formatInviteCode = (code) =>
  (code || "").replace(/[^A-Za-z0-9]/g, "").replace(/(.{4})(.{1,4})/, "$1-$2");

// Normalize whatever someone typed/pasted back to the stored form.
export const normalizeInviteCode = (code) =>
  (code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

// Human countdown to an expiry timestamp: "2h 45m", "12m", "<1m", or "" if past.
export function formatTimeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const NOTE_COLORS = ["#fef08a", "#fbcfe8", "#bae6fd", "#bbf7d0", "#fed7aa", "#ddd6fe"];

// Validate/normalize a typed-or-pasted hex color to a full 6-digit form (adds
// the leading #, expands 3-digit shorthand). Returns null if it's not a valid
// hex color, so callers can leave a draft in progress instead of clobbering it.
// Never throws — non-string input (object/array/number from corrupted saves)
// coerces to a string and is rejected as null rather than throwing on .trim().
export function normalizeHexColor(raw) {
  if (typeof raw !== "string") return null;
  let v = raw.trim();
  if (!v) return null;
  if (v[0] !== "#") v = "#" + v;
  const three = /^#([0-9a-fA-F]{3})$/.exec(v);
  if (three) {
    const [r, g, b] = three[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const six = /^#[0-9a-fA-F]{6}$/.exec(v);
  return six ? v.toLowerCase() : null;
}

// Validate a gradient shape to exactly three hex stops and an integer angle.
// Returns a normalized { stops, angle } or null if anything is missing/invalid.
export function normalizeGradient(raw) {
  if (!raw || typeof raw !== "object") return null;
  const stops = Array.isArray(raw.stops) ? raw.stops.slice(0, 3).map(normalizeHexColor) : [];
  if (stops.length !== 3 || stops.some((s) => !s)) return null;
  let angle = parseInt(raw.angle, 10);
  if (!Number.isFinite(angle)) angle = 135;
  angle = ((angle % 360) + 360) % 360;
  return { stops, angle };
}

// A CSS gradient string for a validated gradient, or null for a solid color.
export function gradientCss(g) {
  const grad = normalizeGradient(g);
  if (!grad) return null;
  return `linear-gradient(${grad.angle}deg, ${grad.stops[0]}, ${grad.stops[1]}, ${grad.stops[2]})`;
}

// Average the three stops of a gradient into one representative hex, so all the
// existing color-mix borders/glow (which need a solid) keep working when a note
// wears a gradient. Returns the solid color untouched otherwise. Always returns
// a valid hex string — a fallback is used if `color` is malformed — so a single
// bad note can never throw and blank the whole board.
export function representativeSolid(color, gradient) {
  const grad = normalizeGradient(gradient);
  if (!grad) return normalizeHexColor(color) || "#cccccc";
  const avg = grad.stops.reduce(
    (acc, hex) => { const c = hexToRgbObj(hex); return { r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }; },
    { r: 0, g: 0, b: 0 }
  );
  return rgbToHex(avg.r / 3, avg.g / 3, avg.b / 3);
}

// Pick a readable text color for a note by luminance. Used as the default when a
// note has no explicit textColor, so light notes get dark text and vice versa.
export function smartTextColor(color, gradient) {
  const solid = representativeSolid(color, gradient);
  const { r, g, b } = hexToRgbObj(solid);
  // Rec. 709 relative luminance — above 0.5 we read the fill as light.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum >= 0.55 ? "#2a2a1f" : "#f5f5ef";
}

// --- internal rgb helpers for the color math above ---
// Defensive: coerces anything into a hex string first, so callers can never
// throw on a malformed color value that slipped through migration.
function hexToRgbObj(hex) {
  const v = normalizeHexColor(hex) || "#cccccc";
  return {
    r: parseInt(v.slice(1, 3), 16),
    g: parseInt(v.slice(3, 5), 16),
    b: parseInt(v.slice(5, 7), 16),
  };
}
function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function newNote(index) {
  return {
    id: uid(),
    title: "",
    color: NOTE_COLORS[index % NOTE_COLORS.length],
    rot: Math.round((Math.random() * 3 - 1.5) * 10) / 10,
    x: 28 + (index % 4) * 260,
    y: 28 + Math.floor(index / 4) * 250,
    w: 240,
    h: null,
    z: 0, // bumped to nextZ() by the caller when placing on a board
    createdAt: new Date().toISOString(),
    deadlineAt: null,
    completedAt: null,
    deletedAt: null,
    items: [],
    pin: null,
    tunnels: [],
    textColor: null, // null = use the contrast-aware default for the note's fill
    gradient: null, // a 3-stop fill override; null = solid color
  };
}

// A fresh checklist step. Centralized so the note shape stays consistent
// wherever a step is created (board, demo seed).
export function newItem(text) {
  return { id: uid(), text, done: false, assignee: null, assignedBy: null, doneBy: null, doneAt: null };
}

// A note counts as "completed" purely by its completedAt stamp — set either
// automatically when the last step is checked, or explicitly via "Mark
// complete" (which lets a note be ended early with steps still open).
export const isNoteComplete = (note) => Boolean(note.completedAt);

// "Deleting" a note is a soft archive: it leaves the board (and every active
// view) but is kept, with its step-completion record intact, in the board's
// Completed stack. Active views should show only notes where this is true.
export const isNoteActive = (note) => !note.deletedAt;

// Arrange notes into a tidy grid — the "Tidy up" button. Free-drag is the
// default; this snaps everything back into columns without losing any notes.
export function tidyPositions(count, boardWidth) {
  const cols = Math.max(1, Math.floor((boardWidth - 28) / 260));
  return Array.from({ length: count }, (_, i) => ({
    x: 28 + (i % cols) * 260,
    y: 28 + Math.floor(i / cols) * 250,
  }));
}

/* ------------------------- sticker upload framework ---------------------- */
// A sticker is a reusable image (PNG/JPEG/WebP, or transparent GIF) uploaded
// once and kept in the board's library — placing it on the canvas (a
// "decoration") just references its id, so dropping the same image on again
// never re-uploads it. For the demo the image is stored inline as a data URL
// so no backend is needed; the size cap keeps us inside localStorage quota.
// When the real backend lands, swap fileToDataURL for an upload call and
// store the returned URL in the sticker's `src` — nothing else changes.

export const MAX_STICKER_BYTES = 900 * 1024; // ~0.9 MB per image
export const STICKER_TYPES = "image/png,image/gif,image/jpeg,image/webp";

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

// The library entry — one per unique upload.
export function newSticker(src) {
  return { id: uid(), src };
}

// One placement of a sticker on the canvas. Many of these can point at the
// same stickerId.
export function newDecoration(stickerId, index) {
  // Cascade new placements so several drops don't stack invisibly.
  return {
    id: uid(),
    stickerId,
    x: 48 + (index % 4) * 56,
    y: 48 + (index % 3) * 48,
    w: 180,
    rot: 0,
    z: 0, // bumped to nextZ() by the caller when placing on a board
  };
}

/* --------------------------- layering helpers --------------------------- */
// Notes and decorations share one z stack on each board. These pure helpers
// operate on a combined list of { id, z } items (callers pass
// [...project.decorations, ...project.notes]).

// The next z to assign a freshly added item so it lands on top.
export function nextZ(project) {
  let max = -1;
  for (const d of project.decorations || []) if (typeof d.z === "number") max = Math.max(max, d.z);
  for (const n of project.notes || []) if (typeof n.z === "number") max = Math.max(max, n.z);
  return max + 1;
}

// Move an item up one level (swaps z with the nearest item just above it).
// Returns a Map<id, newZ> of the changed items (empty at the top), so callers
// can persist both sides of the swap.
export function bringForward(items, id) {
  const sorted = items.filter((x) => typeof x.z === "number").sort((a, b) => a.z - b.z);
  const i = sorted.findIndex((x) => x.id === id);
  if (i < 0 || i === sorted.length - 1) return new Map();
  const a = sorted[i], b = sorted[i + 1];
  return new Map([[a.id, b.z], [b.id, a.z]]);
}

// Move an item down one level (swaps z with the nearest item just below it).
export function sendBackward(items, id) {
  const sorted = items.filter((x) => typeof x.z === "number").sort((a, b) => a.z - b.z);
  const i = sorted.findIndex((x) => x.id === id);
  if (i <= 0) return new Map();
  const a = sorted[i], b = sorted[i - 1];
  return new Map([[a.id, b.z], [b.id, a.z]]);
}

/* ------------------------------ demo data ------------------------------- */

// Relative deadlines so the countdown always looks live in a demo.
const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString();

export function demoData() {
  // Item tuple: [text, done, assignee?, assignedBy?, doneBy?, doneAtDays?]
  const note = (title, color, x, y, deadlineAt, items, extra = {}) => ({
    id: uid(), title, color, x, y, w: 240, h: null,
    rot: Math.round((Math.random() * 3 - 1.5) * 10) / 10,
    createdAt: daysFromNow(-3),
    deadlineAt,
    completedAt: null,
    deletedAt: null,
    items: items.map(([text, done, assignee, assignedBy, doneBy, doneAtDays]) => ({
      id: uid(), text, done,
      assignee: assignee || null, assignedBy: assignedBy || null, doneBy: doneBy || null,
      doneAt: done ? daysFromNow(doneAtDays == null ? -1 : doneAtDays) : null,
    })),
    pin: null,
    tunnels: [],
    ...extra,
  });
  return {
    teams: [
      {
        id: uid(),
        name: "Design Team",
        members: ["Avery", "Sam", "Jordan"],
        projects: [
          {
            id: uid(),
            name: "Website Refresh",
            stickers: [],
            decorations: [],
            notes: [
              // Homepage hero: Avery's step is done (Completed), and Avery
              // handed "Hero image options" to Sam (Distributed).
              note("Homepage hero", "#fef08a", 40, 40, daysFromNow(-1), [
                ["New tagline copy", true, "Avery", "Avery", "Avery"],
                ["Hero image options", false, "Sam", "Avery"],
                ["Mobile layout", false],
              ], { pin: { to: "team" } }),
              // Pricing page: assigned to Avery and not done (Working On), and
              // tunneled onto Avery's dashboard (Pinned).
              note("Pricing page", "#bae6fd", 330, 120, daysFromNow(3), [
                ["Compare-plans table", false, "Avery", "Avery"],
                ["FAQ section", false],
              ], { pin: { to: "member", member: "Avery" }, tunnels: ["Avery"] }),
              note("Ideas", "#bbf7d0", 630, 60, null, [
                ["Dark mode toggle", false],
                ["Customer logos strip", false],
              ]),
              // A finished note: every step done, completed a day ago, ahead of
              // its deadline — populates the board's Completed stack and (being
              // yoinked by Avery) shows on My Board too.
              note("Brand guidelines", "#ddd6fe", 40, 320, daysFromNow(1), [
                ["Logo usage rules", true, "Jordan", "Jordan", "Jordan", -2],
                ["Color palette", true, "Avery", "Jordan", "Avery", -1],
                ["Typography scale", true, "Sam", "Jordan", "Sam", -1],
              ], { completedAt: daysFromNow(-1), tunnels: ["Avery"] }),
              // A scrapped note: deleted with only one step done. It's off the
              // board but kept in the Completed stack, its step record intact.
              note("Old landing concept", "#fed7aa", 330, 320, null, [
                ["Draft hero copy", true, "Sam", "Sam", "Sam", -2],
                ["Pick a layout", false],
              ], { completedAt: daysFromNow(-2), deletedAt: daysFromNow(-2) }),
            ],
          },
          {
            id: uid(),
            name: "Spring Campaign",
            stickers: [],
            decorations: [],
            notes: [
              note("Social posts", "#fbcfe8", 60, 60, daysFromNow(5), [
                ["Draft 5 captions", true, "Sam", "Sam", "Sam"],
                ["Schedule week 1", false, "Sam"],
              ], { pin: { to: "member", member: "Sam" } }),
            ],
          },
        ],
      },
    ],
  };
}

/* --------------------- personal dashboard derivation -------------------- */
// The four dashboard columns are a query over the team's notes for one person.
// Only "Pinned" is an explicit action (a tunnel); the rest fall out of who is
// assigned to what. See the architecture notes for why these are derived.
export function selectDashboard(team, me) {
  const cols = { pinned: [], working: [], completed: [], distributed: [] };
  if (!me) return cols;
  for (const project of team.projects)
    for (const note of project.notes) {
      if (!isNoteActive(note)) continue; // archived notes live only in Completed
      const entry = { note, project };
      const mine = note.items.filter((i) => i.assignee === me);

      if (note.tunnels.includes(me)) cols.pinned.push(entry);
      if (mine.some((i) => !i.done)) cols.working.push(entry);
      if (mine.length && mine.every((i) => i.done)) cols.completed.push(entry);
      if (note.items.some((i) => i.assignedBy === me && i.assignee && i.assignee !== me))
        cols.distributed.push(entry);
    }
  return cols;
}

/* -------------------------- My Board derivation ------------------------- */
// My Board gathers every note `me` has yoinked, across ALL teams, grouped into
// one section per team (a mini-board of that team's yoinked notes). Editing a
// note here writes back to the original team-board note — a yoink is a link,
// never a copy. Returns [{ team, entries: [{ note, project }] }] for teams that
// have at least one yoinked note.
export function selectMyBoard(data, me) {
  if (!me) return [];
  const sections = [];
  for (const team of data.teams || []) {
    const entries = [];
    for (const project of team.projects || [])
      for (const note of project.notes || [])
        if (isNoteActive(note) && (note.tunnels || []).includes(me)) entries.push({ note, project });
    if (entries.length) sections.push({ team, entries });
  }
  return sections;
}

// Everyone the demo knows about, for the cross-team My Board identity picker.
export const allMemberNames = (data) =>
  [...new Set((data.teams || []).flatMap((t) => t.members || []))].sort();
