#!/usr/bin/env bash
# ChatScream EC2 bootstrap: installs FFmpeg + Nginx RTMP/HLS.

set -euo pipefail

exec > >(tee -a /var/log/chatscream-user-data.log) 2>&1

echo "Starting ChatScream bootstrap at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  ffmpeg \
  jq \
  nginx \
  libnginx-mod-rtmp

mkdir -p /var/www/hls /var/www/rtmp /opt/chatscream
chown -R www-data:www-data /var/www

cat > /etc/nginx/nginx.conf <<'NGINX_CONFIG'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
  worker_connections 2048;
  multi_accept on;
}

rtmp {
  server {
    listen 1935;
    chunk_size 4096;

    application live {
      live on;
      record off;
      hls on;
      hls_path /var/www/hls;
      hls_fragment 2;
      hls_playlist_length 30;
      allow publish all;
      allow play all;
    }
  }
}

http {
  sendfile on;
  tcp_nopush on;
  keepalive_timeout 65;
  types_hash_max_size 2048;
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  gzip on;
  gzip_types text/plain text/css application/json application/javascript application/vnd.apple.mpegurl video/mp2t;

  server {
    listen 80 default_server;
    server_name _;

    location /health {
      add_header Content-Type text/plain;
      return 200 'ok';
    }

    location /hls {
      types {
        application/vnd.apple.mpegurl m3u8;
        video/mp2t ts;
      }
      root /var/www;
      add_header Cache-Control no-cache;
      add_header Access-Control-Allow-Origin *;
      add_header Access-Control-Allow-Methods 'GET, OPTIONS';
      add_header Access-Control-Allow-Headers '*';
      if ($request_method = OPTIONS) {
        return 204;
      }
    }

    location / {
      root /var/www/rtmp;
      try_files $uri /index.html;
    }
  }
}
NGINX_CONFIG

cat > /var/www/rtmp/index.html <<'INDEX_HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ChatScream Stream Worker</title>
    <style>
      body { font-family: sans-serif; background: #0b1220; color: #dbeafe; display: grid; place-items: center; height: 100vh; margin: 0; }
      .card { padding: 20px 24px; border: 1px solid #1e3a8a; border-radius: 12px; background: #0f172a; }
      code { color: #93c5fd; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>ChatScream Worker Online</h1>
      <p>Publish RTMP to <code>rtmp://&lt;this-ip&gt;:1935/live/&lt;stream-key&gt;</code></p>
      <p>Playback HLS at <code>http://&lt;this-ip&gt;/hls/&lt;stream-key&gt;.m3u8</code></p>
    </div>
  </body>
</html>
INDEX_HTML

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "ChatScream bootstrap completed at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
