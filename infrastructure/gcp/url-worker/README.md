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

The backend's service account needs permission to run the job and read its
executions (`roles/run.invoker` on the job, plus `run.executions.get` /
`run.executions.cancel`). Auth uses Application Default Credentials, so on Cloud
Run the attached service account is used and no key material is stored.

## Contract

`server/commercial/cloudRunWorker.js` is the client:

- `startJob({ jobId, payload, callbackToken })` → runs the job with overrides
- `getJob(executionId)` → maps Cloud Run's counters to a status
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

## Not done yet

The control plane still needs wiring to choose this backend over the AWS one and
to accept the status callback at
`POST /api/cloud-v2/jobs/:jobId/status`. Until that lands, cloud broadcasting
stays off and the landing page continues to describe it as in development.
