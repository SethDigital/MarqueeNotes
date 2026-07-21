import React, { useState } from "react";
import { Trash2, Save } from "lucide-react";
import Modal from "./Modal.jsx";
import {
  UI_OVERRIDE_KEYS, UI_GRADIENT_KEYS,
  getUiOverrides, saveUiOverrides,
  getUiPresets, saveUiPreset, deleteUiPreset,
  normalizeHexColor, normalizeGradient, gradientCss,
} from "./store.js";

// Human labels for the curated override keys, shown in the panel. Background
// and Panel are the two that may wear a 3-stop gradient; the rest stay solid
// so borders/glow (color-mix) and text legibility aren't broken.
const LABELS = {
  accent: "Accent",
  controls: "Buttons",
  text: "Text",
  background: "Background",
  panel: "Panels",
};

// Read the current override for a key as a working draft: a { kind, color|... }
// shape the row controls can edit. kind is "solid" | "gradient" | "none".
function overrideToDraft(override, allowGradient, fallbackColor) {
  if (!override) return { kind: "none", color: fallbackColor, gradient: { stops: [fallbackColor, fallbackColor, fallbackColor], angle: 135 } };
  if (allowGradient && override.gradient) {
    return { kind: "gradient", gradient: override.gradient, color: fallbackColor };
  }
  return { kind: "solid", color: override.color || fallbackColor, gradient: { stops: [override.color || fallbackColor, override.color || fallbackColor, override.color || fallbackColor], angle: 135 } };
}

// Convert a working draft back into the stored override shape (or null to clear).
function draftToOverride(draft, allowGradient) {
  if (draft.kind === "none") return null;
  if (allowGradient && draft.kind === "gradient") {
    const g = normalizeGradient(draft.gradient);
    return g ? { gradient: g } : null;
  }
  const c = normalizeHexColor(draft.color);
  return c ? { color: c } : null;
}

function ColorRow({ label, draft, allowGradient, onChange, onClear }) {
  const setKind = (kind) => onChange({ ...draft, kind });
  const setColor = (hex) => {
    const c = normalizeHexColor(hex) || draft.color;
    onChange({ ...draft, kind: draft.kind === "none" ? "solid" : draft.kind, color: c });
  };
  const setStop = (i, hex) => {
    const c = normalizeHexColor(hex) || draft.gradient.stops[i];
    const stops = [...draft.gradient.stops];
    stops[i] = c;
    onChange({ ...draft, kind: "gradient", gradient: { ...draft.gradient, stops } });
  };
  const setAngle = (deg) => {
    const angle = parseInt(deg, 10);
    onChange({ ...draft, kind: "gradient", gradient: { ...draft.gradient, angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : draft.gradient.angle } });
  };

  // The little preview swatch shows exactly what this override produces.
  const preview =
    draft.kind === "gradient" ? gradientCss(draft.gradient) :
    draft.kind === "solid" ? draft.color : "transparent";

  return (
    <div className="customize-row">
      <div className="customize-preview" style={{ background: preview }} title={label} />
      <div className="customize-fields">
        <div className="customize-label">{label}</div>
        <div className="customize-controls">
          <input type="color" className="color-native" value={draft.color} onChange={(e) => setColor(e.target.value)} title={`${label} color`} />
          {allowGradient ? (
            <div className="customize-kind">
              <button className={"customize-tab" + (draft.kind !== "gradient" ? " on" : "")} onClick={() => setKind("solid")}>Solid</button>
              <button className={"customize-tab" + (draft.kind === "gradient" ? " on" : "")} onClick={() => setKind("gradient")}>Gradient</button>
            </div>
          ) : null}
          <button className="customize-clear" title={`Reset ${label} to the theme`} onClick={onClear}>Reset</button>
        </div>
        {allowGradient && draft.kind === "gradient" && (
          <div className="customize-gradient">
            <div className="gradient-stops">
              {draft.gradient.stops.map((stop, i) => (
                <input key={i} type="color" className="color-native" value={stop} title={`Stop ${i + 1}`} onChange={(e) => setStop(i, e.target.value)} />
              ))}
            </div>
            <div className="gradient-angle">
              <label>Angle</label>
              <input type="number" min="0" max="359" value={draft.gradient.angle} onChange={(e) => setAngle(e.target.value)} />
              <span>°</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Customize the interface: a curated set of color overrides (each solid or, for
// background/panel, a 3-stop gradient) plus named presets you can save and load.
// Changes apply live on top of the active board theme and persist per-browser.
export default function CustomizePanel({ onClose }) {
  // Seed drafts from current overrides; "none" rows fall back to a neutral grey.
  const buildDrafts = (overrides) => {
    const drafts = {};
    for (const key of Object.keys(UI_OVERRIDE_KEYS)) {
      drafts[key] = overrideToDraft(overrides[key], UI_GRADIENT_KEYS.includes(key), "#999999");
    }
    return drafts;
  };
  // Lazy-initialize so buildDrafts is called exactly once with the real
  // overrides. Passing buildDrafts bare to useState made React treat it as a
  // lazy initializer and call it with no arg — overrides[key] then threw and,
  // with no error boundary, blanked the whole app.
  const [drafts, setDrafts] = useState(() => buildDrafts(getUiOverrides()));
  const [presets, setPresets] = useState(getUiPresets);
  const [presetName, setPresetName] = useState("");

  // Commit a single row's draft to the overrides and re-apply them live.
  const commit = (key, draft) => {
    const allowGradient = UI_GRADIENT_KEYS.includes(key);
    const override = draftToOverride(draft, allowGradient);
    const next = { ...getUiOverrides() };
    if (override) next[key] = override;
    else delete next[key];
    saveUiOverrides(next);
  };

  const updateDraft = (key, draft) => {
    setDrafts((d) => ({ ...d, [key]: draft }));
    commit(key, draft);
  };

  const clearRow = (key) => {
    setDrafts((d) => ({ ...d, [key]: overrideToDraft(null, UI_GRADIENT_KEYS.includes(key), "#999999") }));
    const next = { ...getUiOverrides() };
    delete next[key];
    saveUiOverrides(next);
  };

  const clearAll = () => {
    saveUiOverrides({});
    setDrafts(buildDrafts({}));
  };

  const onSavePreset = () => {
    if (!presetName.trim()) return;
    const list = saveUiPreset(presetName, getUiOverrides());
    setPresets(list);
    setPresetName("");
  };

  const onLoadPreset = (id) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    saveUiOverrides(preset.overrides);
    setDrafts(buildDrafts(preset.overrides));
  };

  const onDeletePreset = (id) => {
    setPresets(deleteUiPreset(id));
  };

  return (
    <Modal title="Customize interface" onClose={onClose} wide>
      <p className="customize-hint">
        Pick colors for the interface and buttons. Changes layer on top of the current board theme
        ({Object.keys(UI_OVERRIDE_KEYS).length} overrides) and are saved per browser. Background and
        Panels can also be a 3-stop gradient.
      </p>
      <div className="customize-rows">
        {Object.keys(UI_OVERRIDE_KEYS).map((key) => (
          <ColorRow
            key={key}
            label={LABELS[key]}
            draft={drafts[key]}
            allowGradient={UI_GRADIENT_KEYS.includes(key)}
            onChange={(draft) => updateDraft(key, draft)}
            onClear={() => clearRow(key)}
          />
        ))}
      </div>
      <div className="customize-actions">
        <button className="btn ghost" onClick={clearAll}>Reset all to theme</button>
      </div>

      <div className="customize-presets">
        <h4>Presets</h4>
        <div className="customize-save">
          <input
            className="customize-name"
            value={presetName}
            placeholder="Preset name…"
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSavePreset(); }}
          />
          <button className="btn primary" onClick={onSavePreset} disabled={!presetName.trim()}>
            <Save size={14} /> Save
          </button>
        </div>
        {presets.length === 0 && <p className="customize-empty">No saved presets yet.</p>}
        <ul className="customize-preset-list">
          {presets.map((p) => (
            <li key={p.id}>
              <span className="customize-preset-name">{p.name}</span>
              <button className="btn ghost" onClick={() => onLoadPreset(p.id)}>Load</button>
              <button className="icon-btn" title="Delete preset" onClick={() => onDeletePreset(p.id)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
