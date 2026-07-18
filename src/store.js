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
//         createdAt, deadlineAt,                 // ISO strings; deadlineAt may be null
//         items: [{ id, text, done, assignee, assignedBy, doneBy }],
//         pin: null | { to: "team" } | { to: "member", member },
//         tunnels: [string]                      // names who pinned this to their dashboard
//       }],
//       decorations: [{ id, src, x, y, w }]
//     }]
//   }]
// }
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
    ...n,
    x: typeof n.x === "number" ? n.x : 28 + (i % 4) * 260,
    y: typeof n.y === "number" ? n.y : 28 + Math.floor(i / 4) * 250,
    createdAt: n.createdAt || new Date().toISOString(),
    deadlineAt: n.deadlineAt || null,
    completedAt: n.completedAt || null,
    // `tunnels` is the underlying field for the Yoink feature — names who
    // yoinked this note onto their personal board.
    tunnels: Array.isArray(n.tunnels) ? n.tunnels : [],
    items: (n.items || []).map((it) => ({
      assignee: null, assignedBy: null, doneBy: null, doneAt: null, ...it,
    })),
  };
}

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.teams)) {
      for (const t of data.teams)
        for (const p of t.projects) {
          p.decorations = p.decorations || [];
          p.notes = (p.notes || []).map(migrateNote);
        }
      return data;
    }
  } catch {}
  return { teams: [] };
}

export function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
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

export function newNote(index) {
  return {
    id: uid(),
    title: "",
    color: NOTE_COLORS[index % NOTE_COLORS.length],
    rot: Math.round((Math.random() * 3 - 1.5) * 10) / 10,
    x: 28 + (index % 4) * 260,
    y: 28 + Math.floor(index / 4) * 250,
    createdAt: new Date().toISOString(),
    deadlineAt: null,
    completedAt: null,
    items: [],
    pin: null,
    tunnels: [],
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

// Arrange notes into a tidy grid — the "Tidy up" button. Free-drag is the
// default; this snaps everything back into columns without losing any notes.
export function tidyPositions(count, boardWidth) {
  const cols = Math.max(1, Math.floor((boardWidth - 28) / 260));
  return Array.from({ length: count }, (_, i) => ({
    x: 28 + (i % cols) * 260,
    y: 28 + Math.floor(i / cols) * 250,
  }));
}

/* --------------------- decoration upload framework ---------------------- */
// Decorations are images (PNG/JPEG/WebP, or transparent GIFs) users place on
// a board for personality. For the demo they're stored inline as data URLs so
// no backend is needed; the size cap keeps us inside localStorage quota.
// When the real backend lands, swap fileToDataURL for an upload call and
// store the returned URL in `src` — nothing else changes.

export const MAX_DECORATION_BYTES = 900 * 1024; // ~0.9 MB per image
export const DECORATION_TYPES = "image/png,image/gif,image/jpeg,image/webp";

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

export function newDecoration(src, index) {
  // Cascade new decorations so several uploads don't stack invisibly.
  return { id: uid(), src, x: 48 + (index % 4) * 56, y: 48 + (index % 3) * 48, w: 180 };
}

/* ------------------------------ demo data ------------------------------- */

// Relative deadlines so the countdown always looks live in a demo.
const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString();

export function demoData() {
  // Item tuple: [text, done, assignee?, assignedBy?, doneBy?, doneAtDays?]
  const note = (title, color, x, y, deadlineAt, items, extra = {}) => ({
    id: uid(), title, color, x, y,
    rot: Math.round((Math.random() * 3 - 1.5) * 10) / 10,
    createdAt: daysFromNow(-3),
    deadlineAt,
    completedAt: null,
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
            ],
          },
          {
            id: uid(),
            name: "Spring Campaign",
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
        if ((note.tunnels || []).includes(me)) entries.push({ note, project });
    if (entries.length) sections.push({ team, entries });
  }
  return sections;
}

// Everyone the demo knows about, for the cross-team My Board identity picker.
export const allMemberNames = (data) =>
  [...new Set((data.teams || []).flatMap((t) => t.members || []))].sort();
