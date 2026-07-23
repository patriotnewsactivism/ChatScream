<center><h1>Chat<span style="color: #38bdf8">Scream</span></h1></center>

<p><strong>Stream Without Limits. Scream for Attention.</strong></p>

<p>
  <a href="#-features">Features</a> â¢
  <a href="#-tech-stack">Tech Stack</a> â¢
  <a href="#-quick-start">Quick Start</a> â¢
  <a href="#-deployment">Deployment</a>
</p>

<img src="https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge" />
<img src="https://img.shields.io/badge/Stack-Vite_React_Node%20API-blue?style=for-the-badge" />
<img src="https://img.shields.io/badge/Deployment-AWS_EC2_ASG-orange?style=for-the-badge" />
</div>

---

## ð The Mission

**ChatScream** is a browser-based multi-streaming studio designed to disrupt the live-streaming market. Unlike traditional tools (OBS, Streamlabs) that rely on the user's upload speed, ChatScream offloads encoding to the cloud.

- **Zero Bandwidth:** We handle the heavy lifting. You upload once; we stream everywhere (YouTube, Twitch, Facebook) at constant high-bitrate CBR.
- **Chat Screamer:** The USP. Donation-triggered overlays that **DEMAND** attention. The more they donate, the more obnoxious it gets.
- **Any Device:** Go live from a phone, tablet, or potato laptop. If it has a browser, it's a studio.

## â¡ Features

### ð©ï¸ Cloud Power Engine

- **Zero-Latency Preview:** See exactly what your viewers see.
- **Constant Bitrate (CBR):** Our servers output 4K/60fps regardless of your local connection quality.
- **Global Edge Network:** Ingests video from the server closest to you.

### ð¢ The Chat Screamer

Monetize your stream with aggression.

- **Standard Scream ($5):** Visual alert + TTS reading.
- **Loud Scream ($10-20):** Larger overlay, louder SFX, distinct animation.
- **MAXIMUM SCREAM ($50+):** Full screen takeover. Chaotic visuals. Intentionally obnoxious.

### ð Gamification

- **Weekly Leaderboards:** Tracks "Scream Quantity" rather than just dollar amounts to encourage engagement.
- **Automatic Rewards:** Top streamers win free Professional Tier upgrades.

---

## ð  Tech Stack

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

## ð Quick Start

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

## ð¦ Deployment

### 1. Build Frontend + API

```bash
npm run build
```

### 2. Deploy Stream Workers (AWS Autoscaling)

```bash
export AWS_REGION=us-east-1
export VPC_ID=vpc-xxxxxxx
export SUBNET_IDS=subnet-aaaaaaa,subnet-bbbbbbb
export INSTANCE_PROFILE_NAME=ChatScreamStreamWorkerProfile

./infrastructure/aws/deploy-stream-fleet.sh
```

### 3. Deploy App/API Container

Deploy `server/index.js` and `dist/` with your preferred AWS runtime (ECS/Fargate, EC2, or another container platform).

For auth/session storage, this app defaults to managed identity mode (`IDENTITY_STORAGE_MODE=managed`).
Configure:

- `POSTGRES_URL` (+ `POSTGRES_SSL=true` in production)
- `REDIS_URL` (+ `REDIS_TLS=true` in production)

Users/profiles are stored in Postgres and session tokens in Redis.

If you already have local users in `server/data/runtime.json`, migrate them once:

```bash
POSTGRES_URL=postgres://... npm run migrate:users
```

### 4. Vercel Single-Project Deploy (Frontend + API)

This repo now supports Vercel SPA routes plus backend API routes in one project:

- Frontend routes (`/login`, `/signup`, `/dashboard`) are rewritten to `index.html`.
- Backend routes are rewritten to `api/all.js`, which mounts the Express API in `server/app.js`.

For this mode, keep `VITE_API_BASE_URL` empty so the frontend calls same-origin `/api/*`.

---

## ð New Accessibility Features

### ð Customizable Font Sizes

- Users can adjust the font size to improve readability.

### ð High Contrast Mode

- A toggle for high contrast mode to enhance visibility for users with visual impairments.

### ð¤ Screen Reader Support

- All interactive elements are accessible via keyboard navigation.
- ARIA attributes are added to key elements to support screen readers.

---

## ð User Documentation

For detailed instructions on how to use these new accessibility features, please refer to the updated user documentation.