# =============================================================================
# ChatScream Dockerfile
#
# Two build targets:
#   --target backend   Cloud Run / any container host (Node + FFmpeg only, no frontend)
#   --target fullstack Single-server deploy (Node + FFmpeg + built frontend)
#
# Set RELAY_ONLY=true to run the resilient FFmpeg/WebSocket relay only.
# Default target: fullstack (keeps existing single-server behavior)
# =============================================================================

# ── Stage 1: Frontend build (Vite) ──────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_API_BASE_URL=""
ARG VITE_APP_ENV="production"
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}
RUN npm run build

# ── Stage 2: Base runtime (Node + FFmpeg) ───────────────────────────────────
FROM node:20-alpine AS base-runtime
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm install --omit=dev
COPY server ./server
RUN mkdir -p uploads
EXPOSE 8787

FROM base-runtime AS backend
CMD ["node", "server/entrypoint.js"]

FROM base-runtime AS fullstack
COPY --from=frontend-builder /app/dist ./dist
CMD ["node", "server/entrypoint.js"]
