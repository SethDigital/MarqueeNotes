# The Board — web version (Google Drive backend)

A shared pin board of to-do notes, deployable as a static web app. Each person
signs in with Google; data lives in Google Drive:

- **My board** — a private file (`pinboard-personal.json`) in your own Drive.
- **Team board** — one shared file (`pinboard-team.json`) everyone reads/writes,
  including the completed-tasks spindle.

There's no server: the browser talks to the Drive REST API directly with the
signed-in user's token. Drive has no realtime push, so the app polls the files
every few seconds (same approach as the original). Simultaneous edits are
**last-write-wins** at the file level, with per-note merging to limit clobbering
— fine for a small team, not a high-concurrency editor.

## Requirements
- Node 18+
- A Google account (and Google accounts for teammates)

## 1. Google Cloud setup (one time)
1. Go to <https://console.cloud.google.com/> and create a project.
2. **APIs & Services → Library →** enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen:** choose **External**, fill the
   basics, and under **Test users** add your email and each teammate's. While
   the app is unverified, only listed test users can sign in — which is exactly
   what you want for a private team board.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.** Under **Authorized JavaScript origins** add:
   - `http://localhost:5173` (local dev)
   - your deployed URL later (e.g. `https://yourapp.vercel.app`)
   Copy the **Client ID**.

> Scope note: this app uses the broad `drive` scope so a teammate can open a
> team file *someone else* created. Google flags `drive` as "sensitive," so an
> unverified app is limited to your Test users (fine for a team). To distribute
> publicly you'd either submit for Google verification, or switch to the
> least-privilege `drive.file` scope plus the Google Picker — ask and I can add
> that variant.

## 2. Run locally
```bash
npm install
cp .env.example .env        # then paste your Client ID into VITE_GOOGLE_CLIENT_ID
npm run dev                 # open http://localhost:5173
```
On first run: click **Connect Google Drive**, then **Create a new team board**.
Open that file in Drive and share it with teammates (or set link-sharing to
"anyone with the link can edit"). Teammates click **Connect**, then **Join**,
and paste the share link.

To pin everyone to the same team file automatically, copy its id from the share
link (`https://drive.google.com/file/d/<THIS_PART>/view`) into
`VITE_TEAM_FILE_ID` in `.env`.

## 3. Deploy (static hosting)
```bash
npm run build               # outputs to dist/
```
Deploy `dist/` to any static host — Vercel, Netlify, Cloudflare Pages, or GitHub
Pages (all have free tiers; check current terms). Then:
1. Add your production URL to **Authorized JavaScript origins** in the Google
   credentials screen.
2. Set the env var `VITE_GOOGLE_CLIENT_ID` (and optionally `VITE_TEAM_FILE_ID`)
   in your host's project settings, and rebuild/redeploy.

Vercel/Netlify can build straight from a Git repo: push this folder, set the
build command to `npm run build`, output dir `dist`, and add the env vars.

## Notes & limits
- **No realtime:** changes show up within the poll interval (~2.5s).
- **Last-write-wins:** two people editing within the same poll window can have
  one change overwritten.
- **Tokens expire (~1h):** if it stops syncing, reload to reconnect. "Disconnect"
  lives in the name dialog (the name button, top-right).
- Your name for "completed by" defaults to your Google account name; you can
  override it via the name button.

## Files
- `src/drive.js` — Google sign-in + Drive read/write (the only Google-specific code).
- `src/App.jsx` — the board UI plus the sign-in/setup wrapper.
- `src/main.jsx`, `index.html`, `vite.config.js` — standard Vite React setup.
