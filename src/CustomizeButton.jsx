import React, { useState } from "react";
import { Palette } from "lucide-react";
import CustomizePanel from "./CustomizePanel.jsx";

// A small button for the top bar that opens the interface-customize modal.
// Kept separate from ThemeSwitcher so each stays a focused control, and so the
// open/modal state lives next to the trigger that owns it.
export default function CustomizeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn ghost customize-btn"
        title="Customize interface colors"
        onClick={() => setOpen(true)}
      >
        <Palette size={15} /> Customize
      </button>
      {open && <CustomizePanel onClose={() => setOpen(false)} />}
    </>
  );
}
