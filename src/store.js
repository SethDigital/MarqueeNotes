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
// versions (no x/y, no deadlines, no tunnels) keep working instead of breaking.
function migrateNote(n, i) {
  return {
    rot: 0,
    pin: null,
    ...n,
    x: typeof n.x === "number" ? n.x : 28 + (i % 4) * 260,
    y: typeof n.y === "number" ? n.y : 28 + Math.floor(i / 4) * 250,
    createdAt: n.createdAt || new Date().toISOString(),
    deadlineAt: n.deadlineAt || null,
    tunnels: Array.isArray(n.tunnels) ? n.tunnels : [],
    items: (n.items || []).map((it) => ({
      assignee: null, assignedBy: null, doneBy: null, ...it,
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
    items: [],
    pin: null,
    tunnels: [],
  };
}

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
  const note = (title, color, x, y, deadlineAt, items, extra = {}) => ({
    id: uid(), title, color, x, y,
    rot: Math.round((Math.random() * 3 - 1.5) * 10) / 10,
    createdAt: daysFromNow(-3),
    deadlineAt,
    items: items.map(([text, done, assignee, assignedBy, doneBy]) => ({
      id: uid(), text, done,
      assignee: assignee || null, assignedBy: assignedBy || null, doneBy: doneBy || null,
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
