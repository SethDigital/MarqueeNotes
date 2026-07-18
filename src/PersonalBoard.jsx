import React, { useState } from "react";
import { ArrowLeft, Bookmark, Users } from "lucide-react";
import {
  selectMyBoard, allMemberNames, THEMES,
  getGlobalMe, setGlobalMe, getSectionTheme, setSectionTheme,
} from "./store.js";
import { usingBackend } from "./db/index.js";
import StickyNote from "./StickyNote.jsx";

// My Board — a single, cross-team personal surface holding every note you've
// yoinked, grouped into one themeable mini-board section per team. Editing a
// note here writes straight through to the original team-board note (a yoink is
// a link, not a copy), via the patchNote handler passed from Workspace.
export default function PersonalBoard({ data, fixedMe, patchNote, onBack }) {
  // Under the real backend identity is the signed-in user; in the demo it's a
  // cross-team name the person picks here (the per-team "working as" name can't
  // span teams).
  const [demoMe, setDemoMe] = useState(() => getGlobalMe());
  const me = fixedMe || demoMe;

  // Per-section themes, seeded from storage; changing one re-renders just here.
  const [themes, setThemes] = useState({});
  const themeFor = (teamId) => themes[teamId] || getSectionTheme(teamId);
  const changeTheme = (teamId, t) => {
    setSectionTheme(teamId, t);
    setThemes((m) => ({ ...m, [teamId]: t }));
  };

  const pickMe = (name) => { setGlobalMe(name); setDemoMe(name); };

  const sections = selectMyBoard(data, me);

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> Teams</button>
        <h1><Bookmark size={20} className="logo-pin" /> My Board</h1>
        {!fixedMe && (
          <label className="working-as" title="My Board gathers everything you've yoinked">
            You&rsquo;re
            <select value={me} onChange={(e) => pickMe(e.target.value)}>
              <option value="">pick your name</option>
              {allMemberNames(data).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        )}
      </header>

      <main className="page">
        {!me ? (
          <p className="hint">
            Pick your name up top and every note you&rsquo;ve yoinked gathers here, grouped by team.
          </p>
        ) : sections.length === 0 ? (
          <div className="empty">
            <p>
              Nothing yoinked yet. On any team board, tap the <Bookmark size={14} /> on a note to
              Yoink it here — then edit it from My Board and the changes land on the team&rsquo;s note.
            </p>
          </div>
        ) : (
          sections.map(({ team, entries }) => (
            <section key={team.id} className="myboard-section" data-theme={themeFor(team.id)}>
              <header className="myboard-section-head">
                <h2><Users size={16} /> {team.name}</h2>
                <span className="count">{entries.length}</span>
                <label className="section-theme" title="Theme this section">
                  <select value={themeFor(team.id)} onChange={(e) => changeTheme(team.id, e.target.value)}>
                    {Object.entries(THEMES).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </header>
              <div className="myboard-surface">
                <div className="myboard-grid">
                  {entries.map(({ note, project }) => (
                    <StickyNote
                      key={note.id}
                      note={note}
                      members={team.members}
                      me={me}
                      variant="static"
                      onChange={(fn) => patchNote(team.id, project.id, note.id, fn)}
                    />
                  ))}
                </div>
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
