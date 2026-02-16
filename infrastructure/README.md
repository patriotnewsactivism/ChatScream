# ChatScream Infrastructure

This directory contains scripts for deploying ChatScream on Google Cloud using app/API + VM infrastructure.

## Architecture

- Cloud Run: hosts the Node API (`server/index.js`) and serves built frontend assets (`dist/`).
- Compute Engine VM: hosts RTMP/HLS media services (Nginx RTMP + FFmpeg).
- Secret Manager: stores production secrets (Stripe, OAuth, AI keys).
- Cloud Storage: optional media bucket (`<project-id>-media`).

## Prerequisites

- Google Cloud SDK (`gcloud`)
- Node.js 20+
- A Google Cloud project with billing enabled

## Quick Start

1. Configure the project and base infrastructure:
   `./infrastructure/setup-gcloud-project.sh`
2. Create or rotate secrets:
   `./infrastructure/setup-secrets.sh <project-id>`
3. Create the media VM:
   `./infrastructure/create-vm.sh`
4. Deploy app/API to Cloud Run:
   `./infrastructure/deploy.sh`

## Key Scripts

- `setup-gcloud-project.sh`
  - Creates/selects project
  - Enables required APIs
  - Sets default region/zone
  - Creates service account and IAM roles
  - Creates VPC + firewall rules
  - Creates media storage bucket

- `setup-secrets.sh` / `setup-secrets.ps1`
  - Writes secrets to Google Secret Manager
  - Adds new versions when a secret already exists

- `create-vm.sh`
  - Provisions media VM
  - Applies `scripts/vm-startup.sh` startup config
  - Writes VM metadata to `infrastructure/.vm-info`

- `deploy.sh`
  - Builds frontend (when `all` target)
  - Deploys app/API service to Cloud Run

## Useful Commands

- View Cloud Run URL:
  `gcloud run services describe chatscream-app --region <region> --format='value(status.url)'`
- Stream VM logs:
  `gcloud compute ssh chatscream-media-server --zone <zone> -- sudo journalctl -u google-startup-scripts -f`
- RTMP test:
  `ffmpeg -re -i test.mp4 -c:v libx264 -c:a aac -f flv rtmp://<vm-ip>:1935/live/test`
- HLS playback:
  `http://<vm-ip>/hls/test.m3u8`

## Cost Notes

Costs change by region and traffic profile. Baseline spend usually comes from:

- Cloud Run compute + egress
- One or more Compute Engine media VMs
- Cloud Storage + egress
- Secret Manager requests

Use Google Cloud Pricing Calculator for current estimates.
