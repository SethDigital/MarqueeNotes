// store.js — all persistence lives here so the localStorage demo backend can
// later be swapped for a real API without touching the UI.
//
// Data shape:
// {
//   teams: [{
//     id, name, passwordHash, members: [string],
//     projects: [{
//       id, name,
//       notes: [{
//         id, title, color, x, y, rot,
//         items: [{ id, text, done }],
//         pin: null | { to: "team" } | { to: "member", member }
//       }]
//     }]
//   }]
// }

const KEY = "marquee-notes-v1";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.teams)) return data;
  } catch {}
  return { teams: [] };
}

export function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

// Client-side gate only — anyone with the URL can inspect the data. Real
// access control arrives with the backend.
export async function hashPassword(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Unlocks last for the browser session only.
export const isUnlocked = (teamId) => sessionStorage.getItem("marquee-notes-unlock-" + teamId) === "1";
export const unlock = (teamId) => sessionStorage.setItem("marquee-notes-unlock-" + teamId, "1");

export const NOTE_COLORS = ["#fef08a", "#fbcfe8", "#bae6fd", "#bbf7d0", "#fed7aa", "#ddd6fe"];

export function newNote(index) {
  return {
    id: uid(),
    title: "",
    color: NOTE_COLORS[index % NOTE_COLORS.length],
    x: 40 + (index % 5) * 60,
    y: 40 + (index % 4) * 50,
    rot: Math.round((Math.random() * 6 - 3) * 10) / 10,
    items: [],
    pin: null,
  };
}

export async function demoData() {
  const note = (title, color, x, y, items, pin = null) => ({
    id: uid(), title, color, x, y,
    rot: Math.round((Math.random() * 6 - 3) * 10) / 10,
    items: items.map(([text, done]) => ({ id: uid(), text, done })),
    pin,
  });
  return {
    teams: [
      {
        id: uid(),
        name: "Design Team",
        passwordHash: await hashPassword("demo"),
        members: ["Avery", "Sam", "Jordan"],
        projects: [
          {
            id: uid(),
            name: "Website Refresh",
            notes: [
              note("Homepage hero", "#fef08a", 40, 40, [
                ["New tagline copy", true],
                ["Hero image options", false],
                ["Mobile layout", false],
              ], { to: "team" }),
              note("Pricing page", "#bae6fd", 340, 90, [
                ["Compare-plans table", false],
                ["FAQ section", false],
              ], { to: "member", member: "Avery" }),
              note("Ideas", "#bbf7d0", 640, 50, [
                ["Dark mode toggle", false],
                ["Customer logos strip", false],
              ]),
            ],
          },
          {
            id: uid(),
            name: "Spring Campaign",
            notes: [
              note("Social posts", "#fbcfe8", 60, 60, [
                ["Draft 5 captions", false],
                ["Schedule week 1", false],
              ], { to: "member", member: "Sam" }),
            ],
          },
        ],
      },
    ],
  };
}
