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
//         id, title, color, rot,
//         items: [{ id, text, done, assignee, doneBy }],
//         pin: null | { to: "team" } | { to: "member", member }
//       }],
//       decorations: [{ id, src, x, y, w }]
//     }]
//   }]
// }

const KEY = "marquee-notes-v1";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.teams)) {
      // Normalize saves from earlier versions: decorations arrived later, and
      // passwordHash may linger on old teams (harmless, ignored).
      for (const t of data.teams)
        for (const p of t.projects) p.decorations = p.decorations || [];
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
    items: [],
    pin: null,
  };
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

export function demoData() {
  const note = (title, color, items, pin = null) => ({
    id: uid(), title, color,
    rot: Math.round((Math.random() * 3 - 1.5) * 10) / 10,
    items: items.map(([text, done, assignee, doneBy]) => ({
      id: uid(), text, done, assignee: assignee || null, doneBy: doneBy || null,
    })),
    pin,
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
              note("Homepage hero", "#fef08a", [
                ["New tagline copy", true, "Avery", "Avery"],
                ["Hero image options", false, "Sam"],
                ["Mobile layout", false],
              ], { to: "team" }),
              note("Pricing page", "#bae6fd", [
                ["Compare-plans table", false, "Avery"],
                ["FAQ section", false],
              ], { to: "member", member: "Avery" }),
              note("Ideas", "#bbf7d0", [
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
              note("Social posts", "#fbcfe8", [
                ["Draft 5 captions", true, "Sam", "Sam"],
                ["Schedule week 1", false, "Sam"],
              ], { to: "member", member: "Sam" }),
            ],
          },
        ],
      },
    ],
  };
}
