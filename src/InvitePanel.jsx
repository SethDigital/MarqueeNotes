import React, { useEffect, useState } from "react";
import { Plus, Copy, Check, X, Ticket } from "lucide-react";
import { db } from "./db/index.js";
import { formatInviteCode, formatTimeLeft } from "./store.js";

// Admin-only panel on the Members tab: mint a shareable invite code, drop it in
// the team chat, and let anyone join with it until it expires (3 hours). The
// list shows each live code with its countdown and how many have joined; expired
// ones fall off on their own.
export default function InvitePanel({ teamId }) {
  const [invites, setInvites] = useState(null); // null while loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null); // id of the code just copied
  const [now, setNow] = useState(Date.now()); // ticks so countdowns stay live

  const refresh = () =>
    db.listInvites(teamId)
      .then(setInvites)
      .catch((e) => { setError(e.message); setInvites([]); });

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [teamId]);

  // Re-render every 30s so "expires in …" counts down and codes drop off as
  // they lapse — no need to re-hit the backend for that.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      await db.createInvite(teamId);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    setError("");
    try {
      await db.revokeInvite(id);
      setInvites((list) => list.filter((i) => i.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const copy = async (code, id) => {
    try {
      await navigator.clipboard.writeText(formatInviteCode(code));
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      setError("Couldn't copy — select the code and copy it manually.");
    }
  };

  // Backends filter expired codes, but keep the client honest as they lapse
  // between refreshes.
  const live = (invites || []).filter(
    (i) => new Date(i.expiresAt || i.expires_at).getTime() > now
  );

  return (
    <section className="invite-panel">
      <div className="invite-head">
        <div>
          <h3><Ticket size={16} /> Invite codes</h3>
          <p className="hint">
            One code, share it in chat — anyone can join the team with it for the next 3 hours.
          </p>
        </div>
        <button className="btn primary" onClick={generate} disabled={busy}>
          <Plus size={16} /> {busy ? "Generating…" : "New invite code"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {invites === null ? (
        <p className="hint">Loading codes…</p>
      ) : live.length === 0 ? (
        <p className="hint">No active codes. Generate one to invite your teammates.</p>
      ) : (
        <ul className="invite-list">
          {live.map((inv) => {
            const expiresAt = inv.expiresAt || inv.expires_at;
            const uses = inv.uses || 0;
            return (
              <li key={inv.id}>
                <div className="invite-main">
                  <code className="invite-code">{formatInviteCode(inv.code)}</code>
                  <button className="icon-btn" title="Copy code" onClick={() => copy(inv.code, inv.id)}>
                    {copied === inv.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <button className="icon-btn" title="Revoke code" onClick={() => revoke(inv.id)}>
                    <X size={14} />
                  </button>
                </div>
                <div className="invite-meta">
                  Expires in {formatTimeLeft(expiresAt)}
                  <span className="dot">·</span>
                  {uses === 0 ? "not used yet" : `${uses} joined`}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
