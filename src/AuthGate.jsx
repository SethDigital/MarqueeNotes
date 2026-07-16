import React, { useEffect, useState } from "react";
import { Pin, LogOut } from "lucide-react";
import { usingBackend } from "./db/index.js";
import { supabase } from "./supabase.js";

// Gates the app behind Supabase auth WHEN a backend is configured. With no
// backend (the localStorage demo) it renders children straight through, and
// identity stays the lightweight "working as" name — no login.
//
// Renders children as children(currentUser), where currentUser is the signed-in
// profile ({ id, name }) under Supabase, or null in demo mode.
export default function AuthGate({ children }) {
  if (!usingBackend) return children(null);
  return <SupabaseGate>{children}</SupabaseGate>;
}

function SupabaseGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="screen"><p className="page hint">Loading…</p></div>;
  if (!session) return <SignIn />;

  const user = {
    id: session.user.id,
    name: session.user.user_metadata?.display_name || session.user.email?.split("@")[0] || "You",
  };
  return (
    <>
      <div className="auth-bar">
        Signed in as <strong>{user.name}</strong>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
      {children(user)}
    </>
  );
}

function SignIn() {
  const [mode, setMode] = useState("in"); // "in" | "up"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fn =
      mode === "in"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: name || email.split("@")[0] } },
          });
    const { error } = await fn;
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <div className="screen">
      <header className="topbar"><h1><Pin size={22} className="logo-pin" /> MarqueeNotes</h1></header>
      <main className="page" style={{ maxWidth: 380 }}>
        <h2>{mode === "in" ? "Sign in" : "Create your account"}</h2>
        <form onSubmit={submit} className="form">
          {mode === "up" && (
            <label>Display name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Avery" />
            </label>
          )}
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 12 }}>
          {mode === "in" ? "No account yet? " : "Already have one? "}
          <button className="link-btn" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Create one" : "Sign in"}
          </button>
        </p>
      </main>
    </div>
  );
}
