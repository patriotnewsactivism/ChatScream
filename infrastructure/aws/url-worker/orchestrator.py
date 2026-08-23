import base64
import hashlib
import hmac
import ipaddress
import json
import os
import re
import socket
import time
import uuid
from urllib.parse import urlparse

import boto3
from botocore.exceptions import ClientError

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
TABLE_NAME = os.environ["JOB_TABLE_NAME"]
LAUNCH_TEMPLATE_ID = os.environ["LAUNCH_TEMPLATE_ID"]
SUBNET_IDS = [value.strip() for value in os.environ["SUBNET_IDS"].split(",") if value.strip()]
CONTROL_TOKEN_SHA256 = os.environ["CONTROL_TOKEN_SHA256"].strip().lower()
MAX_CONCURRENT_JOBS = max(1, min(100, int(os.environ.get("MAX_CONCURRENT_JOBS", "20"))))
MAX_DESTINATIONS = max(1, min(10, int(os.environ.get("MAX_DESTINATIONS", "10"))))
JOB_TTL_SECONDS = max(3600, int(os.environ.get("JOB_TTL_SECONDS", str(7 * 24 * 3600))))

SERVICE_TAG = "chatscream-url-worker"
STREAM_KEY_PATTERN = re.compile(r"^[A-Za-z0-9._~?&=:+/@-]{1,1024}$")
FORBIDDEN_TEE_CHARS = set("|[]\r\n")

ec2 = boto3.client("ec2", region_name=AWS_REGION)
dynamodb = boto3.client("dynamodb", region_name=AWS_REGION)


def response(status, payload):
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json",
            "cache-control": "no-store",
        },
        "body": json.dumps(payload, separators=(",", ":")),
    }


def normalized_headers(event):
    return {str(key).lower(): str(value) for key, value in (event.get("headers") or {}).items()}


def authorized(event):
    auth = normalized_headers(event).get("authorization", "")
    if not auth.startswith("Bearer "):
        return False
    token = auth[7:].strip()
    if not token:
        return False
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return hmac.compare_digest(digest, CONTROL_TOKEN_SHA256)


def parse_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Request body must be valid JSON.") from exc
    if not isinstance(body, dict):
        raise ValueError("Request body must be a JSON object.")
    return body


def is_public_ip(address):
    ip = ipaddress.ip_address(address)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def resolve_public_hostname(hostname):
    normalized = (hostname or "").strip().lower().strip("[]")
    if not normalized:
        raise ValueError("Remote hostname is required.")
    if (
        normalized == "localhost"
        or normalized.endswith(".localhost")
        or normalized.endswith(".local")
        or normalized.endswith(".internal")
        or normalized == "metadata.google.internal"
    ):
        raise ValueError("Private or local network hosts are not allowed.")

    try:
        direct = ipaddress.ip_address(normalized)
        if not is_public_ip(direct):
            raise ValueError("Private, loopback, link-local, and reserved addresses are not allowed.")
        return [str(direct)]
    except ValueError as exc:
        if "not allowed" in str(exc):
            raise

    try:
        answers = socket.getaddrinfo(normalized, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ValueError("Remote hostname could not be resolved.") from exc

    addresses = sorted({item[4][0] for item in answers})
    if not addresses:
        raise ValueError("Remote hostname did not resolve to an address.")
    for address in addresses:
        if not is_public_ip(address):
            raise ValueError("Remote hostname resolves to a private or reserved address.")
    return addresses


def validate_url(raw_url, protocols, allowed_ports, label):
    value = str(raw_url or "").strip()
    if not value or len(value) > 4096:
        raise ValueError(f"A valid {label} URL is required.")
    parsed = urlparse(value)
    if parsed.scheme.lower() not in protocols:
        raise ValueError(f"Unsupported {label} URL protocol.")
    if parsed.username or parsed.password:
        raise ValueError("Embedded URL credentials are not allowed.")
    if not parsed.hostname:
        raise ValueError(f"{label} URL hostname is required.")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError(f"Invalid {label} URL port.") from exc
    if port is not None and port not in allowed_ports:
        raise ValueError(f"Unsupported {label} URL port.")
    resolve_public_hostname(parsed.hostname)
    if any(char in value for char in FORBIDDEN_TEE_CHARS) and label == "RTMP destination":
        raise ValueError("RTMP destination contains unsupported tee-muxer characters.")
    return value


def validate_job(body):
    source = body.get("source") or {}
    if not isinstance(source, dict):
        raise ValueError("source must be an object.")
    provider = str(source.get("provider") or "").strip()
    if provider == "browser-ingest":
        raise ValueError("This worker provider handles URL-to-live playback only.")
    playable_url = validate_url(
        source.get("playableUrl"),
        {"http", "https"},
        {80, 443},
        "media source",
    )

    destinations = body.get("destinations") or []
    if not isinstance(destinations, list) or not 1 <= len(destinations) <= MAX_DESTINATIONS:
        raise ValueError(f"Between 1 and {MAX_DESTINATIONS} destinations are required.")

    clean_destinations = []
    for destination in destinations:
        if not isinstance(destination, dict):
            raise ValueError("Each destination must be an object.")
        ingest_url = validate_url(
            destination.get("ingestUrl"),
            {"rtmp", "rtmps"},
            {1935, 443},
            "RTMP destination",
        )
        stream_key = str(destination.get("streamKey") or "").strip()
        if not STREAM_KEY_PATTERN.fullmatch(stream_key) or any(
            char in stream_key for char in FORBIDDEN_TEE_CHARS
        ):
            raise ValueError("A destination stream key contains unsupported characters.")
        clean_destinations.append(
            {
                "id": str(destination.get("id") or "")[:120],
                "platform": str(destination.get("platform") or "custom")[:40],
                "ingestUrl": ingest_url,
                "streamKey": stream_key,
            }
        )

    output = body.get("output") or {}
    quality = str(output.get("quality") or "720p").lower()
    if quality not in {"720p", "1080p"}:
        raise ValueError("quality must be 720p or 1080p.")
    bitrate = int(output.get("bitrateKbps") or (6000 if quality == "1080p" else 4000))
    if bitrate < 1000 or bitrate > 12000:
        raise ValueError("bitrateKbps must be between 1000 and 12000.")
    if str(output.get("rateControl") or "cbr").lower() != "cbr":
        raise ValueError("AWS URL workers require constant bitrate (CBR).")

    limits = body.get("limits") or {}
    if limits.get("blockPrivateNetworks") is not True or limits.get("revalidateDnsBeforeFetch") is not True:
        raise ValueError("Private-network blocking and DNS revalidation must be enabled.")
    max_duration = int(limits.get("maxDurationSeconds") or 0)
    if max_duration < 60 or max_duration > 12 * 60 * 60:
        raise ValueError("maxDurationSeconds must be between 60 and 43200.")

    return {
        "sessionId": str(body.get("sessionId") or "")[:160],
        "userId": str(body.get("userId") or "")[:160],
        "source": {
            "provider": provider or "direct-url",
            "playableUrl": playable_url,
        },
        "destinations": clean_destinations,
        "output": {
            "quality": quality,
            "bitrateKbps": bitrate,
            "rateControl": "cbr",
        },
        "limits": {
            "maxDurationSeconds": max_duration,
            "blockPrivateNetworks": True,
            "revalidateDnsBeforeFetch": True,
        },
        "recording": {"enabled": bool((body.get("recording") or {}).get("enabled", False))},
    }


def active_worker_count():
    paginator = ec2.get_paginator("describe_instances")
    count = 0
    for page in paginator.paginate(
        Filters=[
            {"Name": "tag:Service", "Values": [SERVICE_TAG]},
            {"Name": "instance-state-name", "Values": ["pending", "running", "stopping"]},
        ]
    ):
        for reservation in page.get("Reservations", []):
            count += len(reservation.get("Instances", []))
    return count


def get_job(job_id):
    result = dynamodb.get_item(
        TableName=TABLE_NAME,
        Key={"job_id": {"S": job_id}},
        ConsistentRead=True,
    )
    return result.get("Item")


def update_job(job_id, values):
    names = {}
    attrs = {}
    parts = []
    for index, (key, value) in enumerate(values.items()):
        name_key = f"#n{index}"
        value_key = f":v{index}"
        names[name_key] = key
        if isinstance(value, (int, float)):
            attrs[value_key] = {"N": str(value)}
        else:
            attrs[value_key] = {"S": str(value)}
        parts.append(f"{name_key}={value_key}")
    dynamodb.update_item(
        TableName=TABLE_NAME,
        Key={"job_id": {"S": job_id}},
        UpdateExpression="SET " + ", ".join(parts),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=attrs,
    )


def public_job(item):
    if not item:
        return None
    return {
        "jobId": item["job_id"]["S"],
        "sessionId": item.get("session_id", {}).get("S", ""),
        "state": item.get("status", {}).get("S", "unknown"),
        "workerId": item.get("instance_id", {}).get("S", ""),
        "provider": "aws-ec2",
        "createdAt": item.get("created_at", {}).get("S"),
        "startedAt": item.get("started_at", {}).get("S"),
        "endedAt": item.get("ended_at", {}).get("S"),
        "exitCode": int(item.get("exit_code", {}).get("N", "0")) if "exit_code" in item else None,
    }


def create_job(body):
    if active_worker_count() >= MAX_CONCURRENT_JOBS:
        return response(429, {"message": "Cloud worker capacity is temporarily full."})

    payload = validate_job(body)
    job_id = str(uuid.uuid4())
    now = int(time.time())
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))
    expires_at = now + JOB_TTL_SECONDS

    dynamodb.put_item(
        TableName=TABLE_NAME,
        Item={
            "job_id": {"S": job_id},
            "session_id": {"S": payload.get("sessionId") or job_id},
            "user_id": {"S": payload.get("userId") or "unknown"},
            "status": {"S": "queued"},
            "created_at": {"S": created_at},
            "expires_at": {"N": str(expires_at)},
            "payload": {"S": json.dumps(payload, separators=(",", ":"))},
        },
        ConditionExpression="attribute_not_exists(job_id)",
    )

    subnet_id = SUBNET_IDS[int(uuid.UUID(job_id)) % len(SUBNET_IDS)]
    try:
        result = ec2.run_instances(
            LaunchTemplate={"LaunchTemplateId": LAUNCH_TEMPLATE_ID, "Version": "$Default"},
            MinCount=1,
            MaxCount=1,
            SubnetId=subnet_id,
            TagSpecifications=[
                {
                    "ResourceType": "instance",
                    "Tags": [
                        {"Key": "Name", "Value": f"chatscream-url-{job_id[:8]}"},
                        {"Key": "Service", "Value": SERVICE_TAG},
                        {"Key": "ChatScreamJobId", "Value": job_id},
                    ],
                }
            ],
        )
    except Exception as exc:
        update_job(job_id, {"status": "launch_failed", "ended_at": created_at})
        raise RuntimeError("AWS could not launch a stream worker.") from exc

    instance_id = result["Instances"][0]["InstanceId"]
    update_job(job_id, {"status": "starting", "instance_id": instance_id})
    return response(
        201,
        {
            "provider": "aws-ec2",
            "workerId": instance_id,
            "jobId": job_id,
            "state": "starting",
            "startedAt": created_at,
        },
    )


def stop_job(job_id):
    item = get_job(job_id)
    if not item:
        return response(404, {"message": "Job not found."})
    instance_id = item.get("instance_id", {}).get("S", "")
    if instance_id:
        try:
            ec2.terminate_instances(InstanceIds=[instance_id])
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code not in {"InvalidInstanceID.NotFound", "IncorrectInstanceState"}:
                raise
    ended_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    update_job(job_id, {"status": "stopping", "ended_at": ended_at})
    return response(200, {"provider": "aws-ec2", "jobId": job_id, "state": "stopping"})


def handler(event, _context):
    try:
        if not authorized(event):
            return response(401, {"message": "Unauthorized."})

        request_context = event.get("requestContext") or {}
        http = request_context.get("http") or {}
        method = str(http.get("method") or event.get("httpMethod") or "GET").upper()
        path = str(event.get("rawPath") or event.get("path") or "/")

        if method == "GET" and path == "/health":
            active = active_worker_count()
            return response(
                200,
                {
                    "ok": True,
                    "provider": "aws-ec2",
                    "capacity": {
                        "active": active,
                        "maxConcurrent": MAX_CONCURRENT_JOBS,
                        "available": max(0, MAX_CONCURRENT_JOBS - active),
                    },
                },
            )

        if method == "POST" and path == "/v1/jobs":
            return create_job(parse_body(event))

        match = re.fullmatch(r"/v1/jobs/([A-Za-z0-9-]+)(/stop)?", path)
        if match:
            job_id = match.group(1)
            if method == "GET" and not match.group(2):
                item = get_job(job_id)
                if not item:
                    return response(404, {"message": "Job not found."})
                return response(200, public_job(item))
            if method == "POST" and match.group(2) == "/stop":
                return stop_job(job_id)

        return response(404, {"message": "Route not found."})
    except ValueError as exc:
        return response(400, {"message": str(exc)})
    except ClientError as exc:
        print("AWS client error:", exc.response.get("Error", {}).get("Code", "unknown"))
        return response(502, {"message": "AWS worker control request failed."})
    except Exception as exc:
        print("Unhandled worker orchestrator error:", type(exc).__name__, str(exc)[:300])
        return response(500, {"message": "Cloud worker orchestration failed."})
