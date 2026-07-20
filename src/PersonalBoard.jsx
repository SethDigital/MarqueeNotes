import React, { useState } from "react";
import { ArrowLeft, Bookmark, Users } from "lucide-react";
import {
  selectMyBoard, allMemberNames, THEMES,
  getGlobalMe, setGlobalMe, getSectionTheme, setSectionTheme,
  getSectionHeight, setSectionHeight, SECTION_MIN_HEIGHT,
} from "./store.js";
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

  // Per-section themes and heights, seeded from storage; changing either
  // re-renders just here and persists per team.
  const [themes, setThemes] = useState({});
  const [heights, setHeights] = useState({});
  const themeFor = (teamId) => themes[teamId] || getSectionTheme(teamId);
  const heightFor = (teamId) => heights[teamId] ?? getSectionHeight(teamId);
  const changeTheme = (teamId, t) => {
    setSectionTheme(teamId, t);
    setThemes((m) => ({ ...m, [teamId]: t }));
  };

  // Drag the bar under a section to give that mini-board more (or less) room.
  const startResize = (teamId) => (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = heightFor(teamId);
    const apply = (clientY) => Math.max(SECTION_MIN_HEIGHT, startH + (clientY - startY));
    const move = (ev) => setHeights((m) => ({ ...m, [teamId]: apply(ev.clientY) }));
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const h = apply(ev.clientY);
      setSectionHeight(teamId, h);
      setHeights((m) => ({ ...m, [teamId]: h }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pickMe = (name) => { setGlobalMe(name); setDemoMe(name); };

  const sections = selectMyBoard(data, me);

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> Back</button>
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

      <main className="page myboard-page">
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
              <div className="myboard-surface" style={{ height: heightFor(team.id) }}>
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
              <div
                className="myboard-resize"
                title="Drag to resize this section"
                onPointerDown={startResize(team.id)}
              />
            </section>
          ))
        )}
      </main>
    </div>
  );
}
