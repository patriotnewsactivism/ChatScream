# ChatScream Infrastructure

AWS is the primary deployment path for ChatScream cloud streaming and autoscaled FFmpeg workers.

## Recommended Stack (Low Cost + Scalable)

- API and app container: AWS ECS/Fargate or EC2 + Docker.
- Stream workers: EC2 Auto Scaling Group (`infrastructure/aws/deploy-stream-fleet.sh`).
- Media ingest/egress: Nginx RTMP + FFmpeg on worker nodes.
- Payments/auth data: existing app API + Stripe + local/runtime store.

## AWS Quick Start

1. Configure AWS credentials and region.
2. Create `infrastructure/aws/.env.aws` from `infrastructure/aws/.env.aws.example`.
3. Deploy worker autoscaling fleet:
   `./infrastructure/aws/deploy-stream-fleet.sh`
   or on Windows PowerShell:
   `powershell -ExecutionPolicy Bypass -File .\infrastructure\aws\deploy-stream-fleet.ps1`
4. Follow endpoint output for RTMP ingest + HLS playback.

Full guide:
`infrastructure/aws/README.md`
