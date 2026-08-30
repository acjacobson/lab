#!/usr/bin/env bash
set -euo pipefail
if [ -d .venv ]; then . .venv/bin/activate; fi
python -m pytest -q
node --test tests/game_engine.test.mjs
node --test tests/sailing_engine.test.mjs
node --test tests/arcade_block_drop.test.mjs
node --test tests/arcade_brick_breaker.test.mjs
node --test tests/arcade_alien_blaster.test.mjs
node --test tests/arcade_maze_muncher.test.mjs
node --test tests/arcade_ui.test.mjs
