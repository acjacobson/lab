const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;
const DEFAULT_FIXED_STEP = 1 / 60;
const DEFAULT_LIVES = 3;
const DEFAULT_BRICK_ROWS = 5;
const DEFAULT_BRICK_COLUMNS = 8;
const DEFAULT_BRICK_VALUE = 10;
const DEFAULT_PADDLE_WIDTH = 64;
const DEFAULT_PADDLE_HEIGHT = 10;
const DEFAULT_PADDLE_SPEED = 240;
const DEFAULT_BALL_RADIUS = 4;
const DEFAULT_BALL_SPEED = 180;
const EPSILON = 1e-12;

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("Brick Breaker state is required");
  }
  if (candidate.state && !candidate.ball) return candidate.state;
  return candidate;
}

function setStatus(state, status) {
  state.status = status;
  state.phase = status;
  state.won = status === "won";
  state.lost = status === "lost";
  state.gameOver = state.won || state.lost;
  state.launched = Boolean(state.ball?.launched);
}

function makeBricks(options, width, columns, rows) {
  if (Array.isArray(options.bricks)) {
    return options.bricks.map((brick, index) => ({
      id: brick.id ?? index,
      row: brick.row ?? Math.floor(index / Math.max(1, columns)),
      column: brick.column ?? index % Math.max(1, columns),
      x: Number(brick.x) || 0,
      y: Number(brick.y) || 0,
      width: finitePositive(Number(brick.width), 24),
      height: finitePositive(Number(brick.height), 14),
      value: finitePositive(Number(brick.value), DEFAULT_BRICK_VALUE),
    }));
  }

  const sidePadding = finitePositive(Number(options.brickSidePadding), 16);
  const gapX = Number.isFinite(options.brickGapX) ? Math.max(0, options.brickGapX) : 4;
  const gapY = Number.isFinite(options.brickGapY) ? Math.max(0, options.brickGapY) : 6;
  const defaultWidth = (width - sidePadding * 2 - gapX * Math.max(0, columns - 1)) / Math.max(1, columns);
  const brickWidth = finitePositive(Number(options.brickWidth), defaultWidth);
  const brickHeight = finitePositive(Number(options.brickHeight), 14);
  const brickTop = Number.isFinite(options.brickTop) ? options.brickTop : 24;
  const value = finitePositive(Number(options.brickValue), DEFAULT_BRICK_VALUE);
  const bricks = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      bricks.push({
        id: `${row}-${column}`,
        row,
        column,
        x: sidePadding + column * (brickWidth + gapX),
        y: brickTop + row * (brickHeight + gapY),
        width: brickWidth,
        height: brickHeight,
        value,
      });
    }
  }
  return bricks;
}

function directionValue(direction) {
  if (typeof direction === "string") {
    const normalized = direction.toLowerCase();
    if (["left", "l", "a", "arrowleft"].includes(normalized)) return -1;
    if (["right", "r", "d", "arrowright"].includes(normalized)) return 1;
    return 0;
  }
  if (direction && typeof direction === "object") return directionValue(direction.x);
  const numeric = Number(direction);
  return numeric < 0 ? -1 : numeric > 0 ? 1 : 0;
}

function circleIntersectsRectangle(x, y, radius, rectangle) {
  const closestX = clamp(x, rectangle.x, rectangle.x + rectangle.width);
  const closestY = clamp(y, rectangle.y, rectangle.y + rectangle.height);
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function segmentIntersectsRectangle(x1, y1, x2, y2, left, top, right, bottom) {
  let tMin = 0;
  let tMax = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;

  for (const [origin, delta, minimum, maximum] of [
    [x1, dx, left, right],
    [y1, dy, top, bottom],
  ]) {
    if (Math.abs(delta) < EPSILON) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    const entry = Math.min(first, second);
    const exit = Math.max(first, second);
    tMin = Math.max(tMin, entry);
    tMax = Math.min(tMax, exit);
    if (tMin > tMax) return false;
  }
  return true;
}

function ballTouchesBrick(previous, next, ball, brick) {
  if (circleIntersectsRectangle(next.x, next.y, ball.radius, brick)) return true;
  return segmentIntersectsRectangle(
    previous.x,
    previous.y,
    next.x,
    next.y,
    brick.x - ball.radius,
    brick.y - ball.radius,
    brick.x + brick.width + ball.radius,
    brick.y + brick.height + ball.radius,
  );
}

function resetRound(state) {
  state.paddle.x = state.width / 2 - state.paddle.width / 2;
  state.paddle.x = clamp(state.paddle.x, 0, state.width - state.paddle.width);
  state.paddle.dx = 0;
  state.ball.x = state.paddle.x + state.paddle.width / 2;
  state.ball.y = state.paddle.y - state.ball.radius - 1;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.launched = false;
  state.accumulator = 0;
  state.launched = false;
}

function loseLife(state) {
  state.lives = Math.max(0, state.lives - 1);
  state.lastEvent = "life-lost";
  resetRound(state);
  setStatus(state, state.lives === 0 ? "lost" : "ready");
}

function reflectFromPaddle(state, nextX) {
  const ball = state.ball;
  const paddle = state.paddle;
  const relativeHit = clamp(
    (nextX - (paddle.x + paddle.width / 2)) / (paddle.width / 2 || 1),
    -1,
    1,
  );
  const speed = Math.max(Math.hypot(ball.vx, ball.vy), ball.speed);
  const horizontalSpeed = relativeHit * speed * 0.8;
  const verticalSpeed = Math.sqrt(Math.max(1, speed * speed - horizontalSpeed * horizontalSpeed));
  ball.vx = horizontalSpeed;
  ball.vy = -verticalSpeed;
  state.lastEvent = "paddle-hit";
}

function removeHitBrick(state, previous, nextX, nextY) {
  const ball = state.ball;
  for (let index = 0; index < state.bricks.length; index += 1) {
    const brick = state.bricks[index];
    const next = { x: nextX, y: nextY };
    if (!ballTouchesBrick(previous, next, ball, brick)) continue;

    state.bricks.splice(index, 1);
    state.score += brick.value;
    state.lastEvent = "brick-hit";

    const brickBottom = brick.y + brick.height;
    if (previous.y + ball.radius <= brick.y && nextY + ball.radius >= brick.y) {
      ball.vy = -Math.abs(ball.vy);
      nextY = brick.y - ball.radius;
    } else if (previous.y - ball.radius >= brickBottom && nextY - ball.radius <= brickBottom) {
      ball.vy = Math.abs(ball.vy);
      nextY = brickBottom + ball.radius;
    } else if (previous.x + ball.radius <= brick.x && nextX + ball.radius >= brick.x) {
      ball.vx = -Math.abs(ball.vx);
      nextX = brick.x - ball.radius;
    } else if (previous.x - ball.radius >= brick.x + brick.width && nextX - ball.radius <= brick.x + brick.width) {
      ball.vx = Math.abs(ball.vx);
      nextX = brick.x + brick.width + ball.radius;
    } else if (Math.abs(ball.vx) > Math.abs(ball.vy)) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }
    return { x: nextX, y: nextY };
  }
  return { x: nextX, y: nextY };
}

function simulateFixedStep(state, deltaSeconds) {
  const ball = state.ball;
  const paddle = state.paddle;
  const previous = { x: ball.x, y: ball.y };
  let nextX = ball.x + ball.vx * deltaSeconds;
  let nextY = ball.y + ball.vy * deltaSeconds;

  if (nextX - ball.radius < 0) {
    nextX = ball.radius;
    ball.vx = Math.abs(ball.vx);
    state.lastEvent = "wall-hit";
  } else if (nextX + ball.radius > state.width) {
    nextX = state.width - ball.radius;
    ball.vx = -Math.abs(ball.vx);
    state.lastEvent = "wall-hit";
  }

  if (nextY - ball.radius < 0) {
    nextY = ball.radius;
    ball.vy = Math.abs(ball.vy);
    state.lastEvent = "wall-hit";
  }

  if (nextY - ball.radius > state.height) {
    loseLife(state);
    return;
  }

  if (
    ball.vy > 0 &&
    previous.y + ball.radius <= paddle.y &&
    nextY + ball.radius >= paddle.y &&
    nextX + ball.radius >= paddle.x &&
    nextX - ball.radius <= paddle.x + paddle.width
  ) {
    nextY = paddle.y - ball.radius;
    reflectFromPaddle(state, nextX);
  }

  const resolved = removeHitBrick(state, previous, nextX, nextY);
  nextX = resolved.x;
  nextY = resolved.y;
  ball.x = nextX;
  ball.y = nextY;

  if (state.bricks.length === 0) {
    ball.launched = false;
    setStatus(state, "won");
    state.lastEvent = "win";
  }
}

/**
 * Create a mutable, deterministic Brick Breaker state for a Canvas renderer.
 * The default board has 8 columns, 5 rows, and 3 lives.
 */
export function createBrickBreaker(options = {}) {
  const settings = options ?? {};
  const width = finitePositive(Number(settings.width), DEFAULT_WIDTH);
  const height = finitePositive(Number(settings.height), DEFAULT_HEIGHT);
  const rows = nonNegativeInteger(settings.brickRows ?? settings.rows, DEFAULT_BRICK_ROWS);
  const columns = positiveInteger(settings.brickColumns ?? settings.columns, DEFAULT_BRICK_COLUMNS);
  const lives = positiveInteger(settings.lives, DEFAULT_LIVES);
  const fixedStep = finitePositive(Number(settings.fixedStep), DEFAULT_FIXED_STEP);
  const paddleHeight = finitePositive(Number(settings.paddleHeight), DEFAULT_PADDLE_HEIGHT);
  const paddleWidth = clamp(
    finitePositive(Number(settings.paddleWidth), DEFAULT_PADDLE_WIDTH),
    1,
    width,
  );
  const paddleY = clamp(
    Number.isFinite(settings.paddleY) ? settings.paddleY : height - paddleHeight - 14,
    0,
    Math.max(0, height - paddleHeight),
  );
  const ballRadius = finitePositive(Number(settings.ballRadius), DEFAULT_BALL_RADIUS);
  const ballSpeed = finitePositive(Number(settings.ballSpeed), DEFAULT_BALL_SPEED);
  const bricks = makeBricks(settings, width, columns, rows);
  const state = {
    width,
    height,
    fixedStep,
    accumulator: 0,
    lives,
    score: 0,
    status: "ready",
    phase: "ready",
    won: false,
    lost: false,
    gameOver: false,
    launched: false,
    lastEvent: "ready",
    brickRows: rows,
    brickColumns: columns,
    paddle: {
      x: width / 2 - paddleWidth / 2,
      y: paddleY,
      width: paddleWidth,
      height: paddleHeight,
      speed: finitePositive(Number(settings.paddleSpeed), DEFAULT_PADDLE_SPEED),
      dx: 0,
    },
    ball: {
      x: 0,
      y: 0,
      radius: ballRadius,
      speed: ballSpeed,
      vx: 0,
      vy: 0,
      launched: false,
    },
    bricks,
  };
  resetRound(state);
  return state;
}

/** Move the paddle by a signed direction (-1/1) for one optional time span. */
export function moveBrickBreaker(candidate, direction, deltaSeconds) {
  const state = resolveState(candidate);
  if (state.status === "won" || state.status === "lost") return state;

  const directionSign = directionValue(direction);
  const delta = deltaSeconds === undefined
    ? state.fixedStep
    : Math.max(0, Number(deltaSeconds) || 0);
  state.paddle.dx = directionSign * state.paddle.speed;
  state.paddle.x = clamp(
    state.paddle.x + directionSign * state.paddle.speed * delta,
    0,
    state.width - state.paddle.width,
  );
  if (state.status === "ready") {
    state.ball.x = state.paddle.x + state.paddle.width / 2;
  }
  return state;
}

/** Launch the ball from the centered paddle; launching is ignored after an ending. */
export function launchBrickBreaker(candidate) {
  const state = resolveState(candidate);
  if (state.status !== "ready") return state;

  state.ball.x = state.paddle.x + state.paddle.width / 2;
  state.ball.y = state.paddle.y - state.ball.radius - 1;
  const launchHorizontal = Number.isFinite(state.launchHorizontal)
    ? state.launchHorizontal
    : state.ball.speed * 0.6;
  const launchVertical = Math.sqrt(Math.max(1, state.ball.speed ** 2 - launchHorizontal ** 2));
  state.ball.vx = launchHorizontal;
  state.ball.vy = -launchVertical;
  state.ball.launched = true;
  state.lastEvent = "launch";
  setStatus(state, "playing");
  return state;
}

/**
 * Advance the game by elapsed seconds. Elapsed time is accumulated and consumed
 * only in fixed-size simulation steps, so equivalent frame chunking is stable.
 */
export function stepBrickBreaker(candidate, elapsedSeconds = undefined) {
  const state = resolveState(candidate);
  if (state.status !== "playing") return state;

  const elapsed = elapsedSeconds === undefined
    ? state.fixedStep
    : Math.max(0, Number(elapsedSeconds) || 0);
  state.accumulator += elapsed;

  while (state.accumulator + EPSILON >= state.fixedStep && state.status === "playing") {
    state.accumulator -= state.fixedStep;
    if (Math.abs(state.accumulator) < EPSILON) state.accumulator = 0;
    state.ball.launched = true;
    simulateFixedStep(state, state.fixedStep);
  }
  state.launched = Boolean(state.ball.launched);
  return state;
}
