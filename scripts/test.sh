#!/usr/bin/env bash
set -euo pipefail
if [ -d .venv ]; then . .venv/bin/activate; fi
python -m pytest -q
node --test tests/game_engine.test.mjs
node --test tests/sailing_engine.test.mjs
