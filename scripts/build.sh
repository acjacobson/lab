#!/usr/bin/env bash
set -euo pipefail
IMAGE_NAME="${IMAGE_NAME:-lab:local}"
docker build -f deploy/Dockerfile -t "$IMAGE_NAME" .
