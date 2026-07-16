// supabase.js — phase-2 backend client.
//
// Config comes from Vite env vars, so no secrets live in the repo. Until
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, `supabase` is null and
// the app keeps running entirely on the localStorage store (store.js). Wiring
// the data layer to this is the next step after the schema is applied.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const isBackendConfigured = () => Boolean(supabase);
