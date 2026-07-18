import React from "react";
import { X } from "lucide-react";

// A centered modal with a backdrop. Click the backdrop or the × to close;
// clicks inside don't bubble out. Shared by the team/join dialogs and the
// completed-notes viewer.
export default function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
