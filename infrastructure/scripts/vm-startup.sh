#!/bin/bash
# =============================================================================
# ChatScream - VM Startup Script
# Copyright 2025. Based out of Houston TX.
# This script runs automatically when the VM starts
# =============================================================================

set -e

LOG_FILE="/var/log/chatscream-startup.log"
exec > >(tee -a $LOG_FILE) 2>&1

echo "========================================="
echo "ChatScream VM Startup Script"
echo "Started at: $(date)"
echo "========================================="

# Update system
echo "[1/8] Updating system packages..."
apt-get update -y
apt-get upgrade -y

# Install essential packages
echo "[2/8] Installing essential packages..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    nginx \
    certbot \
    python3-certbot-nginx \
    ffmpeg \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Install Node.js 20.x
echo "[3/8] Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Install PM2 for process management
echo "[4/8] Installing PM2..."
npm install -g pm2

# Install Nginx RTMP module
echo "[5/8] Installing Nginx RTMP module..."
apt-get install -y libnginx-mod-rtmp

# Configure Nginx for RTMP and HTTP
echo "[6/8] Configuring Nginx..."
cat > /etc/nginx/nginx.conf << 'NGINX_CONFIG'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 1024;
    multi_accept on;
}

# RTMP Configuration for live streaming
rtmp {
    server {
        listen 1935;
        chunk_size 4096;

        application live {
            live on;
            record off;

            # Enable HLS
            hls on;
            hls_path /var/www/hls;
            hls_fragment 3;
            hls_playlist_length 60;

            # Allow publishing from anywhere (restrict in production)
            allow publish all;
            allow play all;

            # Push to multiple platforms
            # Example: push rtmp://live.twitch.tv/app/<stream_key>;
            # Example: push rtmp://a.rtmp.youtube.com/live2/<stream_key>;
        }

        application test {
            live on;
            record off;
        }
    }
}

http {
    sendfile on;
    tcp_nopush on;
    types_hash_max_size 2048;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    gzip on;
    gzip_types text/plain application/json application/javascript text/css application/xml text/javascript application/vnd.apple.mpegurl video/mp2t;

    server {
        listen 80;
        server_name _;

        # Health check endpoint
        location /health {
            return 200 'OK';
            add_header Content-Type text/plain;
        }

        # RTMP statistics
        location /stat {
            rtmp_stat all;
            rtmp_stat_stylesheet stat.xsl;
        }

        location /stat.xsl {
            root /var/www/rtmp;
        }

        # HLS streaming
        location /hls {
            types {
                application/vnd.apple.mpegurl m3u8;
                video/mp2t ts;
            }
            root /var/www;
            add_header Cache-Control no-cache;
            add_header Access-Control-Allow-Origin *;
        }

        # API proxy (Node/Express backend)
        location /api {
            proxy_pass http://localhost:8787;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # Static files
        location / {
            root /var/www/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }
}
NGINX_CONFIG

# Create required directories
echo "[7/8] Creating directories..."
mkdir -p /var/www/hls
mkdir -p /var/www/html
mkdir -p /var/www/rtmp
mkdir -p /opt/chatscream

# Set permissions
chown -R www-data:www-data /var/www
chmod -R 755 /var/www

# Create RTMP stat stylesheet
cat > /var/www/rtmp/stat.xsl << 'STAT_XSL'
<?xml version="1.0" encoding="utf-8" ?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" />
<xsl:template match="/">
<html>
<head>
    <title>ChatScream - RTMP Statistics</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a2e; color: #eee; }
        h1, h2 { color: #00ff88; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #333; padding: 10px; text-align: left; }
        th { background: #16213e; color: #00ff88; }
        tr:nth-child(even) { background: #0f3460; }
        .online { color: #00ff88; }
        .offline { color: #ff4444; }
    </style>
</head>
<body>
    <h1>ChatScream RTMP Server Statistics</h1>
    <h2>Server Info</h2>
    <table>
        <tr><th>Nginx Version</th><td><xsl:value-of select="rtmp/nginx_version"/></td></tr>
        <tr><th>RTMP Version</th><td><xsl:value-of select="rtmp/nginx_rtmp_version"/></td></tr>
        <tr><th>Uptime</th><td><xsl:value-of select="rtmp/uptime"/> seconds</td></tr>
        <tr><th>Accepted Connections</th><td><xsl:value-of select="rtmp/naccepted"/></td></tr>
    </table>
    <h2>Live Streams</h2>
    <table>
        <tr><th>Stream Name</th><th>Clients</th><th>Video</th><th>Audio</th><th>Bandwidth In</th><th>Bandwidth Out</th></tr>
        <xsl:for-each select="rtmp/server/application/live/stream">
        <tr>
            <td><xsl:value-of select="name"/></td>
            <td><xsl:value-of select="nclients"/></td>
            <td><xsl:value-of select="meta/video/codec"/> <xsl:value-of select="meta/video/width"/>x<xsl:value-of select="meta/video/height"/></td>
            <td><xsl:value-of select="meta/audio/codec"/> <xsl:value-of select="meta/audio/sample_rate"/>Hz</td>
            <td><xsl:value-of select="bw_in"/> kbps</td>
            <td><xsl:value-of select="bw_out"/> kbps</td>
        </tr>
        </xsl:for-each>
    </table>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
STAT_XSL

# Create a simple health page
cat > /var/www/html/index.html << 'INDEX_HTML'
<!DOCTYPE html>
<html>
<head>
    <title>ChatScream Media Server</title>
    <style>
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .container { text-align: center; padding: 40px; }
        h1 { color: #00ff88; font-size: 3em; margin-bottom: 10px; }
        p { color: #aaa; font-size: 1.2em; }
        .status { background: #16213e; padding: 20px; border-radius: 10px; margin-top: 20px; }
        .online { color: #00ff88; }
    </style>
</head>
<body>
    <div class="container">
        <h1>ChatScream</h1>
        <p>Cloud-Powered Multi-Streaming Studio</p>
        <div class="status">
            <p>Server Status: <span class="online">ONLINE</span></p>
            <p>RTMP Endpoint: rtmp://[server-ip]:1935/live</p>
            <p><a href="/stat" style="color: #00ff88;">View Stream Statistics</a></p>
        </div>
    </div>
</body>
</html>
INDEX_HTML

# Test and restart Nginx
echo "[8/8] Starting Nginx..."
nginx -t
systemctl restart nginx
systemctl enable nginx

# Install Google Cloud Ops Agent for monitoring
echo "Installing Cloud Ops Agent..."
curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
bash add-google-cloud-ops-agent-repo.sh --also-install

echo ""
echo "========================================="
echo "ChatScream VM Setup Complete!"
echo "Finished at: $(date)"
echo "========================================="
echo ""
echo "Services running:"
echo "  - Nginx (HTTP on port 80)"
echo "  - RTMP Server (port 1935)"
echo "  - HLS streaming (/hls endpoint)"
echo ""
echo "Test RTMP streaming with:"
echo "  ffmpeg -re -i input.mp4 -c:v libx264 -c:a aac -f flv rtmp://localhost:1935/live/test"
echo ""
echo "View stream at:"
echo "  http://[server-ip]/hls/test.m3u8"
echo ""
