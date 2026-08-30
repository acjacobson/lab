import {
  createBlockDrop,
  dropBlockDrop,
  moveBlockDrop,
  rotateBlockDrop,
  stepBlockDrop,
} from "./block-drop.mjs";
import {
  createBrickBreaker,
  launchBrickBreaker,
  moveBrickBreaker,
  stepBrickBreaker,
} from "./brick-breaker.mjs";
import {
  createAlienBlaster,
  fireAlienBlaster,
  moveAlienBlaster,
  stepAlienBlaster,
} from "./alien-blaster.mjs";
import {
  createMazeMuncher,
  setMazeDirection,
  stepMazeMuncher,
} from "./maze-muncher.mjs";

const canvas = document.getElementById("game-canvas");
const context = canvas?.getContext?.("2d");
const selector = document.getElementById("game-selector");
const screenMessage = document.getElementById("screen-message");
const creditDisplay = document.getElementById("credit-display");
const highScoreDisplay = document.getElementById("high-score");
const primaryAction = document.getElementById("primary-action");
const restartButton = document.getElementById("restart-game");
const homeButton = document.getElementById("selector-home");
const soundToggle = document.getElementById("sound-toggle");
const choices = [...document.querySelectorAll(".game-choice[data-game]")];
const directionButtons = [...document.querySelectorAll(".direction-control[data-direction]")];

const GAME_ORDER = Object.freeze([
  "block-drop",
  "brick-breaker",
  "alien-blaster",
  "maze-muncher",
]);
const GAME_DEFINITIONS = Object.freeze({
  "block-drop": Object.freeze({
    label: "Block Drop",
    create: () => ({ engine: createBlockDrop() }),
  }),
  "brick-breaker": Object.freeze({
    label: "Brick Breaker",
    create: () => ({ engine: createBrickBreaker() }),
  }),
  "alien-blaster": Object.freeze({
    label: "Alien Blaster",
    create: () => ({ engine: createAlienBlaster() }),
  }),
  "maze-muncher": Object.freeze({
    label: "Maze Muncher",
    create: () => ({ engine: createMazeMuncher({ tileSize: 32 }) }),
  }),
});

const KEY_TO_DIRECTION = Object.freeze({
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowLeft: "left",
  "w": "up",
  "d": "right",
  "s": "down",
  "a": "left",
});
const ACTION_KEYS = new Set(["Enter", " "]);
const MAX_UI_DELTA = 0.25;
const BLOCK_GRAVITY_SECONDS = 0.62;
const BLOCK_SOFT_DROP_SECONDS = 0.075;
const BLOCK_REPEAT_SECONDS = 0.11;
const MAZE_STEP_SECONDS = 0.16;
const WORLD_WIDTH = 480;
const WORLD_HEIGHT = 360;

const CUE_TONES = Object.freeze({
  select: Object.freeze({ frequency: 520, duration: 0.055, type: "square" }),
  start: Object.freeze({ frequency: 660, duration: 0.1, type: "square" }),
  move: Object.freeze({ frequency: 230, duration: 0.035, type: "triangle" }),
  launch: Object.freeze({ frequency: 390, duration: 0.09, type: "sawtooth" }),
  fire: Object.freeze({ frequency: 760, duration: 0.045, type: "square" }),
  score: Object.freeze({ frequency: 880, duration: 0.08, type: "triangle" }),
  life: Object.freeze({ frequency: 130, duration: 0.2, type: "sawtooth" }),
  win: Object.freeze({ frequency: 980, duration: 0.24, type: "square" }),
  loss: Object.freeze({ frequency: 90, duration: 0.25, type: "sawtooth" }),
});

const COLORS = Object.freeze({
  ink: "#ddfff0",
  muted: "#8bc5bd",
  cyan: "#5bd4cf",
  pink: "#f06b8d",
  gold: "#ffdf78",
  red: "#ff7a79",
  block: ["#5bd4cf", "#f06b8d", "#ffb84d", "#b7f36b", "#bd91ff", "#ff7f50", "#72a7ff"],
  brick: ["#f06b8d", "#ffb84d", "#5bd4cf", "#b7f36b", "#bd91ff"],
});

let selectedSlug = "block-drop";
let activeSlug = null;
let activeGame = null;
let selectorVisible = true;
let muted = false;
let highScore = 0;
let animationFrameId = null;
let loopRunning = false;
let lastFrameTime = null;
let lastEventState = null;
let blockGravityTimer = 0;
let blockMoveTimer = 0;
let mazeStepTimer = 0;
let lastInputDirection = null;
const heldDirections = new Set();
const heldKeyboardDirections = new Set();
const heldPointerDirections = new Map();
let audioContext = null;

function stateOf(game) {
  return game?.state ?? game ?? null;
}

function definitionFor(slug = activeSlug ?? selectedSlug) {
  return GAME_DEFINITIONS[slug] ?? GAME_DEFINITIONS[GAME_ORDER[0]];
}

function labelFor(slug = activeSlug ?? selectedSlug) {
  return definitionFor(slug).label;
}

function numberOr(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function formatScore(value) {
  return String(Math.max(0, Math.floor(numberOr(value)))).padStart(6, "0");
}

function isFinished(state) {
  return Boolean(
    state?.gameOver
    || state?.finished
    || state?.status === "won"
    || state?.status === "lost"
    || state?.status === "gameover",
  );
}

function statusLabel(state) {
  if (!state) return "READY";
  if (state.status === "won") return "YOU WIN";
  if (state.status === "lost" || state.status === "gameover") return "GAME OVER";
  if (state.status === "ready") return "READY";
  if (state.status === "playing") return "PLAYING";
  return String(state.status ?? "READY").toUpperCase();
}

function instructionFor(slug, state) {
  if (isFinished(state)) return "Press Restart or Start again";
  if (slug === "block-drop") return "Arrows move · Up rotates · Space drops";
  if (slug === "brick-breaker") {
    return state?.status === "ready" ? "Move paddle · Press Launch" : "Move paddle · Keep the ball alive";
  }
  if (slug === "alien-blaster") return "Move cannon · Press Fire";
  return "Choose a direction · Clear every pellet";
}

function updateSelectorVisibility() {
  selector.hidden = !selectorVisible;
  selector.setAttribute("aria-hidden", String(!selectorVisible));
}

function updateChoiceState(focusSelected = false) {
  choices.forEach((choice, index) => {
    const isSelected = choice.dataset.game === selectedSlug;
    choice.setAttribute("aria-pressed", String(isSelected));
    if (isSelected && focusSelected) {
      try {
        choice.focus({ preventScroll: true });
      } catch {
        choice.focus();
      }
    }
    if (isSelected) choice.dataset.selectionIndex = String(index);
    else delete choice.dataset.selectionIndex;
  });
}

function updatePrimaryAction(state = stateOf(activeGame)) {
  if (selectorVisible) {
    primaryAction.textContent = "Start";
    primaryAction.setAttribute("aria-label", "Start selected game");
    return;
  }
  if (isFinished(state)) {
    primaryAction.textContent = "Restart";
    primaryAction.setAttribute("aria-label", "Restart game");
    return;
  }
  if (activeSlug === "block-drop") {
    primaryAction.textContent = "Rotate";
    primaryAction.setAttribute("aria-label", "Rotate falling block");
  } else if (activeSlug === "brick-breaker") {
    primaryAction.textContent = "Launch";
    primaryAction.setAttribute("aria-label", "Launch ball");
  } else if (activeSlug === "alien-blaster") {
    primaryAction.textContent = "Fire";
    primaryAction.setAttribute("aria-label", "Fire at aliens");
  } else {
    primaryAction.textContent = "Action";
    primaryAction.setAttribute("aria-label", "Maze action");
  }
}

function updateAccessibleStatus() {
  updateSelectorVisibility();
  updateChoiceState(false);
  updatePrimaryAction();
  highScoreDisplay.textContent = formatScore(highScore);

  if (selectorVisible) {
    creditDisplay.textContent = "READY";
    screenMessage.textContent = `${labelFor(selectedSlug)} · Press start to play`;
    return;
  }

  const state = stateOf(activeGame);
  const label = labelFor(activeSlug);
  creditDisplay.textContent = statusLabel(state);
  screenMessage.textContent = `${label} · ${instructionFor(activeSlug, state)}`;
}

function announce(message) {
  screenMessage.textContent = message;
}

function ensureAudio() {
  if (audioContext) {
    try {
      const resumeResult = typeof audioContext.resume === "function"
        ? audioContext.resume()
        : null;
      resumeResult?.catch?.(() => {});
    } catch {
      // Some browsers expose AudioContext but reject resume; sound stays optional.
    }
    return audioContext;
  }
  if (typeof window === "undefined") return null;
  const AudioConstructor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioConstructor !== "function") return null;
  try {
    audioContext = new AudioConstructor();
    const resumeResult = typeof audioContext.resume === "function"
      ? audioContext.resume()
      : null;
    resumeResult?.catch?.(() => {});
  } catch {
    audioContext = null;
  }
  return audioContext;
}

function handleUserGesture() {
  if (!muted) ensureAudio();
}

function playCue(name) {
  if (muted) return;
  if (!audioContext) return;
  const tone = CUE_TONES[name];
  if (!tone) return;
  try {
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + tone.duration + 0.01);
  } catch {
    // Audio is a progressive enhancement; a missing or blocked context is safe.
  }
}

function startLoop() {
  if (loopRunning || typeof window.requestAnimationFrame !== "function") return;
  loopRunning = true;
  lastFrameTime = null;
  animationFrameId = window.requestAnimationFrame(animationFrame);
}

function stopLoop() {
  loopRunning = false;
  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  lastFrameTime = null;
}

function clearHeldInput() {
  heldDirections.clear();
  heldKeyboardDirections.clear();
  heldPointerDirections.clear();
  lastInputDirection = null;
  blockMoveTimer = 0;
}

function refreshHeldDirections() {
  heldDirections.clear();
  for (const direction of heldKeyboardDirections) heldDirections.add(direction);
  for (const direction of heldPointerDirections.values()) heldDirections.add(direction);
  if (lastInputDirection && !heldDirections.has(lastInputDirection)) {
    lastInputDirection = [...heldDirections].at(-1) ?? null;
  }
}

function directionForKey(key) {
  if (KEY_TO_DIRECTION[key]) return KEY_TO_DIRECTION[key];
  if (typeof key === "string" && KEY_TO_DIRECTION[key.toLowerCase()]) {
    return KEY_TO_DIRECTION[key.toLowerCase()];
  }
  return null;
}

function directionHeld(direction) {
  return heldDirections.has(direction);
}

function currentDirection() {
  if (lastInputDirection && directionHeld(lastInputDirection)) return lastInputDirection;
  return ["left", "right", "up", "down"].find(directionHeld) ?? null;
}

function currentHorizontalDirection() {
  const direction = currentDirection();
  if (direction === "left" || direction === "right") return direction;
  return directionHeld("left") ? "left" : directionHeld("right") ? "right" : null;
}

function captureEventState(state) {
  return {
    score: numberOr(state?.score),
    lines: numberOr(state?.lines),
    lives: numberOr(state?.lives, -1),
    status: state?.status ?? "",
    event: state?.lastEvent ?? "",
    bricks: Array.isArray(state?.bricks) ? state.bricks.length : -1,
    aliens: Array.isArray(state?.aliens) ? state.aliens.filter((alien) => alien.alive).length : -1,
    pellets: Array.isArray(state?.pellets) ? state.pellets.length : -1,
  };
}

function recordEvents() {
  const state = stateOf(activeGame);
  const current = captureEventState(state);
  const previous = lastEventState;
  if (previous) {
    const scored = current.score > previous.score
      || (current.bricks >= 0 && current.bricks < previous.bricks)
      || (current.aliens >= 0 && current.aliens < previous.aliens)
      || (current.pellets >= 0 && current.pellets < previous.pellets);
    if (scored) playCue("score");
    if (current.lives >= 0 && previous.lives >= 0 && current.lives < previous.lives) playCue("life");
    if (previous.status !== current.status) {
      if (current.status === "won") playCue("win");
      if (current.status === "lost" || current.status === "gameover") playCue("loss");
    }
    if (current.event !== previous.event && current.event === "brick-hit") playCue("score");
  }
  lastEventState = current;
  if (current.score > highScore) highScore = current.score;
}

function moveSelection(direction) {
  const currentIndex = Math.max(0, GAME_ORDER.indexOf(selectedSlug));
  let nextIndex = currentIndex;
  if (direction === "left") nextIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
  if (direction === "right") nextIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
  if (direction === "up") nextIndex = currentIndex < 2 ? currentIndex + 2 : currentIndex - 2;
  if (direction === "down") nextIndex = currentIndex < 2 ? currentIndex + 2 : currentIndex - 2;
  nextIndex = (nextIndex + GAME_ORDER.length) % GAME_ORDER.length;
  selectGame(GAME_ORDER[nextIndex], { cue: true, focus: true });
}

function selectGame(slug, { cue = false, focus = false } = {}) {
  if (!GAME_DEFINITIONS[slug]) return false;
  selectedSlug = slug;
  updateChoiceState(focus);
  if (selectorVisible) updateAccessibleStatus();
  if (cue) playCue("select");
  return true;
}

function createActiveGame(slug) {
  const created = definitionFor(slug).create();
  const engine = created.engine;
  return {
    slug,
    engine,
    state: stateOf(engine),
  };
}

function startGame(slug) {
  if (!GAME_DEFINITIONS[slug]) return false;
  stopLoop();
  clearHeldInput();
  activeSlug = slug;
  selectedSlug = slug;
  activeGame = createActiveGame(slug);
  selectorVisible = false;
  blockGravityTimer = 0;
  blockMoveTimer = 0;
  mazeStepTimer = 0;
  lastEventState = captureEventState(stateOf(activeGame));
  updateChoiceState(false);
  updateAccessibleStatus();
  renderActiveGame();
  try {
    canvas.focus({ preventScroll: true });
  } catch {
    canvas.focus();
  }
  startLoop();
  return true;
}

function startSelectedGame({ cue = true } = {}) {
  if (!selectorVisible) return triggerPrimary();
  const started = startGame(selectedSlug);
  if (started && cue) playCue("start");
  return started;
}

function restartGame({ cue = true } = {}) {
  const slug = activeSlug ?? selectedSlug;
  if (!slug) return false;
  const restarted = startGame(slug);
  if (restarted && cue) playCue("start");
  return restarted;
}

function goHome() {
  stopLoop();
  clearHeldInput();
  activeSlug = null;
  activeGame = null;
  selectorVisible = true;
  lastEventState = null;
  updateAccessibleStatus();
  renderSelectorBackdrop();
  updateChoiceState(true);
}

function performDirectionAction(direction) {
  if (selectorVisible || !activeGame) return;
  const state = stateOf(activeGame);
  const before = captureEventState(state);
  if (isFinished(state)) return;

  if (activeSlug === "block-drop") {
    if (direction === "left") moveBlockDrop(activeGame.engine, -1);
    else if (direction === "right") moveBlockDrop(activeGame.engine, 1);
    else if (direction === "down") stepBlockDrop(activeGame.engine);
    else if (direction === "up") rotateBlockDrop(activeGame.engine, 1);
  } else if (activeSlug === "brick-breaker") {
    if (direction === "left") moveBrickBreaker(state, -1, 1 / 60);
    else if (direction === "right") moveBrickBreaker(state, 1, 1 / 60);
  } else if (activeSlug === "alien-blaster") {
    if (direction === "left") moveAlienBlaster(activeGame.engine, -1, 1 / 60);
    else if (direction === "right") moveAlienBlaster(activeGame.engine, 1, 1 / 60);
  } else if (activeSlug === "maze-muncher") {
    setMazeDirection(state, direction);
  }

  const after = captureEventState(state);
  if (after.score > before.score || after.status !== before.status) recordEvents();
  else lastEventState = after;
  playCue("move");
  renderActiveGame();
  updateAccessibleStatus();
}

function triggerPrimary({ hardDrop = false } = {}) {
  if (selectorVisible) return startSelectedGame();
  if (!activeGame) return false;
  const state = stateOf(activeGame);
  if (isFinished(state)) return restartGame();

  const before = captureEventState(state);
  if (activeSlug === "block-drop") {
    if (hardDrop) dropBlockDrop(activeGame.engine);
    else rotateBlockDrop(activeGame.engine, 1);
    playCue(hardDrop ? "launch" : "move");
  } else if (activeSlug === "brick-breaker") {
    if (state.status === "ready") {
      launchBrickBreaker(state);
      playCue("launch");
    }
  } else if (activeSlug === "alien-blaster") {
    fireAlienBlaster(activeGame.engine);
    playCue("fire");
  }

  const after = captureEventState(state);
  if (after.score > before.score || after.status !== before.status) recordEvents();
  else lastEventState = after;
  renderActiveGame();
  updateAccessibleStatus();
  return true;
}

function handleKeyDown(event) {
  const direction = directionForKey(event.key);
  const normalizedKey = typeof event.key === "string" ? event.key.toLowerCase() : event.key;

  if (direction) {
    event.preventDefault();
    if (!event.repeat) handleUserGesture();
    if (selectorVisible) {
      if (!event.repeat) moveSelection(direction);
      return;
    }
    heldKeyboardDirections.add(direction);
    lastInputDirection = direction;
    refreshHeldDirections();
    if (!event.repeat) performDirectionAction(direction);
    return;
  }

  if (ACTION_KEYS.has(event.key)) {
    event.preventDefault();
    if (event.repeat) return;
    handleUserGesture();
    triggerPrimary({ hardDrop: event.key === " " });
    return;
  }

  if (normalizedKey === "r" && activeGame) {
    event.preventDefault();
    handleUserGesture();
    restartGame();
    return;
  }

  if (event.key === "Escape" && activeGame) {
    event.preventDefault();
    handleUserGesture();
    goHome();
    return;
  }

  if (normalizedKey === "m") {
    event.preventDefault();
    handleUserGesture();
    toggleMute();
  }
}

function handleKeyUp(event) {
  const direction = directionForKey(event.key);
  if (!direction) return;
  event.preventDefault();
  heldKeyboardDirections.delete(direction);
  refreshHeldDirections();
}

function releasePointerDirection(pointerId) {
  if (pointerId === undefined || pointerId === null) return;
  heldPointerDirections.delete(pointerId);
  refreshHeldDirections();
}

function handleDirectionPointerDown(event) {
  const direction = event.currentTarget.dataset.direction;
  if (!direction) return;
  event.preventDefault();
  handleUserGesture();
  heldPointerDirections.set(event.pointerId, direction);
  lastInputDirection = direction;
  refreshHeldDirections();
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is optional; window release handlers still clear input.
  }
  performDirectionAction(direction);
}

function handleDirectionPointerRelease(event) {
  event.preventDefault();
  releasePointerDirection(event.pointerId);
  try {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  } catch {
    // A pointer can be canceled after its capture was already released.
  }
}

function updateBlockDrop(elapsed) {
  const state = stateOf(activeGame);
  if (!state || isFinished(state)) return;
  const horizontal = currentHorizontalDirection();
  if (!horizontal) {
    blockMoveTimer = 0;
  } else {
    blockMoveTimer += elapsed;
    if (blockMoveTimer >= BLOCK_REPEAT_SECONDS) {
      while (blockMoveTimer >= BLOCK_REPEAT_SECONDS) {
        moveBlockDrop(activeGame.engine, horizontal === "left" ? -1 : 1);
        blockMoveTimer -= BLOCK_REPEAT_SECONDS;
      }
    }
  }

  const softDrop = directionHeld("down");
  const gravityInterval = softDrop ? BLOCK_SOFT_DROP_SECONDS : BLOCK_GRAVITY_SECONDS;
  blockGravityTimer += elapsed;
  while (blockGravityTimer >= gravityInterval && !isFinished(state)) {
    stepBlockDrop(activeGame.engine);
    blockGravityTimer -= gravityInterval;
  }
}

function updateBrickBreaker(elapsed) {
  const state = stateOf(activeGame);
  if (!state || isFinished(state)) return;
  const direction = currentHorizontalDirection();
  moveBrickBreaker(state, direction === "left" ? -1 : direction === "right" ? 1 : 0, elapsed);
  stepBrickBreaker(state, elapsed);
}

function updateAlienBlaster(elapsed) {
  const state = stateOf(activeGame);
  if (!state || isFinished(state)) return;
  const direction = currentHorizontalDirection();
  moveAlienBlaster(activeGame.engine, direction === "left" ? -1 : direction === "right" ? 1 : 0, elapsed);
  stepAlienBlaster(activeGame.engine, elapsed);
}

function updateMazeMuncher(elapsed) {
  const state = stateOf(activeGame);
  if (!state || isFinished(state)) return;
  const direction = currentDirection();
  if (direction) setMazeDirection(state, direction);
  mazeStepTimer += elapsed;
  while (mazeStepTimer >= MAZE_STEP_SECONDS && !isFinished(state)) {
    stepMazeMuncher(state);
    mazeStepTimer -= MAZE_STEP_SECONDS;
  }
}

function updateActiveGame(elapsed) {
  if (!activeGame) return;
  if (activeSlug === "block-drop") updateBlockDrop(elapsed);
  else if (activeSlug === "brick-breaker") updateBrickBreaker(elapsed);
  else if (activeSlug === "alien-blaster") updateAlienBlaster(elapsed);
  else if (activeSlug === "maze-muncher") updateMazeMuncher(elapsed);
  recordEvents();
  updateAccessibleStatus();
}

function animationFrame(timestamp) {
  if (!loopRunning) return;
  animationFrameId = null;
  const rawElapsed = lastFrameTime === null ? 0 : (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;
  const elapsed = Number.isFinite(rawElapsed) ? rawElapsed : 0;
  const clampedElapsed = Math.min(Math.max(0, elapsed), MAX_UI_DELTA);
  updateActiveGame(clampedElapsed);
  renderActiveGame();
  if (loopRunning) animationFrameId = window.requestAnimationFrame(animationFrame);
}

function clearScreen(background = "#07171a") {
  if (!context) return;
  context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  context.fillStyle = background;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  context.strokeStyle = "rgba(91, 212, 207, 0.08)";
  context.lineWidth = 1;
  for (let x = 0; x < WORLD_WIDTH; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, WORLD_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y < WORLD_HEIGHT; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WORLD_WIDTH, y);
    context.stroke();
  }
}

function drawWorldHud(title, state, width = WORLD_WIDTH) {
  context.fillStyle = COLORS.ink;
  context.font = "bold 12px monospace";
  context.fillText(title.toUpperCase(), 12, 15);
  context.fillStyle = COLORS.gold;
  context.font = "10px monospace";
  context.fillText(`SCORE ${formatScore(state?.score)}`, 112, 15);
  const lives = state?.lives >= 0 ? String(state.lives) : "-";
  context.fillText(`LIVES ${lives}`, 224, 15);
  context.fillStyle = state?.status === "won" ? COLORS.gold : COLORS.cyan;
  context.fillText(statusLabel(state), Math.max(0, width - 78), 15);
  context.strokeStyle = "rgba(221, 255, 240, 0.28)";
  context.beginPath();
  context.moveTo(10, 22);
  context.lineTo(width - 10, 22);
  context.stroke();
}

function drawWorldMessage(message, width = WORLD_WIDTH, height = WORLD_HEIGHT) {
  context.fillStyle = "rgba(3, 12, 16, 0.82)";
  context.fillRect(24, height / 2 - 23, width - 48, 46);
  context.strokeStyle = COLORS.gold;
  context.strokeRect(24, height / 2 - 23, width - 48, 46);
  context.fillStyle = COLORS.gold;
  context.font = "bold 13px monospace";
  context.textAlign = "center";
  context.fillText(message.toUpperCase(), width / 2, height / 2 + 5);
  context.textAlign = "left";
}

function drawBlockCell(x, y, size, color) {
  context.fillStyle = color;
  context.fillRect(x + 1, y + 1, size - 2, size - 2);
  context.fillStyle = "rgba(255,255,255,0.22)";
  context.fillRect(x + 2, y + 2, size - 5, 2);
  context.fillStyle = "rgba(0,0,0,0.2)";
  context.fillRect(x + 2, y + size - 4, size - 4, 2);
}

function renderBlockDrop() {
  const state = stateOf(activeGame);
  clearScreen("#07171a");
  const cell = 16;
  const boardX = 40;
  const boardY = 27;
  const boardWidth = state.width * cell;
  const boardHeight = state.height * cell;
  context.fillStyle = "rgba(2, 9, 13, 0.86)";
  context.fillRect(boardX - 5, boardY - 5, boardWidth + 10, boardHeight + 10);
  context.strokeStyle = COLORS.cyan;
  context.strokeRect(boardX - 5, boardY - 5, boardWidth + 10, boardHeight + 10);

  for (let row = 0; row < state.height; row += 1) {
    for (let column = 0; column < state.width; column += 1) {
      const cellValue = state.board[row][column];
      context.strokeStyle = "rgba(91,212,207,0.11)";
      context.strokeRect(boardX + column * cell, boardY + row * cell, cell, cell);
      if (cellValue) {
        const colorIndex = Math.max(0, "IJLOSTZ".indexOf(cellValue));
        drawBlockCell(boardX + column * cell, boardY + row * cell, cell, COLORS.block[colorIndex]);
      }
    }
  }

  if (state.active) {
    const colorIndex = Math.max(0, "IJLOSTZ".indexOf(state.active.type));
    for (let row = 0; row < state.active.shape.length; row += 1) {
      for (let column = 0; column < state.active.shape[row].length; column += 1) {
        if (state.active.shape[row][column]) {
          drawBlockCell(
            boardX + (state.active.x + column) * cell,
            boardY + (state.active.y + row) * cell,
            cell,
            COLORS.block[colorIndex],
          );
        }
      }
    }
  }

  context.fillStyle = COLORS.ink;
  context.font = "bold 14px monospace";
  context.fillText("BLOCK DROP", 245, 42);
  context.fillStyle = COLORS.gold;
  context.font = "11px monospace";
  context.fillText(`SCORE ${formatScore(state.score)}`, 245, 69);
  context.fillText(`LINES ${String(state.lines).padStart(2, "0")}`, 245, 88);
  context.fillStyle = COLORS.muted;
  context.fillText("LIVES --", 245, 107);
  context.fillText("GRAVITY ON", 245, 141);
  context.fillText("◀ ▶ MOVE", 245, 166);
  context.fillText("▲ ROTATE", 245, 185);
  context.fillText("▼ SOFT DROP", 245, 204);
  context.fillText("SPACE HARD DROP", 245, 223);
  context.strokeStyle = "rgba(240,107,141,0.5)";
  context.strokeRect(239, 120, 199, 122);
  context.fillStyle = COLORS.cyan;
  context.font = "bold 11px monospace";
  context.fillText(statusLabel(state), 245, 273);
  context.fillStyle = COLORS.muted;
  context.font = "10px monospace";
  context.fillText("STACK THE SKYLINE", 245, 295);
  context.fillText("ONE ROW AT A TIME", 245, 311);
  if (isFinished(state)) drawWorldMessage(state.status === "won" ? "YOU WIN" : "GAME OVER", WORLD_WIDTH, WORLD_HEIGHT);
}

function drawBreakerBrick(brick, index) {
  context.fillStyle = COLORS.brick[index % COLORS.brick.length];
  context.fillRect(brick.x, brick.y, brick.width, brick.height);
  context.fillStyle = "rgba(255,255,255,0.25)";
  context.fillRect(brick.x + 1, brick.y + 1, brick.width - 2, 2);
}

function renderBrickBreaker() {
  const state = stateOf(activeGame);
  const scale = WORLD_WIDTH / state.width;
  context.save();
  context.scale(scale, scale);
  clearScreen("#08131e");
  drawWorldHud("Brick Breaker", state, state.width);
  state.bricks.forEach(drawBreakerBrick);
  context.fillStyle = COLORS.cyan;
  context.fillRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height);
  context.fillStyle = "#edffff";
  context.fillRect(state.paddle.x + 4, state.paddle.y + 2, state.paddle.width - 8, 2);
  context.fillStyle = COLORS.gold;
  context.beginPath();
  context.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = COLORS.muted;
  context.font = "10px monospace";
  context.fillText("◀ ▶ PADDLE", 12, state.height - 9);
  context.fillText(state.status === "ready" ? "SPACE / START TO LAUNCH" : "KEEP THE BALL ALIVE", 116, state.height - 9);
  if (state.status === "ready") drawWorldMessage("PRESS START", state.width, state.height);
  if (state.status === "won") drawWorldMessage("YOU WIN", state.width, state.height);
  if (state.status === "lost") drawWorldMessage("GAME OVER", state.width, state.height);
  context.restore();
}

function drawAlien(alien, index) {
  const color = index % 2 === 0 ? COLORS.pink : COLORS.cyan;
  context.fillStyle = color;
  context.fillRect(alien.x, alien.y + 2, alien.width, alien.height - 4);
  context.fillRect(alien.x + 3, alien.y, alien.width - 6, alien.height);
  context.fillStyle = "#07171a";
  context.fillRect(alien.x + 4, alien.y + 4, 3, 3);
  context.fillRect(alien.x + alien.width - 7, alien.y + 4, 3, 3);
}

function renderAlienBlaster() {
  const state = stateOf(activeGame);
  const scale = WORLD_WIDTH / state.width;
  context.save();
  context.scale(scale, scale);
  clearScreen("#070f20");
  drawWorldHud("Alien Blaster", state, state.width);
  for (let index = 0; index < 22; index += 1) {
    const x = (index * 47) % state.width;
    const y = 29 + ((index * 31) % Math.max(1, state.height - 72));
    context.fillStyle = index % 3 === 0 ? COLORS.gold : "rgba(221,255,240,0.32)";
    context.fillRect(x, y, 1, 1);
  }
  state.aliens.forEach((alien, index) => {
    if (alien.alive) drawAlien(alien, index);
  });
  context.fillStyle = COLORS.gold;
  for (const shot of state.playerShots) context.fillRect(shot.x, shot.y, shot.width, shot.height);
  context.fillStyle = COLORS.red;
  for (const shot of state.enemyShots) context.fillRect(shot.x, shot.y, shot.width, shot.height);
  context.fillStyle = COLORS.cyan;
  context.beginPath();
  context.moveTo(state.cannon.x + state.cannon.width / 2, state.cannon.y - 5);
  context.lineTo(state.cannon.x, state.cannon.y + state.cannon.height);
  context.lineTo(state.cannon.x + state.cannon.width, state.cannon.y + state.cannon.height);
  context.closePath();
  context.fill();
  context.fillStyle = COLORS.muted;
  context.font = "10px monospace";
  context.fillText("◀ ▶ CANNON", 12, state.height - 9);
  context.fillText("SPACE / START TO FIRE", 150, state.height - 9);
  if (state.status === "won") drawWorldMessage("SECTOR CLEAR", state.width, state.height);
  if (state.status === "lost") drawWorldMessage("INVASION", state.width, state.height);
  context.restore();
}

function renderMazeMuncher() {
  const state = stateOf(activeGame);
  clearScreen("#090c1d");
  drawWorldHud("Maze Muncher", state);
  const tile = state.tileSize;
  const mazeWidth = state.width * tile;
  const mazeHeight = state.height * tile;
  const offsetX = Math.floor((WORLD_WIDTH - mazeWidth) / 2);
  const offsetY = 34;

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const wall = state.map[y][x] === "#";
      const px = offsetX + x * tile;
      const py = offsetY + y * tile;
      context.fillStyle = wall ? "#193e57" : "#07131f";
      context.fillRect(px, py, tile, tile);
      context.strokeStyle = wall ? "#5bd4cf" : "rgba(91,212,207,0.08)";
      context.strokeRect(px, py, tile, tile);
    }
  }

  context.fillStyle = COLORS.gold;
  for (const pellet of state.pellets) {
    context.beginPath();
    context.arc(offsetX + pellet.x * tile + tile / 2, offsetY + pellet.y * tile + tile / 2, 3, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = COLORS.pink;
  context.beginPath();
  context.arc(offsetX + state.player.x * tile + tile / 2, offsetY + state.player.y * tile + tile / 2, tile * 0.34, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#07171a";
  context.beginPath();
  context.arc(offsetX + state.player.x * tile + tile * 0.43, offsetY + state.player.y * tile + tile * 0.42, 2, 0, Math.PI * 2);
  context.fill();

  state.enemies.forEach((enemy, index) => {
    context.fillStyle = index % 2 === 0 ? COLORS.red : COLORS.cyan;
    context.fillRect(offsetX + enemy.x * tile + 5, offsetY + enemy.y * tile + 7, tile - 10, tile - 9);
    context.fillStyle = "#07171a";
    context.fillRect(offsetX + enemy.x * tile + 9, offsetY + enemy.y * tile + 11, 3, 3);
    context.fillRect(offsetX + enemy.x * tile + tile - 12, offsetY + enemy.y * tile + 11, 3, 3);
  });

  context.fillStyle = COLORS.muted;
  context.font = "10px monospace";
  context.fillText("ARROWS / WASD TO MUNCH", 13, 343);
  context.fillText(`PELLETS ${state.pellets.length}`, 335, 343);
  if (state.status === "won") drawWorldMessage("MAZE CLEARED", WORLD_WIDTH, WORLD_HEIGHT);
  if (state.status === "lost") drawWorldMessage("CAUGHT", WORLD_WIDTH, WORLD_HEIGHT);
}

function renderSelectorBackdrop() {
  clearScreen("#07171a");
  context.fillStyle = COLORS.cyan;
  context.font = "bold 25px monospace";
  context.textAlign = "center";
  context.fillText("CLASSIC ARCADE", WORLD_WIDTH / 2, 124);
  context.fillStyle = COLORS.gold;
  context.font = "12px monospace";
  context.fillText("FOUR GAMES · ONE CABINET", WORLD_WIDTH / 2, 153);
  context.fillStyle = COLORS.muted;
  context.font = "11px monospace";
  context.fillText("SELECT YOUR CHALLENGE", WORLD_WIDTH / 2, 226);
  context.textAlign = "left";
}

function renderActiveGame() {
  if (!context || selectorVisible || !activeGame) return;
  switch (activeSlug) {
    case "block-drop":
      renderBlockDrop();
      break;
    case "brick-breaker":
      renderBrickBreaker();
      break;
    case "alien-blaster":
      renderAlienBlaster();
      break;
    case "maze-muncher":
      renderMazeMuncher();
      break;
    default:
      renderSelectorBackdrop();
  }
}

function toggleMute() {
  muted = !muted;
  soundToggle.textContent = muted ? "Sound: Off" : "Sound: On";
  soundToggle.setAttribute("aria-pressed", String(muted));
  soundToggle.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  announce(muted ? "Sound muted" : "Sound on");
}

function snapshotForTest() {
  const state = stateOf(activeGame);
  if (!state || !activeSlug) return null;
  let snapshot;
  if (activeSlug === "block-drop") {
    snapshot = {
      slug: activeSlug,
      width: state.width,
      height: state.height,
      score: state.score,
      lines: state.lines,
      status: state.status,
      gameOver: state.gameOver,
      board: state.board.map((row) => [...row]),
      active: state.active
        ? {
          type: state.active.type,
          x: state.active.x,
          y: state.active.y,
          rotation: state.active.rotation,
          shape: state.active.shape.map((row) => [...row]),
        }
        : null,
    };
  } else if (activeSlug === "brick-breaker") {
    snapshot = {
      slug: activeSlug,
      width: state.width,
      height: state.height,
      score: state.score,
      lives: state.lives,
      status: state.status,
      launched: state.launched,
      gameOver: state.gameOver,
      paddle: { ...state.paddle },
      ball: { ...state.ball },
      bricks: state.bricks.map((brick) => ({ ...brick })),
    };
  } else if (activeSlug === "alien-blaster") {
    snapshot = {
      slug: activeSlug,
      width: state.width,
      height: state.height,
      score: state.score,
      lives: state.lives,
      status: state.status,
      finished: state.finished,
      cannon: { ...state.cannon },
      aliens: state.aliens.map((alien) => ({ ...alien })),
      playerShots: state.playerShots.map((shot) => ({ ...shot })),
      enemyShots: state.enemyShots.map((shot) => ({ ...shot })),
    };
  } else {
    snapshot = {
      slug: activeSlug,
      width: state.width,
      height: state.height,
      tileSize: state.tileSize,
      score: state.score,
      lives: state.lives,
      status: state.status,
      gameOver: state.gameOver,
      map: [...state.map],
      player: { ...state.player },
      enemies: state.enemies.map((enemy) => ({ ...enemy })),
      pellets: state.pellets.map((pellet) => ({ ...pellet })),
    };
  }
  freezeDeep(snapshot);
  return Object.freeze(snapshot);
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function hookPressDirection(direction) {
  if (!GAME_ORDER.includes(activeSlug) || !["up", "right", "down", "left"].includes(direction)) return;
  handleUserGesture();
  heldKeyboardDirections.add(direction);
  lastInputDirection = direction;
  refreshHeldDirections();
  performDirectionAction(direction);
}

function hookReleaseDirection(direction) {
  heldKeyboardDirections.delete(direction);
  refreshHeldDirections();
}

window.__ARCADE_TEST__ = Object.freeze({
  get activeGame() {
    return activeSlug;
  },
  get selector() {
    return selectorVisible;
  },
  get paused() {
    return Boolean(activeSlug && !loopRunning);
  },
  get muted() {
    return muted;
  },
  snapshot: snapshotForTest,
  actions: Object.freeze({
    selectGame: (slug) => selectGame(slug),
    start: () => startSelectedGame({ cue: false }),
    restart: () => restartGame({ cue: false }),
    home: () => goHome(),
    toggleMute,
    pressDirection: hookPressDirection,
    releaseDirection: hookReleaseDirection,
  }),
});

choices.forEach((choice) => {
  choice.addEventListener("click", () => {
    handleUserGesture();
    selectGame(choice.dataset.game, { cue: true, focus: true });
  });
});

directionButtons.forEach((button) => {
  // touch-action: none keeps a held direction from scrolling the page.
  button.style.touchAction = "none";
  button.addEventListener("pointerdown", handleDirectionPointerDown);
  button.addEventListener("pointerup", handleDirectionPointerRelease);
  button.addEventListener("pointercancel", handleDirectionPointerRelease);
  button.addEventListener("lostpointercapture", handleDirectionPointerRelease);
});

primaryAction.addEventListener("click", () => {
  handleUserGesture();
  triggerPrimary();
});
restartButton.addEventListener("click", () => {
  handleUserGesture();
  restartGame();
});
homeButton.addEventListener("click", () => {
  handleUserGesture();
  goHome();
});
soundToggle.addEventListener("click", () => {
  handleUserGesture();
  toggleMute();
});
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("pointerup", (event) => releasePointerDirection(event.pointerId));
window.addEventListener("pointercancel", (event) => releasePointerDirection(event.pointerId));
window.addEventListener("blur", clearHeldInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearHeldInput();
});

canvas.tabIndex = 0;
canvas.setAttribute("role", "img");
canvas.setAttribute("aria-label", "Arcade game screen");
selectorVisible = true;
updateAccessibleStatus();
renderSelectorBackdrop();
