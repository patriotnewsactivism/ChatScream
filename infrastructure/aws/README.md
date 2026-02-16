# ChatScream AWS Streaming Infrastructure

This stack deploys FFmpeg-ready streaming workers on AWS with autoscaling.

## What This Provides

- EC2 Auto Scaling Group for on-demand stream workers.
- Nginx RTMP + HLS + FFmpeg pre-installed via EC2 user data.
- Target-tracking autoscaling based on average CPU.
- Cost-friendly default profile (`c7g.large`) with cloud-hour estimates already wired in the app.

## Prerequisites

- AWS CLI v2 authenticated (`aws configure` or SSO).
- `jq` installed.
- Existing VPC + at least two subnets in one region.
- IAM instance profile with permissions your workers need.

## Quick Start

Create your account config once:

```bash
cp infrastructure/aws/.env.aws.example infrastructure/aws/.env.aws
# edit values for your account
```

```bash
./infrastructure/aws/deploy-stream-fleet.sh
```

`deploy-stream-fleet.sh` automatically loads `infrastructure/aws/.env.aws`.

After deploy, the script prints:

- Auto Scaling Group name
- Launch template name
- Security group
- RTMP/HLS endpoint format

## Runtime Controls

- Scale immediately:
  `aws autoscaling set-desired-capacity --auto-scaling-group-name <asg> --desired-capacity 2`
- Pause all workers:
  `aws autoscaling set-desired-capacity --auto-scaling-group-name <asg> --desired-capacity 0`
- List instances:
  `aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names <asg>`

## Defaults Matching Studio Cost Controls

- 720p bitrate: `4000 kbps`
- 1080p bitrate: `6000 kbps`
- Destination fanout estimate range: `1..5`

These match `server/index.js` cloud cost calculations used by the studio.
