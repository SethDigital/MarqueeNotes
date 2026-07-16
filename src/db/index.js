// index.js — pick the backend once, at startup. Everything in the app imports
// `db` from here and never touches localStorage or Supabase directly, so the
// two implementations are fully interchangeable.
import { isBackendConfigured } from "../supabase.js";
import { localBackend } from "./local.js";
import { supabaseBackend } from "./supabase.js";

export const usingBackend = isBackendConfigured();
export const db = usingBackend ? supabaseBackend : localBackend;
