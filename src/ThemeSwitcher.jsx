import React, { useState } from "react";
import { THEMES, getTheme, setTheme } from "./store.js";

// Board theme picker shown in every top bar. The choice is saved per browser
// and applied as a data-theme attribute that styles.css keys off.
export default function ThemeSwitcher() {
  const [theme, setState] = useState(getTheme);
  const change = (t) => {
    setTheme(t);
    setState(t);
  };
  return (
    <select
      className="theme-switch"
      title="Board theme"
      value={theme}
      onChange={(e) => change(e.target.value)}
    >
      {Object.entries(THEMES).map(([key, label]) => (
        <option key={key} value={key}>{label}</option>
      ))}
    </select>
  );
}
