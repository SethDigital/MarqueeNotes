import React, { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import Modal from "./Modal.jsx";
import { STICKER_TYPES } from "./store.js";

// Two tabs over the same tile grid:
//   "This board" — the board's reusable image library (upload + place). What
//                  lived here before this change, unchanged.
//   "My stash"   — your personal, cross-board saved stickers. Populated by the
//                  save button on a placed sticker. Click to drop a copy here.
export default function StickersModal({ stickers, stash = [], onUpload, onPlace, onDelete, onPlaceFromStash, onRemoveFromStash, onClose }) {
  const fileRef = useRef(null);
  const [tab, setTab] = useState("board");

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onUpload(file);
  };

  const removeSticker = (id) => {
    if (window.confirm("Remove this sticker? It comes off the board everywhere it's been placed.")) {
      onDelete(id);
    }
  };

  const removeStash = (id) => {
    if (window.confirm("Remove this sticker from your stash? It stays on any boards it's already on.")) {
      onRemoveFromStash(id);
    }
  };

  return (
    <Modal title="Stickers" onClose={onClose} wide>
      <div className="tabs">
        <button className={tab === "board" ? "tab active" : "tab"} onClick={() => setTab("board")}>
          This board
        </button>
        <button className={tab === "stash" ? "tab active" : "tab"} onClick={() => setTab("stash")}>
          My stash{stash.length > 0 && <span className="stack-count">{stash.length}</span>}
        </button>
      </div>

      {tab === "board" && (
        <>
          <p className="hint">
            Upload an image once, then click it any time to drop another copy on the board — no re-uploading.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={STICKER_TYPES}
            style={{ display: "none" }}
            onChange={handleFile}
          />
          <div className="sticker-grid">
            <button className="sticker-tile sticker-add" onClick={() => fileRef.current?.click()} title="Upload a new sticker">
              <ImagePlus size={22} />
              <span>Upload</span>
            </button>
            {stickers.map((s) => (
              <div key={s.id} className="sticker-tile">
                <button className="sticker-thumb" onClick={() => onPlace(s.id)} title="Add to board">
                  <img src={s.src} alt="" draggable={false} />
                </button>
                <button className="sticker-remove" title="Remove from library" onClick={() => removeSticker(s.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          {stickers.length === 0 && (
            <p className="hint">No stickers yet — upload an image to start this board&rsquo;s library.</p>
          )}
        </>
      )}

      {tab === "stash" && (
        <>
          <p className="hint">
            Your saved stickers — use them on any board. Save more with the bookmark on a placed sticker.
          </p>
          <div className="sticker-grid">
            {stash.map((s) => (
              <div key={s.id} className="sticker-tile">
                <button className="sticker-thumb" onClick={() => onPlaceFromStash(s.src)} title="Add to board">
                  <img src={s.src} alt="" draggable={false} />
                </button>
                <button className="sticker-remove" title="Remove from stash" onClick={() => removeStash(s.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          {stash.length === 0 && (
            <p className="hint">
              Nothing saved yet. Hover a sticker on any board and tap the bookmark to keep it here.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
