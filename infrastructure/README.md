# ChatScream Infrastructure

**Copyright 2025. Based out of Houston TX.**

This directory contains all infrastructure setup scripts and configurations for deploying ChatScream to Google Cloud Platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Google Cloud Platform                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │
│   │  Firebase       │    │  Compute Engine │    │  Cloud Storage  │   │
│   │  Hosting        │    │  (Media VM)     │    │  (Assets)       │   │
│   │                 │    │                 │    │                 │   │
│   │  - React SPA    │    │  - RTMP Server  │    │  - Media Files  │   │
│   │  - Static Files │    │  - HLS Output   │    │  - Overlays     │   │
│   └────────┬────────┘    │  - Nginx        │    │  - Recordings   │   │
│            │             └────────┬────────┘    └─────────────────┘   │
│            │                      │                                    │
│            ▼                      │                                    │
│   ┌─────────────────┐            │                                    │
│   │  Cloud          │            │                                    │
│   │  Functions      │◄───────────┘                                    │
│   │                 │                                                  │
│   │  - Stripe API   │                                                  │
│   │  - Webhooks     │                                                  │
│   │  - Leaderboard  │                                                  │
│   └────────┬────────┘                                                  │
│            │                                                           │
│            ▼                                                           │
│   ┌─────────────────┐    ┌─────────────────┐                          │
│   │  Firestore      │    │  Firebase Auth  │                          │
│   │  (Database)     │    │  (Users)        │                          │
│   │                 │    │                 │                          │
│   │  - Users        │    │  - Email/Pass   │                          │
│   │  - Affiliates   │    │  - Google OAuth │                          │
│   │  - Screams      │    │                 │                          │
│   │  - Leaderboard  │    │                 │                          │
│   └─────────────────┘    └─────────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. **Google Cloud SDK**: [Install Guide](https://cloud.google.com/sdk/docs/install)
2. **Node.js 18+**: [Download](https://nodejs.org/)
3. **Firebase CLI**: `npm install -g firebase-tools`
4. **A Google Cloud billing account** (for paid services)

### Setup Steps

```bash
# 1. Clone and navigate to infrastructure
cd StreamMobPro/infrastructure

# 2. Set your project ID
export GCLOUD_PROJECT_ID="your-project-id"
export GCLOUD_BILLING_ACCOUNT="your-billing-account-id"

# 3. Run the Google Cloud setup
chmod +x *.sh
./setup-gcloud-project.sh

# 4. Create the media VM
./create-vm.sh

# 5. Setup Firebase
./setup-firebase.sh

# 6. Initialize the database
cd scripts
npm install
node init-firestore.js
cd ..

# 7. Deploy everything
./deploy.sh all
```

## Scripts Reference

### `setup-gcloud-project.sh`

Creates and configures the Google Cloud project:
- Creates the project (if needed)
- Links billing account
- Enables required APIs (Compute, Firebase, Firestore, etc.)
- Creates service account with proper roles
- Sets up VPC network and firewall rules
- Creates Cloud Storage bucket for media

**Environment Variables:**
- `GCLOUD_PROJECT_ID` - Project ID (default: chatscream-prod)
- `GCLOUD_BILLING_ACCOUNT` - Billing account ID
- `GCLOUD_REGION` - Region (default: us-central1)
- `GCLOUD_ZONE` - Zone (default: us-central1-a)

### `create-vm.sh`

Creates a Compute Engine VM for media processing:
- Ubuntu 22.04 LTS
- 4 vCPU, 16GB RAM (e2-standard-4)
- 100GB SSD boot disk
- Pre-configured with Nginx RTMP server

**Environment Variables:**
- `VM_NAME` - Instance name (default: chatscream-media-server)
- `MACHINE_TYPE` - GCE machine type (default: e2-standard-4)
- `DISK_SIZE` - Boot disk size in GB (default: 100)

### `setup-firebase.sh`

Configures Firebase project:
- Creates/selects Firebase project
- Enables Firestore in native mode
- Deploys security rules and indexes
- Configures hosting
- Shows Firebase web SDK config

### `deploy.sh`

Deploys the application:

```bash
./deploy.sh all       # Full deployment (frontend + functions + rules)
./deploy.sh functions # Deploy only Cloud Functions
./deploy.sh hosting   # Deploy only frontend
./deploy.sh rules     # Deploy only Firestore rules
```

## Database Collections

### Core Collections

| Collection | Description |
|------------|-------------|
| `users` | User profiles with subscription info |
| `affiliates` | Affiliate codes and stats |
| `partners` | Partner accounts (e.g., Mythical Meta) |
| `referrals` | Referral tracking |
| `affiliate_commissions` | Commission records |

### Streaming Collections

| Collection | Description |
|------------|-------------|
| `screams` | Chat Screamer donation records |
| `scream_alerts` | Real-time alerts for streamers |
| `scream_leaderboard` | Weekly leaderboard data |
| `stream_sessions` | Stream analytics |
| `notifications` | User notifications |

### Configuration

| Collection | Description |
|------------|-------------|
| `config/scream_tiers` | Donation tier thresholds |
| `config/leaderboard` | Leaderboard settings |
| `config/subscription_plans` | Plan features & pricing |

## Firewall Rules

| Rule Name | Ports | Description |
|-----------|-------|-------------|
| `chatscream-allow-http` | 80, 443 | Web traffic |
| `chatscream-allow-rtmp` | 1935, 1936 | RTMP streaming |
| `chatscream-allow-ssh` | 22 | SSH access |
| `chatscream-allow-webrtc` | 10000-60000/UDP | WebRTC |

## Testing

### Local Development with Emulators

```bash
# Start Firebase emulators
firebase emulators:start

# In another terminal, initialize test data
cd infrastructure/scripts
FIRESTORE_EMULATOR_HOST=localhost:8080 node init-firestore.js

# Run the development server
cd ../..
npm run dev
```

### Testing RTMP Streaming

```bash
# Get VM IP
gcloud compute instances describe chatscream-media-server \
  --zone=us-central1-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# Test stream with ffmpeg
ffmpeg -re -i test-video.mp4 \
  -c:v libx264 -c:a aac \
  -f flv rtmp://VM_IP:1935/live/teststream

# View stream
# HLS: http://VM_IP/hls/teststream.m3u8
# Stats: http://VM_IP/stat
```

## Monitoring

### View Logs

```bash
# VM startup logs
gcloud compute ssh chatscream-media-server --zone=us-central1-a \
  -- sudo journalctl -u google-startup-scripts -f

# Cloud Functions logs
firebase functions:log

# Nginx logs on VM
gcloud compute ssh chatscream-media-server --zone=us-central1-a \
  -- sudo tail -f /var/log/nginx/access.log
```

### Cloud Console Links

- [Firebase Console](https://console.firebase.google.com/)
- [GCP Console](https://console.cloud.google.com/)
- [Compute Engine](https://console.cloud.google.com/compute/instances)
- [Cloud Functions](https://console.cloud.google.com/functions)
- [Firestore](https://console.cloud.google.com/firestore)

## Costs Estimate

| Service | ~Monthly Cost |
|---------|---------------|
| Compute Engine (e2-standard-4) | $100-120 |
| Firebase Hosting | Free tier / $0-10 |
| Cloud Functions | Pay per invocation |
| Firestore | Pay per read/write |
| Cloud Storage | $0.02/GB |
| **Total (estimated)** | **$100-150** |

*Costs vary based on usage. Use GCP Pricing Calculator for detailed estimates.*

## Troubleshooting

### VM Not Starting

```bash
# Check startup script output
gcloud compute instances get-serial-port-output chatscream-media-server \
  --zone=us-central1-a
```

### RTMP Connection Refused

1. Check firewall rules are applied
2. Verify VM has `chatscream-vm` network tag
3. Check Nginx is running: `sudo systemctl status nginx`

### Firebase Deployment Fails

1. Ensure you're logged in: `firebase login`
2. Check project selection: `firebase use`
3. Verify billing is enabled for the project

## Support

For issues with this infrastructure setup, please open an issue on the repository.

---
*ChatScream - Cloud-Powered Multi-Streaming Studio*
