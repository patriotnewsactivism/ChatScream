# ChatScream App Backend on AWS (EC2)

This deploys the actual ChatScream backend — `server/index.js`, the Express
API plus the WebSocket server that spawns FFmpeg and pushes RTMP to
YouTube/Facebook/Twitch/etc. — to a single EC2 instance behind Caddy
(automatic HTTPS via Let's Encrypt).

**This is not** `infrastructure/aws/deploy-stream-fleet.sh`. That's a
separate, unrelated autoscaling fleet of standalone FFmpeg/Nginx-RTMP workers
for the not-yet-built "Cloud Streaming" (VM-based, browser-independent)
feature — see `TODO.md` §11. You do not need it for YouTube/Facebook/Twitch
streaming to work; this directory is what you need for that.

## What you get

- One EC2 instance running: the app container (built from the repo's
  `Dockerfile` `backend` target), Postgres, Redis, and Caddy — via
  `docker-compose.prod.yml`.
- Caddy terminates TLS on 80/443 and reverse-proxies everything (including
  WebSocket upgrades) to the app container. Only 22/80/443 are open;
  port 8787 is never exposed publicly.

## Prerequisites

- AWS CLI v2, authenticated (`aws configure` or SSO), plus `jq`.
- An existing VPC + a subnet with a route to an internet gateway (so the
  instance gets a public IP).
- An existing EC2 key pair (for SSH).
- A domain you control, to point at this instance (e.g. `api.yourdomain.com`).
- Real OAuth app credentials for whichever platforms you want to support —
  see `ADMIN_OAUTH_SETUP_GUIDE.md` at the repo root. Without these, the
  "Connect YouTube/Facebook" buttons will correctly refuse to work; that's
  not a bug in this deployment, it's a separate setup step.

## 1. Provision the instance

```bash
cp infrastructure/aws/app-backend/.env.aws.app.example infrastructure/aws/app-backend/.env.aws.app
# edit .env.aws.app: VPC_ID, SUBNET_ID, KEY_NAME at minimum

./infrastructure/aws/app-backend/deploy-app-backend.sh
```

This prints an Elastic IP. Point your domain's DNS A record at it now — Caddy
needs that to resolve before it can request a certificate.

Re-running the script is safe: if an instance named `chatscream-app-backend`
is already running, it just prints its IP instead of launching a duplicate.

## 2. After the instance boots (~1 minute for Docker install)

```bash
ssh -i <your-key>.pem ubuntu@<elastic-ip>

sudo mkdir -p /opt/chatscream && sudo chown ubuntu:ubuntu /opt/chatscream
git clone https://github.com/<your-org>/<your-repo>.git /opt/chatscream
cd /opt/chatscream/infrastructure/aws/app-backend

cp .env.example .env
nano .env   # fill in DOMAIN, POSTGRES_PASSWORD, OAuth credentials, AUTH_STATE_SECRET, etc.

docker compose -f docker-compose.prod.yml up -d --build
```

First boot only — create the database schema:

```bash
docker compose -f docker-compose.prod.yml exec app npm run db:push
```

## 3. Point the frontend at this backend

In your Vercel project's environment variables:

```
VITE_API_BASE_URL=https://api.yourdomain.com
```

Redeploy the frontend after setting it.

## 4. Verify

```bash
curl https://api.yourdomain.com/api/public/capabilities
```

You should see `streamKeyPlatforms` reflecting whichever OAuth credentials
you configured (`true` for platforms with both a client ID and secret set).

Then, from the deployed frontend: sign in, try "Connect YouTube" — it should
open a real Google consent screen instead of the "not configured yet" alert.

## Updating

```bash
cd /opt/chatscream && git pull
cd infrastructure/aws/app-backend
docker compose -f docker-compose.prod.yml up -d --build
```

## Troubleshooting

- **`deploy-app-backend.sh` fails with `InvalidParameterValue` / unsupported
  instance type for the AZ** — not every instance type is offered in every
  Availability Zone for every account. If `SUBNET_ID` lands in an AZ that
  doesn't have `INSTANCE_TYPE` available, pick a different subnet (a
  different AZ in the same VPC) in `.env.aws.app` and re-run.
- **SSH connection times out right after the script finishes** — this is
  usually just impatience, not a failure. `run-instances` returning and the
  instance reaching AWS's "running" state both happen well before the OS has
  finished booting and `sshd` is actually accepting connections — for a
  fresh Ubuntu instance, budget 1–2 minutes, not seconds. If it's still
  refused after a few minutes, check `aws ec2 get-console-output
  --instance-id <id>` for a boot failure, and confirm the security group
  actually has the port 22 rule (re-running the script when a security group
  already existed does not re-add rules to it).
- **OAuth connect still fails after this** — double check the redirect URI
  registered in the Google/Facebook app console matches
  `VITE_OAUTH_REDIRECT_URI` in `.env` exactly (including `https://` and no
  trailing slash mismatch). See `ADMIN_OAUTH_SETUP_GUIDE.md` → Troubleshooting.
- **Caddy won't get a certificate** — DNS hasn't propagated yet, or port 80
  isn't reachable (check the security group and that nothing else is bound
  to 80/443 on the instance). `docker compose logs caddy` shows the ACME
  attempt.
- **`Go Live` connects OAuth fine but nothing reaches YouTube/Facebook** —
  `docker compose logs app` and look for FFmpeg output; it logs per-destination
  connection attempts and errors (this was the specific pipeline fixed to be
  per-destination and retryable — see `TODO.md` §1–4).
- **Database errors on boot** — make sure step 2's `npm run db:push` ran
  after the very first `docker compose up`.
