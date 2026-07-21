import React, { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import Modal from "./Modal.jsx";
import { STICKER_TYPES } from "./store.js";

// The board's reusable image library. Upload once and it's kept here — click
// any tile to drop another copy on the canvas without re-uploading. Removing
// a sticker from the library takes every placement of it down too.
export default function StickersModal({ stickers, onUpload, onPlace, onDelete, onClose }) {
  const fileRef = useRef(null);

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

  return (
    <Modal title="Stickers" onClose={onClose} wide>
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
    </Modal>
  );
}
