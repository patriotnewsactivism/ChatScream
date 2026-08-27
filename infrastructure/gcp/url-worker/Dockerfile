# ChatScream URL-to-Live worker (Cloud Run Jobs).
#
# Debian slim rather than Alpine: the ffmpeg build there is linked against the
# codecs and TLS stack this pipeline needs (libx264, AAC, RTMPS), and the image
# is pulled once per revision, not per execution.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The worker shells out to ffmpeg and talks HTTP with the standard library, so
# there is nothing to pip install — no dependency surface to keep patched.
WORKDIR /app
COPY worker.py /app/worker.py

RUN useradd --create-home --uid 10001 worker
USER worker

ENTRYPOINT ["python3", "/app/worker.py"]
