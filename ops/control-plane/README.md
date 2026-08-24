# ChatScream Cloud Ops Control Plane

This directory is the sanitized command/result bridge used for chat-driven Google Cloud administration.

## Architecture

- Chat/operator writes an allowlisted request to `request.json` on `main`.
- `.github/workflows/cloud-ops-controller.yml` authenticates to Google with short-lived GitHub OIDC.
- Google identity: `chatscream-cloud-ops@chat-scream.iam.gserviceaccount.com`.
- Production target: project `chatscream`, Cloud Run service `chatscream-backend`, region `us-central1`.
- The workflow writes a sanitized response to `result.json` for retrieval.
- No long-lived Google service-account key is used.
- Secret values are never written to this public repository or to `result.json`.

## Allowlisted actions

- `status` — service/revision and public health endpoint status.
- `health_check` — production health/readiness/capabilities checks.
- `oauth_verify` — verifies the dedicated Google and YouTube public client IDs and Secret Manager bindings without reading secret values.
- `secret_audit` — checks approved secret bindings and enabled version counts only.
- `cost_guard` — checks Cloud Run service-level and revision-level minimum-instance settings and resource limits.
- `enforce_scale_to_zero` — clears both service-level and revision-level minimum-instance settings and verifies production health.
- `restart_backend` — creates a new Cloud Run revision with a harmless ops restart nonce.
- `set_traffic_latest` — routes production traffic to the latest ready revision.
- `deploy_backend` — builds the Docker `backend` target, pushes it to Artifact Registry, deploys it, and performs a health check.

## Security rules

1. Production OIDC runs only from the `main` branch workflow.
2. Pull-request workflows must not receive `id-token: write`.
3. Never add raw logs, tokens, client secrets, database passwords, or decrypted Secret Manager values to `result.json`.
4. OAuth client secrets live in Google Secret Manager:
   - `chatscream-google-client-secret`
   - `chatscream-youtube-client-secret`
5. Public client IDs may be inspected; secret values may not.
6. Arbitrary shell/gcloud execution is deliberately not supported. Add a reviewed allowlisted action instead.

## Current cost posture

The production backend is configured with both service-level and revision-level minimum instances set to `0`, allowing Cloud Run to scale to zero when idle. Maximum scale remains `20` unless deliberately changed.
