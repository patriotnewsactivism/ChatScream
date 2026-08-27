#!/usr/bin/env python3
"""
Guards for the worker's network boundary. Run: python3 selftest.py

This worker fetches an operator-supplied URL from inside our own network and
hands operator-supplied stream keys to ffmpeg's tee muxer, so both are injection
surfaces. Standard library only and no network access, so it runs anywhere —
the repo has no Python test runner wired into CI, so this is meant to be run by
hand before deploying a change to worker.py.

Known limit, established by mutation testing: deleting the explicit
"metadata"/"metadata.google.internal" hostname rule from worker.py does NOT
fail this file. Those two names are already covered twice over — the fqdn by
the ".internal" suffix rule, and the short name by resolving to a link-local
address that is_public_ip() rejects. That rule is defense in depth, so treat
these metadata cases as covering the *outcome*, not that specific line.
"""

import sys

import worker

MEDIA = ({"http", "https"}, {80, 443})
INGEST = ({"rtmp", "rtmps"}, {1935, 443})

BLOCKED_URLS = [
    ("loopback name", "http://localhost/a.mp4", MEDIA),
    ("loopback v4", "http://127.0.0.1/a.mp4", MEDIA),
    ("loopback v6", "http://[::1]/a.mp4", MEDIA),
    ("private 10/8", "http://10.0.0.5/a.mp4", MEDIA),
    ("private 172.16/12", "http://172.16.0.1/a.mp4", MEDIA),
    ("private 192.168/16", "http://192.168.1.1/a.mp4", MEDIA),
    ("AWS/GCE link-local", "http://169.254.169.254/latest/meta-data/", MEDIA),
    ("GCE metadata fqdn", "http://metadata.google.internal/computeMetadata/v1/", MEDIA),
    ("GCE metadata short", "http://metadata/computeMetadata/v1/", MEDIA),
    (".internal suffix", "http://svc.internal/a.mp4", MEDIA),
    (".local suffix", "http://box.local/a.mp4", MEDIA),
    (".localhost suffix", "http://evil.localhost/a.mp4", MEDIA),
    ("embedded credentials", "http://user:pass@example.com/a.mp4", MEDIA),
    ("file scheme", "file:///etc/passwd", MEDIA),
    ("gopher scheme", "gopher://example.com/", MEDIA),
    ("ssh port", "http://example.com:22/a.mp4", MEDIA),
    ("unspecified addr", "http://0.0.0.0/a.mp4", MEDIA),
    ("empty", "", MEDIA),
    ("rtmp to private", "rtmp://10.1.2.3/live", INGEST),
    ("rtmp odd port", "rtmp://example.com:9999/live", INGEST),
]

UNSAFE_TEE = [
    ("pipe splits outputs", [("rtmp://a.example.com/live", "key|evil")]),
    ("newline", [("rtmp://a.example.com/live", "key\nevil")]),
    ("carriage return", [("rtmp://a.example.com/live", "key\revil")]),
    ("bracket opens options", [("rtmp://a.example.com/live", "key[f=flv]")]),
]


def main() -> int:
    failures = []

    for label, url, (schemes, ports) in BLOCKED_URLS:
        try:
            worker.validate_url(url, schemes, ports)
            failures.append(f"validate_url ACCEPTED {label!r} ({url!r})")
        except Exception:
            pass

    for label, destinations in UNSAFE_TEE:
        try:
            worker.tee_target(destinations)
            failures.append(f"tee_target ACCEPTED {label!r}")
        except Exception:
            pass

    # A clean target must still build, or the guards are simply refusing work.
    try:
        built = worker.tee_target([("rtmp://a.example.com/live", "goodkey")])
        if built != "[f=flv:onfail=ignore]rtmp://a.example.com/live/goodkey":
            failures.append(f"tee_target built unexpected output: {built!r}")
    except Exception as exc:
        failures.append(f"tee_target REJECTED a clean destination: {exc}")

    total = len(BLOCKED_URLS) + len(UNSAFE_TEE) + 1
    if failures:
        print(f"FAILED {len(failures)}/{total}")
        for line in failures:
            print(f"  - {line}")
        return 1

    print(f"ok — {total}/{total} boundary checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
