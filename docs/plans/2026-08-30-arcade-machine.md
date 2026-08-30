# Classic Arcade Machine Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a phone-playable old-school arcade cabinet to Stray Lantern Lab with an in-screen game selector and rough equivalents of Tetris, Breakout, Space Invaders, and Pac-Man, plus simple synthesized sound effects.

**Architecture:** Add one `/games/arcade/` page with a responsive CSS cabinet surrounding a single canvas screen. Keep deterministic rules for each game in separate ES modules and let one UI controller own selection, animation, rendering, keyboard/touch input, lifecycle, scoring display, and Web Audio effects. This is a compact MVP - no persistence, multiplayer, external assets, or extra games.

**Tech Stack:** FastAPI/Jinja, HTML/CSS, Canvas 2D, vanilla JavaScript ES modules, Web Audio API, Python pytest, Node built-in test runner.

---

## Scope and acceptance criteria

- The Lab index links to `/games/arcade/`.
- The page visibly resembles a vintage upright arcade machine, with marquee, bezel, inset screen, control panel, joystick/buttons, and speaker styling.
- The initial screen is a four-game selector usable by touch, mouse, and keyboard.
- The four selectable games are rough but playable equivalents:
  - **Block Drop:** falling tetromino-like pieces, movement, rotation, line clearing, loss/restart.
  - **Brick Breaker:** paddle, bouncing ball, bricks, lives, win/loss/restart.
  - **Alien Blaster:** player cannon, alien formation, shots, lives, win/loss/restart.
  - **Maze Muncher:** maze movement, pellets, roaming enemies, lives, win/restart.
- Shared on-page mobile controls provide directional input, a primary action, restart, selector/home, and sound mute/unmute; buttons are at least 44px high.
- Keyboard controls work with arrows/WASD, Space/Enter, R, Escape, and M.
- Simple synthesized sounds play only after user interaction and can be muted.
- The page has no third-party game assets or dependencies.
- Existing Lab games and routes remain unchanged.

### Task 1: Add arcade route, index card, cabinet shell, and route tests

**Objective:** Establish the page, responsive cabinet visual, static asset hooks, navigation, and smoke coverage without implementing gameplay.

**Files:**
- Modify: `lab/app.py`
- Modify: `lab/templates/index.html`
- Create: `lab/templates/arcade.html`
- Create: `lab/static/games/arcade/styles.css`
- Modify: `tests/test_app.py`
- Modify: `scripts/smoke.sh`

**Steps:**
1. Add failing pytest assertions for `/games/arcade/`, its no-slash redirect, the Lab card, canvas, selector, controls, and CSS/JS asset references.
2. Run `python -m pytest tests/test_app.py -q`; expect the new tests to fail.
3. Add the redirect and template route, index card, semantic arcade page markup, and responsive cabinet CSS. Reference `/static/games/arcade/game.js` as a module even though the controller arrives later.
4. Add `/games/arcade/` to `scripts/smoke.sh`.
5. Run `python -m pytest tests/test_app.py -q`; expect all route tests to pass.
6. Commit with `feat: add arcade cabinet shell`.

### Task 2: Implement and test Block Drop rules

**Objective:** Create deterministic falling-block gameplay independent from canvas rendering.

**Files:**
- Create: `lab/static/games/arcade/block-drop.mjs`
- Create: `tests/arcade_block_drop.test.mjs`

**Steps:**
1. Write Node tests for initial board/state, horizontal movement bounds, rotation, gravity/locking, completed-line clearing/scoring, and game-over/restart state.
2. Run `node --test tests/arcade_block_drop.test.mjs`; expect failure because the module does not exist.
3. Implement a compact board-based engine with exported `createBlockDrop`, `moveBlockDrop`, `rotateBlockDrop`, `stepBlockDrop`, and `dropBlockDrop` functions. Use an injectable/random piece source or fixed sequence support so tests are deterministic.
4. Run the test file; expect all tests to pass.
5. Commit with `feat: add block drop engine`.

### Task 3: Implement and test Brick Breaker rules

**Objective:** Create deterministic paddle, ball, brick, life, win, and loss rules.

**Files:**
- Create: `lab/static/games/arcade/brick-breaker.mjs`
- Create: `tests/arcade_brick_breaker.test.mjs`

**Steps:**
1. Write Node tests for initial bricks/lives, paddle bounds, wall and paddle bounce, brick removal/scoring, life loss/reset, and win/loss states.
2. Run `node --test tests/arcade_brick_breaker.test.mjs`; expect module-not-found failure.
3. Implement exported `createBrickBreaker`, `moveBrickBreaker`, `launchBrickBreaker`, and `stepBrickBreaker` functions with fixed-step updates.
4. Run the test file; expect all tests to pass.
5. Commit with `feat: add brick breaker engine`.

### Task 4: Implement and test Alien Blaster rules

**Objective:** Create deterministic formation movement, shooting, collisions, lives, and ending rules.

**Files:**
- Create: `lab/static/games/arcade/alien-blaster.mjs`
- Create: `tests/arcade_alien_blaster.test.mjs`

**Steps:**
1. Write Node tests for initial formation, cannon bounds, player shot creation, alien hit/scoring, formation edge descent, enemy hit/life loss, and win/loss states.
2. Run `node --test tests/arcade_alien_blaster.test.mjs`; expect module-not-found failure.
3. Implement exported `createAlienBlaster`, `moveAlienBlaster`, `fireAlienBlaster`, and `stepAlienBlaster` functions. Accept deterministic enemy-fire input or RNG injection.
4. Run the test file; expect all tests to pass.
5. Commit with `feat: add alien blaster engine`.

### Task 5: Implement and test Maze Muncher rules

**Objective:** Create deterministic maze navigation, pellet collection, enemy movement, lives, and completion rules.

**Files:**
- Create: `lab/static/games/arcade/maze-muncher.mjs`
- Create: `tests/arcade_maze_muncher.test.mjs`

**Steps:**
1. Write Node tests for initial maze/pellets, blocked and valid movement, pellet scoring, enemy movement, collision/life reset, and level completion/loss.
2. Run `node --test tests/arcade_maze_muncher.test.mjs`; expect module-not-found failure.
3. Implement exported `createMazeMuncher`, `setMazeDirection`, and `stepMazeMuncher` functions using a small fixed tile map and deterministic enemy choices.
4. Run the test file; expect all tests to pass.
5. Commit with `feat: add maze muncher engine`.

### Task 6: Integrate selector, canvas rendering, controls, and sound

**Objective:** Make all four engines playable inside the cabinet through one responsive browser controller.

**Files:**
- Create: `lab/static/games/arcade/game.js`
- Modify if required: `lab/templates/arcade.html`
- Modify if required: `lab/static/games/arcade/styles.css`
- Create: `tests/arcade_ui.test.mjs`
- Modify: `scripts/test.sh`

**Steps:**
1. Add static source-contract tests for the four engine imports, selector hooks, keyboard/touch/pointer handling, animation lifecycle, mute control, restart/home controls, and accessible labels.
2. Run `node --test tests/arcade_ui.test.mjs`; expect failure before the controller exists.
3. Implement the initial four-card selector drawn in/over the game screen and wire click/touch/keyboard selection.
4. Implement one animation loop that starts/stops the active engine cleanly and renders each game at the fixed logical canvas size.
5. Map shared input to each game, including press-and-hold directional controls where useful, primary action, restart, Escape/home, and mute.
6. Add a small Web Audio synthesizer for select, move/launch/fire, score/hit, life-loss, and win cues. Create/resume audio context only from a user gesture and make mute reliable.
7. Update `scripts/test.sh` to run all five new Node test files.
8. Run each new Node test and then `./scripts/test.sh`; expect all tests to pass.
9. Commit with `feat: integrate four-game arcade`.

### Task 7: Integration, scope, and browser verification

**Objective:** Prove the complete feature works locally and only contains the requested player-facing scope.

**Files:**
- Modify only files required to fix verified integration issues.

**Steps:**
1. Run `./scripts/test.sh`; expect all Python and Node tests to pass.
2. Run `./scripts/build.sh`; expect a successful container image build.
3. Start the app locally over HTTP and run `BASE_URL=http://127.0.0.1:8080 ./scripts/smoke.sh`; expect success.
4. Open `/games/arcade/` at a phone-sized viewport. Verify no console errors or horizontal overflow.
5. Select and exercise every game with touch controls: move/rotate and lock a block, launch/hit a brick, move/fire at an alien, and collect a maze pellet.
6. Verify keyboard controls, restart, return-to-selector, and mute/unmute.
7. Review the full diff against the scope checklist. Remove player-visible scope creep and preserve existing games.
8. Commit any fixes with `fix: verify arcade integration`.

### Task 8: Merge, deploy, and verify production

**Objective:** Ship through the canonical Lab workflow and verify the public experience.

**Steps:**
1. Confirm the feature branch is clean and all plan commits are present.
2. Merge the feature branch to `main` without rewriting unrelated history.
3. Push `main` to `origin`.
4. Verify GitHub Actions CI succeeds and the dependent Deploy workflow succeeds.
5. Verify `https://lab.straylantern.com/healthz`, `/`, `/games/arcade/`, and the required arcade static modules return 200.
6. Open the public arcade in a phone-sized browser, select all four games, exercise one core interaction in each, and confirm no console errors.
