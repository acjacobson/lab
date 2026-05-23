#!/usr/bin/env bash
set -euo pipefail
if [ -d .venv ]; then . .venv/bin/activate; fi
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"
exec uvicorn lab.app:app --host "$HOST" --port "$PORT"
