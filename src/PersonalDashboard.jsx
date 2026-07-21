import React from "react";
import { Bookmark, Loader, CheckCircle2, Send } from "lucide-react";
import { selectDashboard, representativeSolid } from "./store.js";
import Deadline from "./Deadline.jsx";

// A personal to-do view derived from the team's notes, so nothing a person is
// on quietly falls through the cracks. Scoped to the current "working as"
// name; under real accounts this becomes the signed-in user across all teams.
const COLUMNS = [
  { key: "pinned", title: "Pinned", icon: Bookmark, blurb: "Notes you yoinked here to keep in view" },
  { key: "working", title: "Working On", icon: Loader, blurb: "Steps assigned to you, still open" },
  { key: "completed", title: "Completed", icon: CheckCircle2, blurb: "Your steps, all wrapped up" },
  { key: "distributed", title: "Distributed", icon: Send, blurb: "Steps you handed to teammates" },
];

export default function PersonalDashboard({ team, me, onOpenProject }) {
  if (!me) {
    return (
      <p className="hint">
        Pick who you are with the <strong>You&rsquo;re</strong> menu up top, and your
        pinned, in-progress, finished, and handed-off tasks gather here.
      </p>
    );
  }

  const cols = selectDashboard(team, me);
  return (
    <>
      <p className="hint">Everything <strong>{me}</strong> is on across {team.name}, in one glance.</p>
      <div className="dashboard-grid">
        {COLUMNS.map(({ key, title, icon: Icon, blurb }) => (
          <section key={key} className="dash-col">
            <header className="dash-col-head">
              <Icon size={15} /> <h3>{title}</h3>
              <span className="count">{cols[key].length}</span>
            </header>
            <p className="dash-col-blurb">{blurb}</p>
            {cols[key].map(({ note, project }) => (
              <button
                key={note.id}
                className="dash-card"
                style={{ "--note-color": representativeSolid(note.color, note.gradient) }}
                onClick={() => onOpenProject(project.id)}
              >
                <div className="dash-card-title">{note.title || "Untitled note"}</div>
                <div className="dash-card-meta">
                  <span>{project.name}</span>
                  {note.items.length > 0 && (
                    <span>{note.items.filter((i) => i.done).length}/{note.items.length} done</span>
                  )}
                </div>
                {note.deadlineAt && <Deadline deadlineIso={note.deadlineAt} />}
              </button>
            ))}
            {cols[key].length === 0 && <p className="dash-empty">Nothing here yet.</p>}
          </section>
        ))}
      </div>
    </>
  );
}
