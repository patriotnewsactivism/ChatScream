<div align="center">
  <img width="100%" alt="ChatScream Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  
  <h1>Chat<span style="color: #38bdf8">Scream</span></h1>
  
  <p><strong>Stream Without Limits. Scream for Attention.</strong></p>
  
  <p>
    <a href="#-features">Features</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-deployment">Deployment</a>
  </p>

  <img src="https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Stack-Vite_React_Firebase-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Deployment-Cloud_Run-purple?style=for-the-badge" />
</div>

---

## 🚀 The Mission

**ChatScream** is a browser-based multi-streaming studio designed to disrupt the live-streaming market. Unlike traditional tools (OBS, Streamlabs) that rely on the user's upload speed, ChatScream offloads encoding to the cloud.

* **Zero Bandwidth:** We handle the heavy lifting. You upload once; we stream everywhere (YouTube, Twitch, Facebook) at constant high-bitrate CBR.
* **Chat Screamer:** The USP. Donation-triggered overlays that **DEMAND** attention. The more they donate, the more obnoxious it gets.
* **Any Device:** Go live from a phone, tablet, or potato laptop. If it has a browser, it's a studio.

## ⚡ Features

### 🌩️ Cloud Power Engine
* **Zero-Latency Preview:** See exactly what your viewers see.
* **Constant Bitrate (CBR):** Our servers output 4K/60fps regardless of your local connection quality.
* **Global Edge Network:** Ingests video from the server closest to you.

### 📢 The Chat Screamer
Monetize your stream with aggression.
* **Standard Scream ($5):** Visual alert + TTS reading.
* **Loud Scream ($10-20):** Larger overlay, louder SFX, distinct animation.
* **MAXIMUM SCREAM ($50+):** Full screen takeover. Chaotic visuals. Intentionally obnoxious.

### 🏆 Gamification
* **Weekly Leaderboards:** Tracks "Scream Quantity" rather than just dollar amounts to encourage engagement.
* **Automatic Rewards:** Top streamers win free Professional Tier upgrades.

---

## 🛠 Tech Stack

**Frontend**
* **Framework:** React 18 + Vite (TypeScript)
* **Styling:** Tailwind CSS + Lucide React
* **State:** React Context API
* **PWA:** Fully installable Manifest & Service Workers

**Backend & Infrastructure**
* **Core:** Firebase (Auth, Firestore, Hosting, Functions)
* **Streaming:** FFMPEG on Google Cloud Compute Engine (VMs) / Cloud Run
* **Payments:** Stripe Connect (Custom Accounts)
* **AI:** Anthropic Claude API (Stream copy generation)

---

## 🔌 Quick Start

### Prerequisites
* Node.js 20+
* Firebase CLI (`npm install -g firebase-tools`)
* Docker (optional, for local container testing)

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
    * *Required:* `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`
    * *Optional (for full features):* Stripe keys, Claude API key.

4.  **Run Local Development**
    ```bash
    npm run dev
    ```
    Access the studio at `http://localhost:5173`.

---

## 📦 Deployment

### 1. Hosting (Frontend Only)
Recommended for quick UI updates while Functions secrets are missing.
```bash
firebase deploy --only hosting:production --project wtp-apps
