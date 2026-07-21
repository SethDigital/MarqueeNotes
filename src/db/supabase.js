// supabase.js — the repository over Supabase, implementing the same interface
// as ./local.js. Active only when VITE_SUPABASE_URL / _ANON_KEY are set.
//
// ⚠️ NOT YET VERIFIED against a live project — this is written against the
// schema in supabase/migrations/0001_init.sql and reviewed, but running it
// needs a real Supabase project (see docs/BACKEND.md). Treat every query here
// as needing a first real run before you rely on it.
//
// The tree the UI renders is denormalized (team → projects → notes → items).
// This module maps that tree to/from the normalized tables and translates the
// demo's name strings (assignee/doneBy/tunnels) to profile ids per team.

import { supabase } from "../supabase.js";

/* --------------------------- tree <-> tables ---------------------------- */

// Build name<->id maps for a team's members so the demo's name-based
// assignee/doneBy/tunnel fields can round-trip to profile ids.
function memberMaps(memberships) {
  const idToName = new Map();
  const nameToId = new Map();
  for (const m of memberships || []) {
    const p = m.profiles;
    if (!p) continue;
    idToName.set(p.id, p.display_name);
    nameToId.set(p.display_name, p.id);
  }
  return { idToName, nameToId };
}

function rowToNote(row, idToName) {
  return {
    id: row.id,
    title: row.title,
    color: row.color,
    rot: row.rot,
    x: row.x,
    y: row.y,
    w: row.w ?? 240,
    h: row.h ?? null,
    // Per-note text color + optional 3-stop gradient. Both null on older rows;
    // null text_color means "use the contrast-aware default" on the client.
    textColor: row.text_color || null,
    gradient: row.gradient || null,
    createdAt: row.created_at,
    deadlineAt: row.deadline_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
    pin:
      row.pin === "team"
        ? { to: "team" }
        : row.pin === "member"
        ? { to: "member", member: idToName.get(row.pinned_member) || null }
        : null,
    tunnels: (row.tunnels || []).map((t) => idToName.get(t.user_id)).filter(Boolean),
    items: (row.checklist_items || [])
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id,
        text: i.text,
        done: i.done,
        doneAt: i.done_at,
        assignee: idToName.get(i.assignee_id) || null,
        assignedBy: idToName.get(i.assigned_by_id) || null,
        doneBy: idToName.get(i.done_by_id) || null,
      })),
  };
}

// The nested read that assembles a whole workspace the current user can see.
// RLS scopes every table to the caller's teams.
const WORKSPACE_SELECT = `
  id, name,
  memberships ( role, profiles ( id, display_name ) ),
  boards (
    id, name,
    notes (
      id, title, color, rot, x, y, w, h, created_at, deadline_at, completed_at, deleted_at, pin, pinned_member, text_color, gradient,
      checklist_items ( id, text, done, done_at, position, assignee_id, assigned_by_id, done_by_id ),
      tunnels ( user_id )
    ),
    stickers ( id, src ),
    decorations ( id, sticker_id, x, y, w )
  )
`;

async function loadWorkspace() {
  const { data: auth } = await supabase.auth.getUser();
  const myId = auth?.user?.id;
  const { data, error } = await supabase.from("teams").select(WORKSPACE_SELECT);
  if (error) throw error;
  const teams = (data || []).map((team) => {
    const { idToName } = memberMaps(team.memberships);
    return {
      id: team.id,
      name: team.name,
      // The caller's own role on this team — drives who may mint invites.
      myRole: (team.memberships || []).find((m) => m.profiles?.id === myId)?.role || null,
      members: (team.memberships || []).map((m) => m.profiles?.display_name).filter(Boolean),
      projects: (team.boards || []).map((b) => ({
        id: b.id,
        name: b.name,
        notes: (b.notes || []).map((n) => rowToNote(n, idToName)),
        stickers: (b.stickers || []).map((s) => ({ id: s.id, src: s.src })),
        decorations: (b.decorations || []).map((d) => ({
          id: d.id, stickerId: d.sticker_id, x: d.x, y: d.y, w: d.w,
        })),
      })),
    };
  });
  return { teams };
}

// Resolve a team's name→id map on demand (for translating writes).
async function nameToIdFor(teamId) {
  const { data, error } = await supabase
    .from("memberships")
    .select("profiles ( id, display_name )")
    .eq("team_id", teamId);
  if (error) throw error;
  return memberMaps(data).nameToId;
}

/* -------------------------------- writes -------------------------------- */

async function writeNote(teamId, projectId, note) {
  const nameToId = await nameToIdFor(teamId);
  const { error: noteErr } = await supabase.from("notes").upsert({
    id: note.id,
    board_id: projectId,
    title: note.title,
    color: note.color,
    rot: note.rot,
    x: note.x,
    y: note.y,
    w: note.w ?? 240,
    h: note.h ?? null,
    deadline_at: note.deadlineAt,
    completed_at: note.completedAt || null,
    deleted_at: note.deletedAt || null,
    pin: note.pin ? note.pin.to : "none",
    pinned_member: note.pin?.to === "member" ? nameToId.get(note.pin.member) || null : null,
    text_color: note.textColor || null,
    gradient: note.gradient || null,
  });
  if (noteErr) throw noteErr;

  // Reconcile this note's items (scoped to one note the user is editing, so no
  // cross-user clobber): upsert current, delete the rest.
  const items = note.items.map((it, i) => ({
    id: it.id,
    note_id: note.id,
    text: it.text,
    position: i,
    done: it.done,
    done_at: it.doneAt || null,
    assignee_id: nameToId.get(it.assignee) || null,
    assigned_by_id: nameToId.get(it.assignedBy) || null,
    done_by_id: nameToId.get(it.doneBy) || null,
  }));
  if (items.length) await supabase.from("checklist_items").upsert(items);
  const keepIds = items.map((i) => i.id);
  let del = supabase.from("checklist_items").delete().eq("note_id", note.id);
  if (keepIds.length) del = del.not("id", "in", `(${keepIds.join(",")})`);
  await del;

  // Reconcile tunnels for the members named on the note. ignoreDuplicates turns
  // this into ON CONFLICT DO NOTHING rather than DO UPDATE — tunnels only ever
  // carry (user_id, note_id), so a re-yoink of an already-yoinked note has
  // nothing to update, and there's deliberately no UPDATE policy on tunnels
  // (see 0001_init.sql) for RLS to allow it against.
  const tunnelIds = note.tunnels.map((n) => nameToId.get(n)).filter(Boolean);
  if (tunnelIds.length) {
    const { error: tunnelErr } = await supabase.from("tunnels").upsert(
      tunnelIds.map((uid) => ({ user_id: uid, note_id: note.id })),
      { onConflict: "user_id,note_id", ignoreDuplicates: true }
    );
    if (tunnelErr) throw tunnelErr;
  }
  let delT = supabase.from("tunnels").delete().eq("note_id", note.id);
  if (tunnelIds.length) delT = delT.not("user_id", "in", `(${tunnelIds.join(",")})`);
  await delT;
}

export const supabaseBackend = {
  usesAuth: true,

  loadWorkspace,

  async seedDemo() {
    // Seeding real rows needs owned records; do it in SQL (see docs/BACKEND.md).
    throw new Error("Demo data is seeded from SQL when the backend is connected.");
  },

  /* ------------------------------- teams ------------------------------- */
  async createTeam(team) {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("teams")
      .insert({ id: team.id, name: team.name, created_by: user.user.id });
    if (error) throw error;
    // The on_team_created trigger makes the creator an admin automatically.
  },
  async deleteTeam(teamId) {
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) throw error;
  },
  async setMembers() {
    // Members are real profiles here; you don't add them by name. Joining a team
    // happens through the invite-code flow below (createInvite / redeemInvite).
    console.warn("setMembers is a no-op on the Supabase backend — use invites.");
  },

  /* ------------------------------ invites ------------------------------ */
  // Admin mints a single-use code; server enforces the admin check and returns
  // the new row (incl. its `code`).
  async createInvite(teamId, role = "member") {
    const { data, error } = await supabase.rpc("create_invite", {
      _team_id: teamId,
      _role: role,
    });
    if (error) throw error;
    // A single-composite return comes back as an object; be defensive anyway.
    return Array.isArray(data) ? data[0] : data;
  },

  // The team's still-live codes (not yet expired), for an admin to share or
  // revoke. RLS hides these from non-admins.
  async listInvites(teamId) {
    const { data, error } = await supabase
      .from("invite_codes")
      .select("id, code, role, created_at, expires_at, uses")
      .eq("team_id", teamId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async revokeInvite(inviteId) {
    const { error } = await supabase.from("invite_codes").delete().eq("id", inviteId);
    if (error) throw error;
  },

  // Redeem a code to join its team. Returns { teamId, teamName } on success and
  // throws with a human-readable message otherwise (invalid / expired / already
  // a member). Expiry is enforced in redeem_invite() on the server.
  async redeemInvite(code) {
    const { data, error } = await supabase.rpc("redeem_invite", { _code: code });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("That invite code is not valid");
    return { teamId: row.team_id, teamName: row.team_name };
  },

  /* ------------------------------ projects ----------------------------- */
  async createProject(teamId, project) {
    const { error } = await supabase
      .from("boards")
      .insert({ id: project.id, team_id: teamId, name: project.name });
    if (error) throw error;
  },

  /* ------------------------------- notes ------------------------------- */
  async createNote(teamId, projectId, note) {
    return writeNote(teamId, projectId, note);
  },
  async updateNote(teamId, projectId, note) {
    return writeNote(teamId, projectId, note);
  },
  async deleteNote(teamId, projectId, noteId) {
    const { error } = await supabase.from("notes").delete().eq("id", noteId);
    if (error) throw error;
  },
  async updateNotePositions(teamId, projectId, positions) {
    // Batch position updates (the "Tidy up" action).
    for (const p of positions)
      await supabase.from("notes").update({ x: p.x, y: p.y }).eq("id", p.id);
  },

  /* ------------------------------ stickers ------------------------------ */
  async createSticker(teamId, projectId, sticker) {
    const { error } = await supabase
      .from("stickers")
      .insert({ id: sticker.id, board_id: projectId, src: sticker.src });
    if (error) throw error;
  },
  // ON DELETE CASCADE on decorations.sticker_id takes every placement of this
  // sticker down with it — see 0005_stickers.sql.
  async deleteSticker(teamId, projectId, stickerId) {
    const { error } = await supabase.from("stickers").delete().eq("id", stickerId);
    if (error) throw error;
  },

  /* ---------------------------- decorations ---------------------------- */
  async createDecoration(teamId, projectId, decoration) {
    const { error } = await supabase.from("decorations").insert({
      id: decoration.id, board_id: projectId,
      sticker_id: decoration.stickerId, x: decoration.x, y: decoration.y, w: decoration.w,
    });
    if (error) throw error;
  },
  async updateDecoration(teamId, projectId, decoration) {
    const { error } = await supabase
      .from("decorations")
      .update({ x: decoration.x, y: decoration.y, w: decoration.w })
      .eq("id", decoration.id);
    if (error) throw error;
  },
  async deleteDecoration(teamId, projectId, decorationId) {
    const { error } = await supabase.from("decorations").delete().eq("id", decorationId);
    if (error) throw error;
  },

  /* ------------------------------ realtime ----------------------------- */
  // Any persisted change to the shared tables re-loads the workspace. A finer
  // patch-in-place pass is a later optimization; a reload is correct and simple.
  subscribe(onChange) {
    const channel = supabase
      .channel("workspace")
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "decorations" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "stickers" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tunnels" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "memberships" }, onChange)
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};
