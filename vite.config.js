import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Content-Security-Policy for the PRODUCTION build (2026-07 audit, finding
// L4). GitHub Pages can't set response headers, so the policy ships as a
// <meta> tag injected at build time — that's also when the Supabase origin is
// known, so connect-src can be pinned to exactly the one backend (plus its
// realtime websocket). With supabase-js keeping the session token in
// localStorage, script-src 'self' is the cheap cap on what any future XSS
// could exfiltrate or load.
//
// Build-only on purpose: the dev server needs the inline React-refresh
// preamble @vitejs/plugin-react injects, which script-src 'self' would block.
//
// Directive notes:
//   img-src 'self' data:  — stickers are data: URLs; an external image URL
//                           smuggled into a sticker row can't fire (backs up
//                           the DB constraint from 0009_security_hardening.sql)
//   style-src 'unsafe-inline' — React style={} attributes need it; all values
//                           feeding them are validated hex colors (store.js)
//   frame-ancestors is omitted — ignored in <meta> CSP; nothing else here
//                           needs a response header to work.
function cspFor(env) {
  let connect = "'self'";
  if (env.VITE_SUPABASE_URL) {
    const origin = new URL(env.VITE_SUPABASE_URL).origin;
    connect += ` ${origin} ${origin.replace(/^http/, "ws")}`;
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    // Relative base so the built app works from a domain root or a subfolder
    // (e.g. GitHub Pages project sites).
    base: "./",
    plugins: [
      react(),
      {
        name: "inject-csp",
        apply: "build",
        transformIndexHtml() {
          return [
            {
              tag: "meta",
              attrs: { "http-equiv": "Content-Security-Policy", content: cspFor(env) },
              injectTo: "head-prepend",
            },
          ];
        },
      },
    ],
  };
});
