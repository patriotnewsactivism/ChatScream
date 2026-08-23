# ChatScream URL-to-Live Worker

This is the scale-to-zero cloud playback backend for ChatScream Cloud Broadcast.
It is separate from the browser/WebSocket relay.

## What it does

- Accepts authenticated `POST /v1/jobs` requests from ChatScream.
- Launches one ephemeral EC2 instance for each active prerecorded/URL broadcast.
- Pulls an authorized HTTP(S), Google Drive, or Dropbox media source.
- Revalidates DNS on the worker and blocks private/reserved network targets.
- Encodes once with FFmpeg at constant bitrate and uses the tee muxer to fan out to up to 10 RTMP/RTMPS destinations.
- Enforces the hard duration limit supplied by the ChatScream control plane.
- Updates durable DynamoDB job status.
- Deletes the sensitive job payload after completion.
- Shuts the instance down; the launch template is configured to terminate on shutdown.

There are **no inbound security-group rules** on URL workers. They only make outbound connections.

## API contract

The orchestrator matches `server/commercial/cloudWorker.js`:

- `GET /health`
- `POST /v1/jobs`
- `GET /v1/jobs/:jobId`
- `POST /v1/jobs/:jobId/stop`

All requests require `Authorization: Bearer <CLOUD_WORKER_API_TOKEN>`.
Only the SHA-256 digest of the token is stored in the Lambda environment.

## Deployment

Requirements:

- AWS CLI authenticated to the intended AWS account
- AWS SAM CLI
- a VPC
- at least two public subnets with routes to an internet gateway

Generate a strong token and deploy:

```bash
export AWS_REGION=us-east-1
export VPC_ID=vpc-xxxxxxxx
export SUBNET_IDS=subnet-aaaa,subnet-bbbb
export CLOUD_WORKER_API_TOKEN="$(openssl rand -base64 48 | tr -d '\n')"
./infrastructure/aws/url-worker/deploy.sh
```

The deployment prints `CLOUD_WORKER_API_URL`. After a successful health test, put these two values in the ChatScream production server environment:

```text
CLOUD_WORKER_API_URL=https://...
CLOUD_WORKER_API_TOKEN=<same token used during deploy>
```

Do not enable those production variables until the health test and one controlled end-to-end stream have succeeded.

## Cost behavior

The worker fleet has no minimum EC2 capacity. Lambda and DynamoDB remain on low-cost request-based billing, and EC2 is created only for active Cloud Broadcast jobs. Each worker terminates after the media ends, the configured duration is reached, the job is stopped, or the worker encounters a fatal error.

`c7g.large` is the default because it provides strong ARM CPU price/performance for software H.264 encoding. Benchmark with representative 1080p inputs before increasing destination or bitrate limits.

## Security notes

- IMDSv2 is required.
- Worker instances have encrypted gp3 root volumes.
- Worker security groups have zero inbound rules.
- Media and destination hosts must resolve only to public IP space.
- URL embedded credentials are rejected.
- Stream keys are held only in the DynamoDB job payload during an active job and the payload attribute is removed at completion.
- The creator-facing ChatScream usage ledger never stores stream keys or signed source URL query parameters.
- The worker role can only read/update its job table and read EC2 tags.

## Supported sources

- direct HTTP(S) media URLs
- public Google Drive file links normalized by ChatScream
- public Dropbox shared links normalized by ChatScream

Arbitrary YouTube page downloading is intentionally unsupported. Creators should use media they own or are authorized to rebroadcast.
