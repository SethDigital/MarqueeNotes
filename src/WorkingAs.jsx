import React from "react";

// Small "working as" picker shown in the top bar. Whoever is chosen gets
// stamped (by member id) on checklist steps the user checks off, so teammates
// can see who handled what — like initialing your work on a shared whiteboard.
export default function WorkingAs({ team, me, onChange }) {
  if (team.members.length === 0) return null;
  return (
    <label className="working-as" title="Steps you check off will carry this name">
      You&rsquo;re
      <select value={me} onChange={(e) => onChange(e.target.value)}>
        <option value="">just visiting</option>
        {team.members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </label>
  );
}
