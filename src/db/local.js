// local.js — the repository over localStorage. This is the default backend and
// the one the browser tests exercise. It implements the same async interface as
// the Supabase backend, so the UI is identical either way.
//
// Ops are entity-level and take whole objects (e.g. updateNote gets the full
// note incl. its items and tunnels). That granularity is what lets the Supabase
// backend write to normalized tables without one client clobbering another's
// rows — see ./supabase.js.

import {
  load, save, demoData, uid, genInviteCode, normalizeInviteCode, INVITE_TTL_MS,
  getStash, addToStash as stashAdd, removeFromStash as stashRemove,
  migrateProjectAssets, migrateProjectZ,
} from "../store.js";

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
    const data = load();
    return { ...data, stash: getStash() };
  },

  async seedDemo() {
    const data = demoData();
    // Run the same on-load migration so freshly seeded boards get proper z
    // values (the seed doesn't set them) and an older decoration shape, if
    // any, is normalized.
    for (const t of data.teams)
      for (const p of t.projects) {
        migrateProjectAssets(p);
        migrateProjectZ(p);
      }
    save(data);
    return { ...data, stash: getStash() };
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

  /* ------------------------------ invites ------------------------------ */
  // A working single-browser mirror of the backend flow: mint a code good for a
  // few hours, list the live ones, revoke, and redeem. Codes are multi-use and
  // expire — enough to exercise the whole UI without a backend.
  async createInvite(teamId, role = "member") {
    const now = Date.now();
    const invite = {
      id: uid(), code: genInviteCode(), role,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
      uses: 0,
    };
    mutate((d) => { const t = findTeam(d, teamId); if (t) { t.invites = t.invites || []; t.invites.push(invite); } });
    return invite;
  },
  async listInvites(teamId) {
    const t = findTeam(load(), teamId);
    const now = Date.now();
    return (t?.invites || []).filter((i) => new Date(i.expiresAt).getTime() > now);
  },
  async revokeInvite(inviteId) {
    mutate((d) => { for (const t of d.teams) if (t.invites) t.invites = t.invites.filter((i) => i.id !== inviteId); });
  },
  async redeemInvite(code) {
    const wanted = normalizeInviteCode(code);
    const now = Date.now();
    let result = null;
    mutate((d) => {
      for (const t of d.teams) {
        const inv = (t.invites || []).find((i) => i.code === wanted);
        if (!inv) continue;
        if (new Date(inv.expiresAt).getTime() <= now) return; // expired = invalid
        inv.uses = (inv.uses || 0) + 1;
        result = { teamId: t.id, teamName: t.name };
        return;
      }
    });
    // One message for "never existed" and "expired" — an expired-specific
    // error would confirm a guessed code was once real (mirrors the backend's
    // redeem_invite(), see 0010_redeem_error_collapse.sql).
    if (!result) throw new Error("That invite code is not valid or has expired — ask for a fresh one");
    return result;
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

  /* ------------------------------ stickers ------------------------------ */
  async createSticker(teamId, projectId, sticker) {
    mutate((d) => findProject(d, teamId, projectId)?.stickers.push(sticker));
  },
  // Removing a sticker from the library takes every placement of it down too —
  // mirrors the ON DELETE CASCADE from decorations.sticker_id on the backend.
  async deleteSticker(teamId, projectId, stickerId) {
    mutate((d) => {
      const p = findProject(d, teamId, projectId);
      if (!p) return;
      p.stickers = p.stickers.filter((s) => s.id !== stickerId);
      p.decorations = p.decorations.filter((dec) => dec.stickerId !== stickerId);
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

  /* -------------------------------- stash ------------------------------- */
  // The personal sticker library lives outside the team tree (per-browser in
  // the demo). These just delegate to the store helpers.
  async addToStash(src) { return stashAdd(src); },
  async removeFromStash(stashId) { return stashRemove(stashId); },

  /* ------------------------------ realtime ----------------------------- */
  // No peers in a single browser; nothing to subscribe to.
  subscribe() {
    return () => {};
  },
};
