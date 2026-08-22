  <center><h1>Chat<span style="color: #38bdf8">Scream</span></h1></center>
  
  <p><strong>Stream Without Limits. Scream for Attention.</strong></p>
  
  <p>
    <a href="#-features">Features</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-deployment">Deployment</a>
  </p>

  <img src="https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Stack-Vite_React_Node%20API-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Deployment-AWS_EC2_ASG-orange?style=for-the-badge" />
</div>

---

## 🚀 The Mission

**ChatScream** is a browser-based multi-streaming studio designed to disrupt the live-streaming market. Unlike traditional tools (OBS, Streamlabs) that rely on the user's upload speed, ChatScream offloads encoding to the cloud.

- **Zero Bandwidth:** We handle the heavy lifting. You upload once; we stream everywhere (YouTube, Twitch, Facebook) at constant high-bitrate CBR.
- **Chat Screamer:** The USP. Donation-triggered overlays that **DEMAND** attention. The more they donate, the more obnoxious it gets.
- **Any Device:** Go live from a phone, tablet, or potato laptop. If it has a browser, it's a studio.

## ⚡ Features

### 🌩️ Cloud Power Engine

- **Zero-Latency Preview:** See exactly what your viewers see.
- **Constant Bitrate (CBR):** Our servers output 4K/60fps regardless of your local connection quality.
- **Global Edge Network:** Ingests video from the server closest to you.

### 📢 The Chat Screamer

Monetize your stream with aggression.

- **Standard Scream ($5):** Visual alert + TTS reading.
- **Loud Scream ($10-20):** Larger overlay, louder SFX, distinct animation.
- **MAXIMUM SCREAM ($50+):** Full screen takeover. Chaotic visuals. Intentionally obnoxious.

### 🏆 Gamification

- **Weekly Leaderboards:** Tracks "Scream Quantity" rather than just dollar amounts to encourage engagement.
- **Automatic Rewards:** Top streamers win free Professional Tier upgrades.

---

## 🛠 Tech Stack

**Frontend**

- **Framework:** React 18 + Vite (TypeScript)
- **Styling:** Tailwind CSS + Lucide React
- **State:** React Context API
- **PWA:** Fully installable Manifest & Service Workers

**Backend & Infrastructure**

- **Core:** Backend API + Postgres + Redis
- **Streaming:** FFmpeg on AWS EC2 Auto Scaling workers (Nginx RTMP/HLS)
- **Payments:** Stripe Connect (Custom Accounts)
- **AI:** Anthropic Claude API (Stream copy generation)

---

## 🔌 Quick Start

### Prerequisites

- Node.js 20+
- FFmpeg (required for server-side RTMP relay)
- Docker (optional, for local container testing)

#### Installing FFmpeg

- **Ubuntu/Debian:** `sudo apt update && sudo apt install ffmpeg`
- **macOS:** `brew install ffmpeg`
- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

### Installation

1.  **Clone the repo**

    ```bash
    git clone [https://github.com/your-org/chatscream.git](https://github.com/your-org/chatscream.git)
    cd chatscream
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Environment Setup**
    Copy the example env file and configure your keys:

    ```bash
    cp .env.example .env
    ```

    - _Required:_ `VITE_API_BASE_URL` (or leave blank for same-origin API)
    - _Required for managed auth (default):_ `POSTGRES_URL` + `REDIS_URL`
    - Optional explicit local-only dev override: `IDENTITY_STORAGE_MODE=local`
    - _Optional (for full features):_ Stripe keys, Claude API key.

4.  **Run Local Development**
    ```bash
    npm run dev
    ```
    Access the studio at `http://localhost:5173`.

---

## 📦 Deployment

### 1. Build Frontend + API

```bash
npm run build
```

### 2. Deploy the App/API Backend — required for streaming to actually work

`server/index.js` is a real, persistent Node process: it holds the WebSocket
connection that receives your broadcast and spawns the `ffmpeg` processes
that push RTMP to YouTube/Facebook/Twitch. It needs a host that can run a
long-lived process. Production uses Google Cloud Run; another WebSocket-capable container host also works.

For AWS specifically, `infrastructure/aws/app-backend/` has a ready-to-run
EC2 deployment (Docker Compose + Caddy for automatic HTTPS):

```bash
cp infrastructure/aws/app-backend/.env.aws.app.example infrastructure/aws/app-backend/.env.aws.app
# edit it, then:
./infrastructure/aws/app-backend/deploy-app-backend.sh
```

Full steps (SSH in, configure `.env`, first-boot DB setup): see
`infrastructure/aws/app-backend/README.md`.

Wherever it runs, for auth/session storage this app defaults to managed
identity mode (`IDENTITY_STORAGE_MODE=managed`). Configure:

- `POSTGRES_URL` (+ `POSTGRES_SSL=true` in production)
- `REDIS_URL` (+ `REDIS_TLS=true` in production)

Users/profiles are stored in Postgres and session tokens in Redis.

If you already have local users in `server/data/runtime.json`, migrate them once:

```bash
POSTGRES_URL=postgres://... npm run migrate:users
```

OAuth (required for the "Connect YouTube/Facebook/Twitch" buttons to do
anything) needs real platform app credentials — see
`ADMIN_OAUTH_SETUP_GUIDE.md`.

### 3. Vercel — frontend, and optionally REST-only API

- **Frontend:** deploy this repo to Vercel as normal. Point
  `VITE_API_BASE_URL` at your app backend's URL from step 2
  (e.g. `https://api.yourdomain.com`).
- **Single-project mode:** `vercel.json` also rewrites `/api/*` to
  `api/all.js`, which mounts the same Express app (`server/app.js`) as a
  Vercel serverless function. This works for stateless REST calls (login,
  OAuth config, fetching a stream key) if you'd rather not run a separate
  backend for those. **It cannot replace step 2** — Vercel's serverless
  functions can't hold the WebSocket connection or spawn the FFmpeg
  processes that actually push video to a platform, so live streaming still
  needs a real backend host regardless of this mode. Keep `VITE_API_BASE_URL`
  empty only if you're intentionally running everything through this mode
  for the non-streaming parts of the app.

### 4. Stream Worker Fleet (AWS Autoscaling) — optional, not built yet

```bash
export AWS_REGION=us-east-1
export VPC_ID=vpc-xxxxxxx
export SUBNET_IDS=subnet-aaaaaaa,subnet-bbbbbbb
export INSTANCE_PROFILE_NAME=ChatScreamStreamWorkerProfile

./infrastructure/aws/deploy-stream-fleet.sh
```

This provisions infrastructure for the **Cloud Streaming (VM-based)**
feature — always-on, browser-independent encoding sessions. It's on the
roadmap but not wired into the app yet (see `TODO.md` §11). Skip this unless
you're actively building that feature; it does nothing for YouTube/Facebook
streaming, which only needs step 2.
