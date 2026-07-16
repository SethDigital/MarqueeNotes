// local.js — the repository over localStorage. This is the default backend and
// the one the browser tests exercise. It implements the same async interface as
// the Supabase backend, so the UI is identical either way.
//
// Ops are entity-level and take whole objects (e.g. updateNote gets the full
// note incl. its items and tunnels). That granularity is what lets the Supabase
// backend write to normalized tables without one client clobbering another's
// rows — see ./supabase.js.

import { load, save, demoData } from "../store.js";

const findTeam = (d, teamId) => d.teams.find((t) => t.id === teamId);
const findProject = (d, teamId, projectId) =>
  findTeam(d, teamId)?.projects.find((p) => p.id === projectId);

// Read the tree, apply a change, write it back.
function mutate(fn) {
  const data = load();
  fn(data);
  save(data);
}

export const localBackend = {
  usesAuth: false,

  async loadWorkspace() {
    return load();
  },

  async seedDemo() {
    const data = demoData();
    save(data);
    return data;
  },

  /* ------------------------------- teams ------------------------------- */
  async createTeam(team) {
    mutate((d) => d.teams.push(team));
  },
  async deleteTeam(teamId) {
    mutate((d) => { d.teams = d.teams.filter((t) => t.id !== teamId); });
  },
  async setMembers(teamId, members) {
    mutate((d) => { const t = findTeam(d, teamId); if (t) t.members = members; });
  },

  /* ------------------------------ projects ----------------------------- */
  async createProject(teamId, project) {
    mutate((d) => findTeam(d, teamId)?.projects.push(project));
  },

  /* ------------------------------- notes ------------------------------- */
  async createNote(teamId, projectId, note) {
    mutate((d) => findProject(d, teamId, projectId)?.notes.push(note));
  },
  async updateNote(teamId, projectId, note) {
    mutate((d) => {
      const p = findProject(d, teamId, projectId);
      if (p) p.notes = p.notes.map((n) => (n.id === note.id ? note : n));
    });
  },
  async deleteNote(teamId, projectId, noteId) {
    mutate((d) => {
      const p = findProject(d, teamId, projectId);
      if (p) p.notes = p.notes.filter((n) => n.id !== noteId);
    });
  },
  async updateNotePositions(teamId, projectId, positions) {
    mutate((d) => {
      const p = findProject(d, teamId, projectId);
      if (!p) return;
      const by = new Map(positions.map((x) => [x.id, x]));
      p.notes = p.notes.map((n) => (by.has(n.id) ? { ...n, ...by.get(n.id) } : n));
    });
  },

  /* ---------------------------- decorations ---------------------------- */
  async createDecoration(teamId, projectId, decoration) {
    mutate((d) => findProject(d, teamId, projectId)?.decorations.push(decoration));
  },
  async updateDecoration(teamId, projectId, decoration) {
    mutate((d) => {
      const p = findProject(d, teamId, projectId);
      if (p) p.decorations = p.decorations.map((x) => (x.id === decoration.id ? decoration : x));
    });
  },
  async deleteDecoration(teamId, projectId, decorationId) {
    mutate((d) => {
      const p = findProject(d, teamId, projectId);
      if (p) p.decorations = p.decorations.filter((x) => x.id !== decorationId);
    });
  },

  /* ------------------------------ realtime ----------------------------- */
  // No peers in a single browser; nothing to subscribe to.
  subscribe() {
    return () => {};
  },
};
