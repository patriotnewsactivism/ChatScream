# Stage 1: Build the Vite frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Final Runtime
FROM node:20-alpine
WORKDIR /app

# Install FFmpeg for RTMP relay
RUN apk add --no-cache ffmpeg

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend assets
COPY --from=frontend-builder /app/dist ./dist

# Copy backend server code
COPY server ./server
COPY types.ts .

# Expose API and WebSocket port
EXPOSE 8787

# Create uploads directory
RUN mkdir -p uploads

# Start the Node.js server
CMD ["npm", "run", "start"]
