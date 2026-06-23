// drive.js — Google sign-in + Drive REST data layer.
// Replaces the artifact's window.storage. Two "scopes":
//   personal -> a private JSON file in the signed-in user's own Drive
//   public   -> one shared JSON file the whole team reads/writes
//
// No server required: the browser calls the Drive REST API directly with the
// user's OAuth access token. Drive has no realtime push, so the app polls.

// Config can come from runtime (window.__ENV, injected by the Docker image at
// container start) or from Vite's build-time .env for local dev.
const RT = (typeof window !== "undefined" && window.__ENV) || {};
const CLIENT_ID = RT.VITE_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Full drive scope so a teammate can open a team file someone else created,
// by id/link. It's a "sensitive" scope (see README). Switch to drive.file +
// Google Picker if you need least-privilege / public distribution.
const OAUTH_SCOPE = "https://www.googleapis.com/auth/drive openid email profile";
const PERSONAL_NAME = "pinboard-personal.json";
const TEAM_NAME = "pinboard-team.json";
const EMPTY = JSON.stringify({ notes: [], completed: [] });

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let profile = null;
let personalFileId = null;
let teamFileId =
  import.meta.env.VITE_TEAM_FILE_ID ||
  (typeof localStorage !== "undefined" && localStorage.getItem("pinboard-team-id")) ||
  null;

/* ------------------------------ GIS loader ------------------------------ */
function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load Google Identity Services"));
    document.head.appendChild(s);
  });
}

/* ------------------------------ auth ------------------------------------ */
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(resp);
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000 - 60000;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt });
  });
}

async function ensureToken(interactive) {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  // try silent first, fall back to a prompt if allowed
  try {
    return await requestToken("");
  } catch (e) {
    if (interactive) return await requestToken("consent");
    throw e;
  }
}

export const drive = {
  get profile() {
    return profile;
  },
  get teamFileId() {
    return teamFileId;
  },
  isConfigured() {
    return !!CLIENT_ID;
  },
  hasTeamFile() {
    return !!teamFileId;
  },

  async init() {
    if (!CLIENT_ID) throw new Error("Missing VITE_GOOGLE_CLIENT_ID");
    await loadGis();
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: OAUTH_SCOPE,
      callback: () => {},
    });
  },

  async signIn() {
    await ensureToken(true);
    profile = await fetchJson(
      "https://www.googleapis.com/oauth2/v3/userinfo"
    );
    return profile;
  },

  signOut() {
    if (accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiry = 0;
    profile = null;
  },

  // Resolve (and create if needed) the personal file; validate the team file.
  async ensureFiles() {
    personalFileId = await findFile(PERSONAL_NAME);
    if (!personalFileId) personalFileId = await createFile(PERSONAL_NAME, EMPTY);
    if (teamFileId) await meta(teamFileId); // throws if not accessible
  },

  // Create the shared team file in the current user's Drive and remember it.
  async createTeamFile() {
    teamFileId = await createFile(TEAM_NAME, EMPTY);
    if (typeof localStorage !== "undefined")
      localStorage.setItem("pinboard-team-id", teamFileId);
    return teamFileId;
  },

  // Join an existing team board by file id or share link.
  async useTeamFile(idOrLink) {
    const id = parseFileId(idOrLink);
    await meta(id); // verify access; throws otherwise
    teamFileId = id;
    if (typeof localStorage !== "undefined")
      localStorage.setItem("pinboard-team-id", id);
    return id;
  },

  fileIdFor(scope) {
    return scope === "public" ? teamFileId : personalFileId;
  },

  // --- the small surface App uses, shaped like the old window.storage ---
  storage: {
    async get(key, shared) {
      if (key === "pinboard-me-v1") {
        const v =
          typeof localStorage !== "undefined" && localStorage.getItem("pinboard-name");
        return v ? { value: JSON.stringify({ name: v }) } : null;
      }
      const id = drive.fileIdFor(shared ? "public" : "personal");
      if (!id) return null;
      const value = await downloadText(id);
      return { value };
    },
    async set(key, value, shared) {
      if (key === "pinboard-me-v1") {
        try {
          if (typeof localStorage !== "undefined")
            localStorage.setItem("pinboard-name", JSON.parse(value).name || "");
        } catch {}
        return;
      }
      const id = drive.fileIdFor(shared ? "public" : "personal");
      if (!id) throw new Error("No file for scope");
      await uploadText(id, value);
    },
  },
};

/* --------------------------- Drive REST calls --------------------------- */
async function authedFetch(url, opts = {}, retried = false) {
  const token = await ensureToken(false).catch(() => null);
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    accessToken = null;
    return authedFetch(url, opts, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function fetchJson(url, opts) {
  const res = await authedFetch(url, opts);
  return res.json();
}

async function meta(fileId) {
  return fetchJson(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime`
  );
}

async function findFile(name) {
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const data = await fetchJson(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`
  );
  return data.files && data.files[0] ? data.files[0].id : null;
}

async function createFile(name, content) {
  const boundary = "pinboard" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, mimeType: "application/json" }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;
  const data = await fetchJson(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  return data.id;
}

async function downloadText(fileId) {
  const res = await authedFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  );
  return res.text();
}

async function uploadText(fileId, text) {
  await authedFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: text,
    }
  );
}

// Accept a raw id or a Drive share link like .../d/<ID>/view or ?id=<ID>
function parseFileId(s) {
  const t = (s || "").trim();
  const m = t.match(/[-\w]{25,}/);
  return m ? m[0] : t;
}
