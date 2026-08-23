#!/usr/bin/env python3
import ipaddress
import json
import os
import signal
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("AWS_REGION", "us-east-1")
TABLE_NAME = os.environ["JOB_TABLE_NAME"]
IMDS_BASE = "http://169.254.169.254/latest"
FORBIDDEN_TEE_CHARS = set("|[]\r\n")
STOP_REQUESTED = False

dynamodb = boto3.client("dynamodb", region_name=REGION)


def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def imds_token():
    req = Request(f"{IMDS_BASE}/api/token", method="PUT", headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"})
    with urlopen(req, timeout=3) as response:
        return response.read().decode().strip()


def imds(path, token):
    req = Request(f"{IMDS_BASE}/{path.lstrip('/')}", headers={"X-aws-ec2-metadata-token": token})
    with urlopen(req, timeout=3) as response:
        return response.read().decode().strip()


def instance_identity():
    token = imds_token()
    instance_id = imds("meta-data/instance-id", token)
    document = json.loads(imds("dynamic/instance-identity/document", token))
    return instance_id, document.get("region") or REGION


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


def resolve_public(hostname):
    normalized = str(hostname or "").strip().lower().strip("[]")
    if not normalized or normalized == "localhost" or normalized.endswith((".localhost", ".local", ".internal")):
        raise ValueError("Private/local hostname blocked")
    try:
        direct = ipaddress.ip_address(normalized)
        if not is_public_ip(direct):
            raise ValueError("Private/reserved address blocked")
        return [str(direct)]
    except ValueError as exc:
        if "blocked" in str(exc):
            raise
    answers = socket.getaddrinfo(normalized, None, proto=socket.IPPROTO_TCP)
    addresses = sorted({item[4][0] for item in answers})
    if not addresses or any(not is_public_ip(address) for address in addresses):
        raise ValueError("Hostname resolved to private/reserved address")
    return addresses


def validate_url(value, protocols, ports):
    parsed = urlparse(str(value or "").strip())
    if parsed.scheme.lower() not in protocols or not parsed.hostname:
        raise ValueError("Unsupported URL")
    if parsed.username or parsed.password:
        raise ValueError("Embedded credentials are blocked")
    port = parsed.port
    if port is not None and port not in ports:
        raise ValueError("Unsupported port")
    resolve_public(parsed.hostname)
    return parsed.geturl()


def get_job(job_id):
    result = dynamodb.get_item(
        TableName=TABLE_NAME,
        Key={"job_id": {"S": job_id}},
        ConsistentRead=True,
    )
    return result.get("Item")


def update_job(job_id, values, remove_payload=False):
    names = {}
    attrs = {}
    sets = []
    for index, (key, value) in enumerate(values.items()):
        nk = f"#n{index}"
        vk = f":v{index}"
        names[nk] = key
        if isinstance(value, bool):
            attrs[vk] = {"BOOL": value}
        elif isinstance(value, (int, float)):
            attrs[vk] = {"N": str(value)}
        else:
            attrs[vk] = {"S": str(value)}
        sets.append(f"{nk}={vk}")
    expression = "SET " + ", ".join(sets)
    if remove_payload:
        names["#payload"] = "payload"
        expression += " REMOVE #payload"
    dynamodb.update_item(
        TableName=TABLE_NAME,
        Key={"job_id": {"S": job_id}},
        UpdateExpression=expression,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=attrs,
    )


def job_id_from_instance(instance_id):
    ec2 = boto3.client("ec2", region_name=REGION)
    response = ec2.describe_tags(
        Filters=[
            {"Name": "resource-id", "Values": [instance_id]},
            {"Name": "key", "Values": ["ChatScreamJobId"]},
        ]
    )
    tags = response.get("Tags", [])
    if not tags:
        raise RuntimeError("ChatScreamJobId instance tag is missing")
    return tags[0]["Value"]


def deserialize_payload(item):
    if not item or "payload" not in item:
        raise RuntimeError("Job payload is missing")
    payload = json.loads(item["payload"]["S"])
    source = payload.get("source") or {}
    source_url = validate_url(source.get("playableUrl"), {"http", "https"}, {80, 443})
    destinations = payload.get("destinations") or []
    if not destinations:
        raise RuntimeError("No destinations configured")
    clean_destinations = []
    for destination in destinations:
        ingest = validate_url(destination.get("ingestUrl"), {"rtmp", "rtmps"}, {1935, 443})
        key = str(destination.get("streamKey") or "").strip()
        if not key or any(char in key for char in FORBIDDEN_TEE_CHARS):
            raise ValueError("Unsafe stream key")
        clean_destinations.append((ingest.rstrip("/"), key))
    payload["source"]["playableUrl"] = source_url
    payload["destinations"] = clean_destinations
    return payload


def tee_target(destinations):
    outputs = []
    for ingest, key in destinations:
        url = f"{ingest}/{key}"
        if any(char in url for char in FORBIDDEN_TEE_CHARS):
            raise ValueError("Unsafe tee output")
        outputs.append(f"[f=flv:onfail=ignore]{url}")
    return "|".join(outputs)


def build_ffmpeg(payload):
    source = payload["source"]["playableUrl"]
    output = payload.get("output") or {}
    quality = output.get("quality", "720p")
    bitrate = int(output.get("bitrateKbps") or (6000 if quality == "1080p" else 4000))
    height = 1080 if quality == "1080p" else 720
    bufsize = bitrate * 2
    target = tee_target(payload["destinations"])

    return [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "warning",
        "-nostdin",
        "-re",
        "-rw_timeout", "15000000",
        "-i", source,
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-vf", f"scale=-2:{height}:flags=lanczos,fps=30,format=yuv420p",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-profile:v", "high",
        "-b:v", f"{bitrate}k",
        "-minrate", f"{bitrate}k",
        "-maxrate", f"{bitrate}k",
        "-bufsize", f"{bufsize}k",
        "-g", "60",
        "-keyint_min", "60",
        "-sc_threshold", "0",
        "-c:a", "aac",
        "-b:a", "160k",
        "-ar", "48000",
        "-ac", "2",
        "-flags", "+global_header",
        "-f", "tee",
        target,
    ]


def handle_signal(_signum, _frame):
    global STOP_REQUESTED
    STOP_REQUESTED = True


def shutdown_instance():
    # Launch template uses InstanceInitiatedShutdownBehavior=terminate.
    try:
        subprocess.run(["/sbin/shutdown", "-h", "now"], check=False, timeout=5)
    except Exception:
        pass


def main():
    global REGION, dynamodb
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    instance_id, detected_region = instance_identity()
    if detected_region != REGION:
        REGION = detected_region
        dynamodb = boto3.client("dynamodb", region_name=REGION)

    job_id = job_id_from_instance(instance_id)
    item = get_job(job_id)
    payload = deserialize_payload(item)
    max_duration = max(60, min(43200, int((payload.get("limits") or {}).get("maxDurationSeconds") or 3600)))

    # Re-resolve immediately before FFmpeg fetch to reduce DNS-rebinding risk.
    validate_url(payload["source"]["playableUrl"], {"http", "https"}, {80, 443})
    for ingest, _key in payload["destinations"]:
        validate_url(ingest, {"rtmp", "rtmps"}, {1935, 443})

    update_job(job_id, {"status": "running", "started_at": utc_now(), "instance_id": instance_id})
    command = build_ffmpeg(payload)
    process = subprocess.Popen(command)
    started = time.monotonic()
    state = "completed"
    exit_code = 0

    try:
        while True:
            exit_code = process.poll()
            if exit_code is not None:
                state = "completed" if exit_code == 0 else "failed"
                break
            if STOP_REQUESTED:
                state = "stopped"
                process.terminate()
                try:
                    exit_code = process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    exit_code = process.wait(timeout=5)
                break
            if time.monotonic() - started >= max_duration:
                state = "completed" if process.poll() == 0 else "timed_out"
                process.terminate()
                try:
                    exit_code = process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    exit_code = process.wait(timeout=5)
                break
            time.sleep(2)
    finally:
        duration = max(0, int(time.monotonic() - started))
        try:
            update_job(
                job_id,
                {
                    "status": state,
                    "ended_at": utc_now(),
                    "exit_code": int(exit_code or 0),
                    "duration_seconds": duration,
                },
                remove_payload=True,
            )
        except ClientError as exc:
            print("Could not update final job state:", exc.response.get("Error", {}).get("Code"), file=sys.stderr)
        shutdown_instance()

    return int(exit_code or 0)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"ChatScream worker fatal error: {type(exc).__name__}: {exc}", file=sys.stderr)
        try:
            shutdown_instance()
        finally:
            sys.exit(1)
