import React, { useState } from "react";
import { Palette } from "lucide-react";
import CustomizePanel from "./CustomizePanel.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

// A small button for the top bar that opens the interface-customize modal.
// Kept separate from ThemeSwitcher so each stays a focused control, and so the
// open/modal state lives next to the trigger that owns it.
//
// The panel is wrapped in an ErrorBoundary so that a render bug inside it can
// never blank the whole app again — the fallback renders a dismissable notice
// over the backdrop, so the user always has a way out of the page.
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
      {open && (
        <ErrorBoundary
          renderFallback={() => (
            <div className="modal-backdrop" onClick={() => setOpen(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <h3>Customize interface</h3>
                  <button className="icon-btn" onClick={() => setOpen(false)}>✕</button>
                </div>
                <p className="error">
                  The customize panel hit an error and can&rsquo;t be shown right now.
                  Your saved colors are unchanged.
                </p>
                <div className="form-actions">
                  <button className="btn primary" onClick={() => setOpen(false)}>Close</button>
                </div>
              </div>
            </div>
          )}
        >
          <CustomizePanel onClose={() => setOpen(false)} />
        </ErrorBoundary>
      )}
    </>
  );
}
