# ChatScream URL-to-Live Worker — Cloud Run Jobs

Cloud playback backend for ChatScream Cloud Broadcast, on Google Cloud. This is
the non-AWS path; `infrastructure/aws/url-worker/` is the original EC2 + Lambda
implementation and the two are not meant to run at once.

## Why this exists

The AWS stack needs an orchestrator Lambda, an API Gateway, a DynamoDB table, a
launch template and a VPC before a single frame is encoded. On GCP none of that
is needed: **a Cloud Run Job execution is the per-job sandbox**, the Admin API
starts one with per-execution environment overrides, and the container exiting
ends both the job and the billing.

What that removes:

| AWS | Cloud Run Jobs |
| --- | --- |
| EC2 instance per job | one job execution per job |
| Orchestrator Lambda + API Gateway | none — the backend calls the Admin API |
| DynamoDB job table | none — the worker posts status to the ChatScream API |
| IMDS identity + `ChatScreamJobId` instance tag | job id arrives as an env override |
| `shutdown -h now` and terminate-on-shutdown | the process exiting ends the execution |

The encoding pipeline and the network guards are ported unchanged.

## What it does

- Pulls an authorized HTTP(S), Google Drive or Dropbox media source.
- Re-resolves DNS immediately before the fetch and blocks private, loopback,
  link-local and reserved targets — including the GCE metadata server.
- Encodes once with FFmpeg at constant bitrate and uses the `tee` muxer to fan
  out to up to 10 RTMP/RTMPS destinations.
- Enforces the duration limit supplied by the ChatScream control plane.
- Reports `running` / `completed` / `failed` / `stopped` / `timed_out` back to
  the control plane over an authenticated callback.

The worker holds **no GCP permissions** and no database credentials. It makes
outbound connections only.

## Deploy

Requirements: `gcloud` authenticated to the project, with Cloud Build, Cloud Run
and Artifact Registry APIs enabled.

```bash
PROJECT_ID=chat-scream REGION=us-central1 ./deploy.sh
```

The script is idempotent — it creates the Artifact Registry repo and the runtime
service account if they are missing, builds the image, and creates or updates
the job. It never starts an execution; the backend does that per broadcast.

Then set on the ChatScream backend service:

```
GCP_PROJECT_ID=chat-scream
CLOUD_RUN_JOB_REGION=us-central1
CLOUD_RUN_JOB_NAME=chatscream-url-worker
CLOUD_WORKER_CALLBACK_URL=https://api.chatscream.live
```

The backend service account needs permission to run the job and read its
executions (`roles/run.invoker` on the job, plus `run.executions.get` /
`run.executions.cancel`). Auth uses Application Default Credentials, so on Cloud
Run the attached service account is used and no key material is stored.

## Contract

`server/commercial/cloudRunWorker.js` is the client:

- `startJob({ jobId, payload, callbackToken })` → runs the job with overrides
- `getJob(executionId)` → maps Cloud Run counters to a status
- `stopJob(executionId)` → cancels the execution
- `health()` → whether the job exists and is reachable

The worker reads four environment variables, all supplied per execution:
`CHATSCREAM_JOB_ID`, `CHATSCREAM_JOB_PAYLOAD`, `CHATSCREAM_CALLBACK_URL`,
`CHATSCREAM_CALLBACK_TOKEN`.

## Before changing worker.py

```bash
python3 selftest.py
```

25 checks over the URL and `tee` injection boundaries. Read the note at the top
of that file about what it does and does not prove.

## Sizing

2 vCPU / 2Gi carries one 1080p `libx264 veryfast` encode. `--max-retries 0` is
deliberate: a live broadcast that died is over, and silently restarting it would
push a second stream at the destinations minutes after the fact.

## Wired up

The control plane now chooses Cloud Run Jobs as the worker provider and
accepts the status callback (branch `cloud-broadcast-cloud-run`):

- `server/commercial/cloudProvider.js` — provider abstraction. Cloud Run
  Jobs is primary; the AWS external orchestrator remains the fallback while
  `CLOUD_WORKER_API_URL`/`CLOUD_WORKER_API_TOKEN` are configured. Generates
  a per-job callback token and persists only its SHA-256 hash.
- `POST /api/cloud-v2/sessions/start` → creates a job execution with the
  payload above and a per-job callback token (`server/commercial/router.js`).
- `POST /api/cloud-v2/jobs/:jobId/status` → verifies the per-job callback
  token, updates session state, ends sessions on terminal status
  (`server/commercial/cloudJobCallback.js`, intercepted in
  `server/entrypoint.js` before the requireAuth gate).
- Periodic reconciliation against the Cloud Run executions API covers a
  missed callback (`server/commercial/router.js`).

## Not done yet

- Deploy the job with `deploy.sh` in this directory, set the backend env
  vars (`GCP_PROJECT_ID`, `CLOUD_RUN_JOB_REGION`, `CLOUD_RUN_JOB_NAME`,
  `CLOUD_WORKER_CALLBACK_URL`), and grant the backend service account
  `run.invoker` plus executions `get`/`cancel` on the job.
- A live end-to-end test: start a cloud broadcast, confirm the worker
  reaches `running`, and confirm the session ends and billing closes on
  `completed`.
