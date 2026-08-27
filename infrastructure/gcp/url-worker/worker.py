#!/usr/bin/env python3
"""
ChatScream URL-to-Live worker — Cloud Run Jobs edition.

Port of infrastructure/aws/url-worker/worker.py. The encoding behaviour and the
network guards are deliberately identical; what changes is everything around
them:

  * A Cloud Run Job execution *is* the unit of work, so there is no instance to
    identify, tag, or shut down. The payload arrives as an env override on the
    execution and the container exiting ends the billing.
  * Job state goes back to the ChatScream control plane over an authenticated
    callback instead of into DynamoDB, so the worker never holds database
    credentials and there is no second datastore to run.

The URL validation below is the security boundary for an SSRF-shaped feature —
we fetch an operator-supplied URL from inside our own network — so it is kept
byte-for-byte equivalent to the reviewed AWS version rather than rewritten.
"""

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
from urllib.error import URLError

FORBIDDEN_TEE_CHARS = set("|[]\r\n")
STOP_REQUESTED = False

JOB_ID = os.environ.get("CHATSCREAM_JOB_ID", "").strip()
CALLBACK_URL = os.environ.get("CHATSCREAM_CALLBACK_URL", "").strip().rstrip("/")
CALLBACK_TOKEN = os.environ.get("CHATSCREAM_CALLBACK_TOKEN", "").strip()
RAW_PAYLOAD = os.environ.get("CHATSCREAM_JOB_PAYLOAD", "")


def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def log(message):
    print(f"[chatscream-worker] {message}", file=sys.stderr, flush=True)


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
    if (
        not normalized
        or normalized == "localhost"
        or normalized.endswith((".localhost", ".local", ".internal"))
        # GCE's metadata server is the local equivalent of AWS IMDS.
        or normalized in ("metadata", "metadata.google.internal")
    ):
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


def report(status, **fields):
    """Best-effort status callback. A failed report must not kill a live stream."""
    if not (CALLBACK_URL and CALLBACK_TOKEN and JOB_ID):
        log(f"status={status} (no callback configured)")
        return
    body = json.dumps({"jobId": JOB_ID, "status": status, "at": utc_now(), **fields}).encode()
    request = Request(
        f"{CALLBACK_URL}/api/cloud-v2/jobs/{JOB_ID}/status",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CALLBACK_TOKEN}",
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            response.read()
    except (URLError, OSError, ValueError) as exc:
        log(f"status callback failed ({status}): {type(exc).__name__}")


def load_payload():
    if not RAW_PAYLOAD:
        raise RuntimeError("CHATSCREAM_JOB_PAYLOAD is missing")
    payload = json.loads(RAW_PAYLOAD)

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
    # Cloud Run sends SIGTERM on cancel and before the task timeout.
    global STOP_REQUESTED
    STOP_REQUESTED = True


def stop_process(process):
    process.terminate()
    try:
        return process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        return process.wait(timeout=5)


def main():
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    payload = load_payload()
    limits = payload.get("limits") or {}
    max_duration = max(60, min(43200, int(limits.get("maxDurationSeconds") or 3600)))

    # Re-resolve immediately before the fetch to narrow the DNS-rebinding window.
    validate_url(payload["source"]["playableUrl"], {"http", "https"}, {80, 443})
    for ingest, _key in payload["destinations"]:
        validate_url(ingest, {"rtmp", "rtmps"}, {1935, 443})

    report("running", destinationCount=len(payload["destinations"]))
    process = subprocess.Popen(build_ffmpeg(payload))
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
                exit_code = stop_process(process)
                break
            if time.monotonic() - started >= max_duration:
                state = "completed" if process.poll() == 0 else "timed_out"
                exit_code = stop_process(process)
                break
            time.sleep(2)
    finally:
        report(
            state,
            exitCode=int(exit_code or 0),
            durationSeconds=max(0, int(time.monotonic() - started)),
        )

    return int(exit_code or 0)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - last resort, must still report
        log(f"fatal: {type(exc).__name__}: {exc}")
        report("failed", error=f"{type(exc).__name__}")
        sys.exit(1)
