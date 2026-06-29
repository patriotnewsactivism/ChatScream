# =============================================================================
# ChatScream Dockerfile
#
# Two build targets:
#   --target backend   Railway / any VPS (Node + FFmpeg only, no frontend)
#   --target fullstack Single-server deploy (Node + FFmpeg + built frontend)
#
# Default target: fullstack (keeps existing single-server behavior)
# =============================================================================

# ── Stage 1: Frontend build (Vite) ──────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Build the Vite app. Pass VITE_API_BASE_URL at build time:
#   docker build --build-arg VITE_API_BASE_URL=https://api.chatscream.live ...
ARG VITE_API_BASE_URL=""
ARG VITE_APP_ENV="production"
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}
RUN npm run build

# ── Stage 2: Base runtime (Node + FFmpeg) ───────────────────────────────────
FROM node:20-alpine AS base-runtime
WORKDIR /app

# FFmpeg is required for RTMP relay
RUN apk add --no-cache ffmpeg

# Production deps only
COPY package*.json ./
RUN npm install --omit=dev

# Server source
COPY server ./server

# Uploads dir (files are ephemeral without S3; mount a volume in production)
RUN mkdir -p uploads

EXPOSE 8787

# ── Target: backend ─────────────────────────────────────────────────────────
# Use this for Railway + Vercel split deployments.
# The frontend is served by Vercel; this image runs only the API + WebSocket.
FROM base-runtime AS backend
CMD ["node", "server/index.js"]

# ── Target: fullstack ───────────────────────────────────────────────────────
# Use this for single-server deployments (VPS, Fly.io, Render, etc.).
# The Express server serves the built frontend from /dist.
FROM base-runtime AS fullstack
COPY --from=frontend-builder /app/dist ./dist
CMD ["node", "server/index.js"]
