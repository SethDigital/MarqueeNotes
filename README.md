# The Board

A shared pin board of to-do notes. Data is stored on your own self-hosted server — no cloud dependency required.

- **My board** — private to you, stored on the server under your login.
- **Team board** — one shared board everyone on the team reads and writes, including the completed-tasks spindle.
- **Decorative images** — upload images to any board as background decoration; they sync with the team.
- **Board customization** — per-user background color, pattern, and dark/light note mode (stored locally in the browser).

---

## Architecture

The front end is a static React/Vite app. The back end is self-hosted via Docker Compose and consists of:

| Service | Purpose |
|---|---|
| **Outline** | Wiki/notes UI — team logins, collections, rich documents |
| **Postgres** | Primary database for all board and note data |
| **Redis** | Session cache and real-time presence |
| **Minio** | Local S3-compatible file storage (images, attachments) |

Users open a browser, log in, and use the board. No sync client or desktop app required.

---

## Self-hosting on Bazzite / Linux

All server files live in the `outline/` folder.

### Prerequisites

- A machine running Bazzite (or any Fedora/Linux distro)
- Docker and Docker Compose installed

**Install Docker on Bazzite:**
```bash
rpm-ostree install docker docker-compose
sudo systemctl enable --now docker
# Reboot once after installing, then continue
```

### 1. Configure environment

```bash
cd outline
cp .env.example .env
```

Open `.env` and fill in:

| Variable | What to set |
|---|---|
| `SECRET_KEY` | Run `openssl rand -hex 32` and paste the output |
| `UTILS_SECRET` | Run `openssl rand -hex 32` again (different value) |
| `URL` | Your server's local IP and port, e.g. `http://192.168.1.50:3000` |
| `POSTGRES_PASSWORD` | Any strong password |
| `MINIO_ROOT_USER` | Any username for the file storage admin (e.g. `minioadmin`) |
| `MINIO_ROOT_PASSWORD` | Any strong password for Minio |
| `AWS_ACCESS_KEY_ID` | Same value as `MINIO_ROOT_USER` |
| `AWS_SECRET_ACCESS_KEY` | Same value as `MINIO_ROOT_PASSWORD` |
| `SMTP_*` | Your email server details for magic-link login (see below) |

> **Note:** `DATABASE_URL` in `.env.example` contains `choose_a_strong_password` — replace that placeholder with the same value you chose for `POSTGRES_PASSWORD`.

### 2. SMTP (login emails)

Outline uses magic-link email login — no plain username/password by default. Users enter their email and receive a login link.

**Gmail setup (simplest):**
1. Go to <https://myaccount.google.com/apppasswords> and generate an App Password.
2. In `.env` set:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=you@gmail.com
   SMTP_PASSWORD=your_16_char_app_password
   SMTP_FROM_EMAIL=you@gmail.com
   SMTP_REPLY_EMAIL=you@gmail.com
   SMTP_SECURE=false
   ```

To restrict who can sign up, uncomment `ALLOWED_DOMAINS` and set it to your domain (e.g. `yourcompany.com`).

### 3. Start the stack

```bash
cd outline
sudo docker compose up -d
```

On first boot, Postgres initializes and Minio creates the storage bucket automatically. This takes about 30–60 seconds.

Open `http://YOUR_SERVER_IP:3000` in any browser on your network.

### 4. First-time setup

1. Navigate to your Outline URL and enter your email to receive a login link.
2. Once logged in, go to **Settings → Members** and invite teammates by email.
3. Create **Collections** for each project workspace — teammates can star collections to follow them and get notified of new notes.

---

## Managing the stack

```bash
# Start
sudo docker compose up -d

# Stop
sudo docker compose down

# View logs
sudo docker compose logs -f outline

# Restart a single service
sudo docker compose restart outline

# Pull latest images and restart
sudo docker compose pull && sudo docker compose up -d
```

Data is stored in Docker volumes (`postgres_data`, `minio_data`) and persists across restarts. To back up, snapshot those volumes or `pg_dump` the Postgres database.

---

## Front-end dev (optional)

The React board UI in the project root is a separate Vite app used for the pin-board view. To run it locally:

```bash
npm install
npm run dev    # http://localhost:5173
```

Build for static deployment:
```bash
npm run build  # outputs to dist/
```

---

## Board features

| Feature | How to use |
|---|---|
| **New note** | Click **New note** (top-right) or type in the sidebar and press Enter |
| **Move notes** | Click and drag any note |
| **Edit note** | Click the pencil icon on a note |
| **Checklist** | Click the chevron on a note to expand its step list |
| **Complete (team)** | Click the check on a team note to spike it to the completed spindle |
| **Save to my board** | Click the download icon on a team note |
| **Share to team** | Click the share icon on a personal note |
| **Pin image** | Click the image icon in the header, pick a file (max 1.5 MB) |
| **Resize image** | Drag the bottom-right corner handle of any pinned image |
| **Board background** | Click the palette icon — choose a color and pattern |
| **Dark mode** | Click the moon/sun icon — notes switch to dark with neon glow |

---

## Notes & limits

- **No realtime push:** changes appear within the poll interval (~2.5 s).
- **Last-write-wins:** two people editing the same note within one poll window may have one change overwritten.
- **Image size:** max 1.5 MB per upload. Images are stored as base64 alongside note data and synced to the team.
- **Dark mode / background:** these are personal preferences saved in your browser's `localStorage` — not synced to other users.
- **Minio console:** accessible at `http://YOUR_SERVER_IP:9001` with your `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` credentials.
