#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
curl -fsS "$BASE_URL/healthz" | grep -q '"status":"ok"'
curl -fsS "$BASE_URL/" | grep -q 'Stray Lantern Lab'
curl -fsS "$BASE_URL/games/lighthouse/" | grep -q 'The Last Lighthouse Keeper'
curl -fsS "$BASE_URL/games/sailing/" | grep -q 'Sailing'
curl -fsS "$BASE_URL/blog" | grep -q 'First deployment note'
echo "Smoke checks passed for $BASE_URL"
