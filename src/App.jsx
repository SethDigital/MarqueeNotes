import React, { useEffect, useState } from "react";
import {
  Plus, Lock, Unlock, Users, ArrowLeft, Pin, Trash2, X, FolderOpen, Sparkles,
} from "lucide-react";
import { load, save, uid, hashPassword, isUnlocked, unlock, demoData } from "./store.js";
import BoardView from "./BoardView.jsx";

export default function App() {
  const [data, setData] = useState(load);
  // view: {screen:"home"} | {screen:"team", teamId} | {screen:"board", teamId, projectId}
  const [view, setView] = useState({ screen: "home" });

  useEffect(() => save(data), [data]);

  const team = data.teams.find((t) => t.id === view.teamId);
  const project = team?.projects.find((p) => p.id === view.projectId);

  const updateTeam = (teamId, fn) =>
    setData((d) => ({ ...d, teams: d.teams.map((t) => (t.id === teamId ? fn(t) : t)) }));

  if (view.screen === "board" && team && project) {
    return (
      <BoardView
        team={team}
        project={project}
        onBack={() => setView({ screen: "team", teamId: team.id })}
        onUpdateProject={(fn) =>
          updateTeam(team.id, (t) => ({
            ...t,
            projects: t.projects.map((p) => (p.id === project.id ? fn(p) : p)),
          }))
        }
      />
    );
  }

  if (view.screen === "team" && team) {
    return (
      <TeamScreen
        team={team}
        onBack={() => setView({ screen: "home" })}
        onOpenProject={(projectId) => setView({ screen: "board", teamId: team.id, projectId })}
        onUpdate={(fn) => updateTeam(team.id, fn)}
        onDelete={() => {
          setData((d) => ({ ...d, teams: d.teams.filter((t) => t.id !== team.id) }));
          setView({ screen: "home" });
        }}
      />
    );
  }

  return (
    <HomeScreen
      teams={data.teams}
      onAddTeam={(t) => setData((d) => ({ ...d, teams: [...d.teams, t] }))}
      onOpenTeam={(teamId) => setView({ screen: "team", teamId })}
      onSeedDemo={async () => setData(await demoData())}
    />
  );
}

/* ------------------------------- home ---------------------------------- */

function HomeScreen({ teams, onAddTeam, onOpenTeam, onSeedDemo }) {
  const [creating, setCreating] = useState(false);
  const [unlocking, setUnlocking] = useState(null); // team object

  return (
    <div className="screen">
      <header className="topbar">
        <h1><Pin size={22} className="logo-pin" /> MarqueeNotes</h1>
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
            <p>No teams yet. Create one, or load sample data to look around.</p>
            <button className="btn" onClick={onSeedDemo}>
              <Sparkles size={16} /> Load demo data
            </button>
            <p className="hint">Demo team password: <code>demo</code></p>
          </div>
        )}

        <div className="card-grid">
          {teams.map((t) => (
            <button
              key={t.id}
              className="card"
              onClick={() => (isUnlocked(t.id) ? onOpenTeam(t.id) : setUnlocking(t))}
            >
              <div className="card-title">
                {isUnlocked(t.id) ? <Unlock size={16} /> : <Lock size={16} />} {t.name}
              </div>
              <div className="card-sub">
                <FolderOpen size={14} /> {t.projects.length} project{t.projects.length === 1 ? "" : "s"}
                <Users size={14} style={{ marginLeft: 12 }} /> {t.members.length}
              </div>
            </button>
          ))}
        </div>
      </main>

      {creating && <NewTeamModal onClose={() => setCreating(false)} onCreate={onAddTeam} />}
      {unlocking && (
        <PasswordModal
          team={unlocking}
          onClose={() => setUnlocking(null)}
          onUnlocked={() => {
            const id = unlocking.id;
            setUnlocking(null);
            onOpenTeam(id);
          }}
        />
      )}
    </div>
  );
}

function NewTeamModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [members, setMembers] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Team name is required.");
    if (!password) return setError("A password is required.");
    onCreate({
      id: uid(),
      name: name.trim(),
      passwordHash: await hashPassword(password),
      members: members.split(",").map((m) => m.trim()).filter(Boolean),
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
        <label>Board password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Shared with the team" />
        </label>
        <label>Members <span className="muted">(comma-separated, optional)</span>
          <input value={members} onChange={(e) => setMembers(e.target.value)} placeholder="Avery, Sam, Jordan" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Create team</button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ team, onClose, onUnlocked }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if ((await hashPassword(password)) === team.passwordHash) {
      unlock(team.id);
      onUnlocked();
    } else {
      setError("Wrong password.");
    }
  };

  return (
    <Modal title={`Open “${team.name}”`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>Password
          <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary"><Unlock size={16} /> Open</button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------- team ---------------------------------- */

function TeamScreen({ team, onBack, onOpenProject, onUpdate, onDelete }) {
  const [tab, setTab] = useState("projects");
  const [newProject, setNewProject] = useState("");
  const [newMember, setNewMember] = useState("");
  const [pinFilter, setPinFilter] = useState("all");

  const addProject = (e) => {
    e.preventDefault();
    const name = newProject.trim();
    if (!name) return;
    onUpdate((t) => ({ ...t, projects: [...t.projects, { id: uid(), name, notes: [] }] }));
    setNewProject("");
  };

  const addMember = (e) => {
    e.preventDefault();
    const name = newMember.trim();
    if (!name || team.members.includes(name)) return;
    onUpdate((t) => ({ ...t, members: [...t.members, name] }));
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
        <button
          className="btn ghost danger"
          onClick={() => {
            if (window.confirm(`Delete team “${team.name}” and all its boards?`)) onDelete();
          }}
        >
          <Trash2 size={16} />
        </button>
      </header>

      <main className="page">
        <div className="tabs">
          <button className={tab === "projects" ? "tab active" : "tab"} onClick={() => setTab("projects")}>
            <FolderOpen size={15} /> Projects
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
            {team.projects.length === 0 && <p className="hint">No projects yet — add one above to get a board.</p>}
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

        {tab === "pinned" && (
          <>
            <div className="inline-form">
              <select value={pinFilter} onChange={(e) => setPinFilter(e.target.value)}>
                <option value="all">All pins</option>
                <option value="team">Whole team</option>
                {team.members.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {pinned.length === 0 && <p className="hint">Nothing pinned here yet. Pin a note from any board.</p>}
            <div className="card-grid">
              {pinned.map(({ project, note }) => (
                <button key={note.id} className="card pinned-card" style={{ background: note.color }}
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
            <form onSubmit={addMember} className="inline-form">
              <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Add member name…" />
              <button className="btn primary" type="submit"><Plus size={16} /> Add</button>
            </form>
            <ul className="member-list">
              {team.members.map((m) => (
                <li key={m}>
                  {m}
                  <button
                    className="icon-btn"
                    title="Remove member"
                    onClick={() => onUpdate((t) => ({ ...t, members: t.members.filter((x) => x !== m) }))}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            {team.members.length === 0 && <p className="hint">No members yet — add names so notes can be pinned to people.</p>}
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
