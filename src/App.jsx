import React, { useEffect, useState, useCallback } from "react";
import {
  Plus, Users, ArrowLeft, Pin, Trash2, X, FolderOpen, Sparkles, LayoutDashboard,
} from "lucide-react";
import { uid, getMe, setMe } from "./store.js";
import { db, usingBackend } from "./db/index.js";
import AuthGate from "./AuthGate.jsx";
import BoardView from "./BoardView.jsx";
import WorkingAs from "./WorkingAs.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import PersonalDashboard from "./PersonalDashboard.jsx";

export default function App() {
  // AuthGate supplies the signed-in user (Supabase) or null (localStorage demo).
  return <AuthGate>{(user) => <Workspace user={user} />}</AuthGate>;
}

function Workspace({ user }) {
  const [data, setData] = useState(null); // null while the first load is in flight
  const [view, setView] = useState({ screen: "home" });
  // Under a real backend identity is fixed to the signed-in user; in the demo
  // it stays the per-team "working as" name.
  const fixedMe = user?.name || null;

  const reload = useCallback(() => {
    db.loadWorkspace()
      .then(setData)
      .catch((err) => { console.error("Load failed:", err); setData({ teams: [] }); });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Realtime: when the backend reports a change, pull a fresh workspace.
  useEffect(() => {
    if (!usingBackend) return;
    return db.subscribe(() => reload());
  }, [reload]);

  if (!data) return <div className="screen"><p className="page hint">Loading…</p></div>;

  const team = data.teams.find((t) => t.id === view.teamId);
  const project = team?.projects.find((p) => p.id === view.projectId);

  // Optimistic tree updates keep the UI snappy; the db call persists.
  const patchProject = (teamId, projectId, fn) =>
    setData((d) => ({
      ...d,
      teams: d.teams.map((t) =>
        t.id === teamId
          ? { ...t, projects: t.projects.map((p) => (p.id === projectId ? fn(p) : p)) }
          : t
      ),
    }));

  const addTeam = (t) => { setData((d) => ({ ...d, teams: [...d.teams, t] })); db.createTeam(t); };
  const deleteTeam = (teamId) => {
    setData((d) => ({ ...d, teams: d.teams.filter((t) => t.id !== teamId) }));
    db.deleteTeam(teamId);
  };
  const addProject = (teamId, proj) => {
    setData((d) => ({ ...d, teams: d.teams.map((t) => (t.id === teamId ? { ...t, projects: [...t.projects, proj] } : t)) }));
    db.createProject(teamId, proj);
  };
  const setMembers = (teamId, members) => {
    setData((d) => ({ ...d, teams: d.teams.map((t) => (t.id === teamId ? { ...t, members } : t)) }));
    db.setMembers(teamId, members);
  };

  if (view.screen === "board" && team && project) {
    return (
      <BoardView
        team={team}
        project={project}
        fixedMe={fixedMe}
        onBack={() => setView({ screen: "team", teamId: team.id })}
        onPatchProject={(fn) => patchProject(team.id, project.id, fn)}
      />
    );
  }

  if (view.screen === "team" && team) {
    return (
      <TeamScreen
        team={team}
        fixedMe={fixedMe}
        onBack={() => setView({ screen: "home" })}
        onOpenProject={(projectId) => setView({ screen: "board", teamId: team.id, projectId })}
        onAddProject={(proj) => addProject(team.id, proj)}
        onSetMembers={(members) => setMembers(team.id, members)}
        onDelete={() => { deleteTeam(team.id); setView({ screen: "home" }); }}
      />
    );
  }

  return (
    <HomeScreen
      teams={data.teams}
      onAddTeam={addTeam}
      onOpenTeam={(teamId) => setView({ screen: "team", teamId })}
      onSeedDemo={async () => setData(await db.seedDemo())}
    />
  );
}

/* ------------------------------- home ---------------------------------- */

function HomeScreen({ teams, onAddTeam, onOpenTeam, onSeedDemo }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="screen">
      <header className="topbar">
        <h1><Pin size={22} className="logo-pin" /> MarqueeNotes</h1>
        <ThemeSwitcher />
      </header>

      <main className="page">
        <div className="page-head">
          <h2>Teams</h2>
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New team
          </button>
        </div>

        {teams.length === 0 && (
          <div className="empty">
            <p>No boards up yet. Start one for your team{usingBackend ? "." : ", or load the sample board to look around."}</p>
            {!usingBackend && (
              <button className="btn" onClick={onSeedDemo}>
                <Sparkles size={16} /> Load demo data
              </button>
            )}
          </div>
        )}

        <div className="card-grid">
          {teams.map((t) => (
            <button key={t.id} className="card" onClick={() => onOpenTeam(t.id)}>
              <div className="card-title"><Users size={16} /> {t.name}</div>
              <div className="card-sub">
                <FolderOpen size={14} /> {t.projects.length} project{t.projects.length === 1 ? "" : "s"}
                <span className="dot">·</span> {t.members.length} member{t.members.length === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </div>
      </main>

      {creating && <NewTeamModal onClose={() => setCreating(false)} onCreate={onAddTeam} />}
    </div>
  );
}

function NewTeamModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the team a name.");
    onCreate({
      id: uid(),
      name: name.trim(),
      members: usingBackend ? [] : members.split(",").map((m) => m.trim()).filter(Boolean),
      projects: [],
    });
    onClose();
  };

  return (
    <Modal title="New team" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>Team name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Design Team" />
        </label>
        {!usingBackend && (
          <label>Who&rsquo;s on it? <span className="muted">(comma-separated, add more anytime)</span>
            <input value={members} onChange={(e) => setMembers(e.target.value)} placeholder="Avery, Sam, Jordan" />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Create team</button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------- team ---------------------------------- */

function TeamScreen({ team, fixedMe, onBack, onOpenProject, onAddProject, onSetMembers, onDelete }) {
  const [tab, setTab] = useState("projects");
  const [newProject, setNewProject] = useState("");
  const [newMember, setNewMember] = useState("");
  const [pinFilter, setPinFilter] = useState("all");
  const [localMe, setLocalMe] = useState(() => getMe(team.id));
  const me = fixedMe || localMe;
  const canEditMembers = !usingBackend; // real members come from invites

  const changeMe = (name) => { setMe(team.id, name); setLocalMe(name); };

  const addProject = (e) => {
    e.preventDefault();
    const name = newProject.trim();
    if (!name) return;
    onAddProject({ id: uid(), name, notes: [], decorations: [] });
    setNewProject("");
  };

  const addMember = (e) => {
    e.preventDefault();
    const name = newMember.trim();
    if (!name || team.members.includes(name)) return;
    onSetMembers([...team.members, name]);
    setNewMember("");
  };

  const pinned = team.projects.flatMap((p) =>
    p.notes.filter((n) => n.pin).map((n) => ({ project: p, note: n }))
  ).filter(({ note }) => {
    if (pinFilter === "all") return true;
    if (pinFilter === "team") return note.pin.to === "team";
    return note.pin.to === "member" && note.pin.member === pinFilter;
  });

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> Teams</button>
        <h1>{team.name}</h1>
        {!fixedMe && <WorkingAs team={team} me={me} onChange={changeMe} />}
        <ThemeSwitcher />
        <button
          className="btn ghost danger"
          title="Delete this team"
          onClick={() => { if (window.confirm(`Take down “${team.name}” and all its boards?`)) onDelete(); }}
        >
          <Trash2 size={16} />
        </button>
      </header>

      <main className="page">
        <div className="tabs">
          <button className={tab === "projects" ? "tab active" : "tab"} onClick={() => setTab("projects")}>
            <FolderOpen size={15} /> Projects
          </button>
          <button className={tab === "dashboard" ? "tab active" : "tab"} onClick={() => setTab("dashboard")}>
            <LayoutDashboard size={15} /> My Dashboard
          </button>
          <button className={tab === "pinned" ? "tab active" : "tab"} onClick={() => setTab("pinned")}>
            <Pin size={15} /> Pinned
          </button>
          <button className={tab === "members" ? "tab active" : "tab"} onClick={() => setTab("members")}>
            <Users size={15} /> Members
          </button>
        </div>

        {tab === "projects" && (
          <>
            <form onSubmit={addProject} className="inline-form">
              <input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="New project name…" />
              <button className="btn primary" type="submit"><Plus size={16} /> Add</button>
            </form>
            {team.projects.length === 0 && (
              <p className="hint">No boards yet — add a project above and it gets its own board.</p>
            )}
            <div className="card-grid">
              {team.projects.map((p) => (
                <button key={p.id} className="card" onClick={() => onOpenProject(p.id)}>
                  <div className="card-title">{p.name}</div>
                  <div className="card-sub">
                    {p.notes.length} note{p.notes.length === 1 ? "" : "s"}
                    {p.notes.some((n) => n.pin) && <span className="pin-badge"><Pin size={12} /> pinned</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "dashboard" && (
          <PersonalDashboard team={team} me={me} onOpenProject={onOpenProject} />
        )}

        {tab === "pinned" && (
          <>
            <p className="hint">Everything the team has flagged, in one place — so nothing gets picked up twice.</p>
            <div className="inline-form">
              <select value={pinFilter} onChange={(e) => setPinFilter(e.target.value)}>
                <option value="all">All pins</option>
                <option value="team">Whole team</option>
                {team.members.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {pinned.length === 0 && <p className="hint">Nothing pinned yet. Pin a note from any board to flag it here.</p>}
            <div className="card-grid">
              {pinned.map(({ project, note }) => (
                <button key={note.id} className="card pinned-card" style={{ "--note-color": note.color }}
                  onClick={() => onOpenProject(project.id)}>
                  <div className="card-title dark">
                    <Pin size={14} /> {note.title || "Untitled note"}
                  </div>
                  <div className="card-sub dark">
                    {project.name} · {note.pin.to === "team" ? "Whole team" : note.pin.member}
                    {note.items.length > 0 &&
                      ` · ${note.items.filter((i) => i.done).length}/${note.items.length} done`}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "members" && (
          <>
            <p className="hint">
              {canEditMembers
                ? "Steps and notes can carry these names, so it’s always clear who’s on what — and what’s already handled."
                : "Members come from your team’s real accounts. Invite teammates by email (invite flow coming with the connected build)."}
            </p>
            {canEditMembers && (
              <form onSubmit={addMember} className="inline-form">
                <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Add a teammate’s name…" />
                <button className="btn primary" type="submit"><Plus size={16} /> Add</button>
              </form>
            )}
            <ul className="member-list">
              {team.members.map((m) => (
                <li key={m}>
                  {m}
                  {canEditMembers && (
                    <button
                      className="icon-btn"
                      title="Remove member"
                      onClick={() => onSetMembers(team.members.filter((x) => x !== m))}
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------- shared -------------------------------- */

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
