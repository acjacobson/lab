const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;
const DEFAULT_ROWS = 3;
const DEFAULT_COLUMNS = 6;
const DEFAULT_ALIEN_WIDTH = 18;
const DEFAULT_ALIEN_HEIGHT = 12;
const DEFAULT_ALIEN_GAP_X = 8;
const DEFAULT_ALIEN_GAP_Y = 8;
const DEFAULT_FORMATION_X = 32;
const DEFAULT_FORMATION_Y = 24;
const DEFAULT_FORMATION_SPEED = 24;
const DEFAULT_FORMATION_STEP_DOWN = 12;
const DEFAULT_CANNON_WIDTH = 28;
const DEFAULT_CANNON_HEIGHT = 10;
const DEFAULT_CANNON_SPEED = 180;
const DEFAULT_PLAYER_SHOT_SPEED = 240;
const DEFAULT_ENEMY_SHOT_SPEED = 130;
const DEFAULT_ENEMY_SHOT_INTERVAL = 1.2;
const DEFAULT_ENEMY_FIRE_CHANCE = 0.35;
const DEFAULT_LIVES = 3;
const DEFAULT_ALIEN_POINTS = 10;
const DEFAULT_FIXED_STEP = 1 / 60;
const MIN_FIXED_STEP = 1 / 1000;
const MAX_FIXED_STEPS_PER_CALL = 32;
// Browser frame gaps longer than this are intentionally discarded rather than
// replayed as an unbounded catch-up loop on the main thread.
const MAX_ELAPSED_SECONDS = 0.5;
const MIN_ENEMY_FIRE_INTERVAL = 1 / 120;
const MAX_AUTOMATIC_ENEMY_FIRE_EVENTS = 8;
const EPSILON = 1e-10;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.floor(finiteNumber(value, fallback));
  return Math.max(1, number);
}

function nonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function elapsedValue(value, fallback = DEFAULT_FIXED_STEP) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (Number.isNaN(number)) return 0;
  return Math.max(0, number);
}

function enemyFireIntervalValue(value) {
  if (value === undefined) return DEFAULT_ENEMY_SHOT_INTERVAL;
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_ENEMY_SHOT_INTERVAL;
  if (number <= 0) return 0;
  return Math.max(MIN_ENEMY_FIRE_INTERVAL, number);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function aliveAliens(game) {
  return game.aliens.filter((alien) => alien.alive);
}

function rectangle(entity) {
  return {
    x: finiteNumber(entity?.x, 0),
    y: finiteNumber(entity?.y, 0),
    width: nonNegative(entity?.width, 1) || 1,
    height: nonNegative(entity?.height, 1) || 1,
  };
}

function overlaps(first, second) {
  return (
    first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y
  );
}

/**
 * Return the first normalized time at which two moving rectangles overlap.
 * The relative-motion slab test follows the actual segment, unlike the union
 * of endpoint rectangles which can report a collision around a diagonal path.
 */
function sweptAabbTime(previousShot, currentShot, previousTarget, currentTarget) {
  const shotBefore = rectangle(previousShot);
  const shotAfter = rectangle(currentShot);
  const targetBefore = rectangle(previousTarget);
  const targetAfter = rectangle(currentTarget);

  if (overlaps(shotBefore, targetBefore)) return 0;

  const shotWidth = Math.max(shotBefore.width, shotAfter.width);
  const shotHeight = Math.max(shotBefore.height, shotAfter.height);
  const targetWidth = Math.max(targetBefore.width, targetAfter.width);
  const targetHeight = Math.max(targetBefore.height, targetAfter.height);
  const relativeStartX = shotBefore.x - targetBefore.x;
  const relativeStartY = shotBefore.y - targetBefore.y;
  const relativeDeltaX = (
    (shotAfter.x - shotBefore.x)
    - (targetAfter.x - targetBefore.x)
  );
  const relativeDeltaY = (
    (shotAfter.y - shotBefore.y)
    - (targetAfter.y - targetBefore.y)
  );
  let entry = 0;
  let exit = 1;

  for (const [origin, delta, minimum, maximum] of [
    [relativeStartX, relativeDeltaX, -shotWidth, targetWidth],
    [relativeStartY, relativeDeltaY, -shotHeight, targetHeight],
  ]) {
    if (Math.abs(delta) <= EPSILON) {
      if (origin < minimum - EPSILON || origin > maximum + EPSILON) return null;
      continue;
    }

    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit + EPSILON) return null;
  }

  if (exit < -EPSILON || entry > 1 + EPSILON) return null;
  return clamp(entry, 0, 1);
}

function directionValue(input) {
  if (typeof input === "number") return Number.isFinite(input) ? Math.sign(input) : 0;
  if (typeof input === "string") {
    if (["left", "west", "a", "-1"].includes(input.toLowerCase())) return -1;
    if (["right", "east", "d", "1"].includes(input.toLowerCase())) return 1;
    return 0;
  }
  if (input && typeof input === "object") {
    if (Number.isFinite(Number(input.x))) return Math.sign(Number(input.x));
    if (Number.isFinite(Number(input.direction))) return Math.sign(Number(input.direction));
  }
  return 0;
}

function stepInput(deltaOrInput, maybeInput) {
  if (Array.isArray(deltaOrInput)) {
    return { deltaSeconds: DEFAULT_FIXED_STEP, input: { enemyFire: deltaOrInput } };
  }
  if (deltaOrInput && typeof deltaOrInput === "object") {
    return {
      deltaSeconds: elapsedValue(
        deltaOrInput.deltaSeconds ?? deltaOrInput.dt ?? deltaOrInput.delta,
      ),
      input: deltaOrInput,
    };
  }

  const deltaSeconds = elapsedValue(deltaOrInput);
  if (maybeInput && typeof maybeInput === "object" && !Array.isArray(maybeInput)) {
    return { deltaSeconds, input: maybeInput };
  }
  if (typeof maybeInput === "boolean" || Array.isArray(maybeInput)) {
    return { deltaSeconds, input: { enemyFire: maybeInput } };
  }
  return { deltaSeconds, input: {} };
}

function randomValue(game) {
  const value = finiteNumber(game.rng(), 0.5);
  // Math.random() is [0, 1), but injected replay sources can return 1.
  // Keep that endpoint usable for the final candidate in a selection.
  return clamp(value, 0, 1 - Number.EPSILON);
}

function endGame(game, status) {
  game.status = status;
  game.finished = true;
  game.won = status === "won";
  game.lost = status === "lost";
  return game;
}

function chooseEnemyAlien(game) {
  const candidates = aliveAliens(game);
  if (candidates.length === 0) return null;

  // Prefer aliens on the lowest visible row, then use the injected source to
  // make the choice deterministic when a caller wants to replay a game.
  const lowestY = Math.max(...candidates.map((alien) => alien.y));
  const lowest = candidates.filter((alien) => alien.y === lowestY);
  const index = Math.min(lowest.length - 1, Math.floor(randomValue(game) * lowest.length));
  return lowest[index];
}

function makeEnemyShot(game, specification = true) {
  const source = specification && typeof specification === "object" && !Array.isArray(specification)
    ? specification
    : null;
  const alien = source?.alienIndex === undefined ? chooseEnemyAlien(game) : game.aliens[source.alienIndex];
  const width = nonNegative(source?.width, 3) || 3;
  const height = nonNegative(source?.height, 8) || 8;

  if (source && Number.isFinite(Number(source.x)) && Number.isFinite(Number(source.y))) {
    return {
      x: Number(source.x),
      y: Number(source.y),
      width,
      height,
      vx: finiteNumber(source.vx, 0),
      vy: finiteNumber(source.vy, game.enemyShotSpeed),
    };
  }
  if (!alien || !alien.alive) return null;

  return {
    x: alien.x + alien.width / 2 - width / 2,
    y: alien.y + alien.height,
    width,
    height,
    vx: finiteNumber(source?.vx, 0),
    vy: finiteNumber(source?.vy, game.enemyShotSpeed),
  };
}

function addEnemyFire(game, specification) {
  if (Array.isArray(specification)) {
    for (const item of specification) {
      const shot = makeEnemyShot(game, item);
      if (shot) game.enemyShots.push(shot);
    }
    return;
  }
  if (!specification) return;
  const shot = makeEnemyShot(game, specification);
  if (shot) game.enemyShots.push(shot);
}

function randomEnemyFire(game, deltaSeconds, budget) {
  if (!game.enemyFireEnabled || game.enemyFireInterval <= 0 || deltaSeconds <= 0) return;
  const interval = game.enemyFireInterval;
  const timer = nonNegative(game.enemyFireTimer, 0) + deltaSeconds;
  const due = Math.floor((timer + EPSILON) / interval);
  if (due <= 0) {
    game.enemyFireTimer = timer;
    return;
  }

  // Consume the whole elapsed interval, even when the safety budget is hit, so
  // a long tab suspension cannot leave an unbounded backlog for later frames.
  game.enemyFireTimer = Math.max(0, timer - due * interval);
  const available = budget?.remaining ?? MAX_AUTOMATIC_ENEMY_FIRE_EVENTS;
  const events = Math.min(due, available);
  for (let index = 0; index < events; index += 1) {
    if (randomValue(game) < game.enemyFireChance) addEnemyFire(game, true);
  }
  if (budget) budget.remaining -= events;
}

function moveFormation(game, deltaSeconds) {
  const living = aliveAliens(game);
  if (living.length === 0 || game.formation.speed === 0 || deltaSeconds === 0) return;

  const intendedDelta = game.formation.direction * game.formation.speed * deltaSeconds;
  const nextLeft = Math.min(...living.map((alien) => alien.x + intendedDelta));
  const nextRight = Math.max(...living.map((alien) => alien.x + intendedDelta + alien.width));
  const hitLeft = nextLeft <= game.formation.edgePadding;
  const hitRight = nextRight >= game.width - game.formation.edgePadding;

  let actualDelta = intendedDelta;
  if (hitLeft || hitRight) {
    game.formation.direction *= -1;
    for (const alien of living) alien.y += game.formation.stepDown;
    game.formation.y += game.formation.stepDown;

    if (hitLeft) actualDelta += game.formation.edgePadding - nextLeft;
    if (hitRight) actualDelta += game.width - game.formation.edgePadding - nextRight;
  }

  for (const alien of living) alien.x = finiteNumber(alien.x + actualDelta, alien.x);
  game.formation.x = finiteNumber(game.formation.x + actualDelta, game.formation.x);
}

function moveShots(game, deltaSeconds) {
  for (const shot of game.playerShots) {
    const previous = rectangle(shot);
    shot.x = finiteNumber(previous.x + finiteNumber(shot.vx, 0) * deltaSeconds, previous.x);
    shot.y = finiteNumber(previous.y + finiteNumber(shot.vy, 0) * deltaSeconds, previous.y);
    shot.previous = previous;
  }
  for (const shot of game.enemyShots) {
    const previous = rectangle(shot);
    shot.x = finiteNumber(previous.x + finiteNumber(shot.vx, 0) * deltaSeconds, previous.x);
    shot.y = finiteNumber(previous.y + finiteNumber(shot.vy, 0) * deltaSeconds, previous.y);
    shot.previous = previous;
  }
}

function shotDistanceAlongPath(previousShot, currentShot, target) {
  const dx = currentShot.x - previousShot.x;
  const dy = currentShot.y - previousShot.y;
  const length = Math.hypot(dx, dy);
  const shotCenterX = previousShot.x + previousShot.width / 2;
  const shotCenterY = previousShot.y + previousShot.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  if (length <= EPSILON) return Math.hypot(targetCenterX - shotCenterX, targetCenterY - shotCenterY);
  return ((targetCenterX - shotCenterX) * dx + (targetCenterY - shotCenterY) * dy) / length;
}

function resolvePlayerShots(game, previousAliens) {
  for (let shotIndex = game.playerShots.length - 1; shotIndex >= 0; shotIndex -= 1) {
    const shot = game.playerShots[shotIndex];
    const previous = shot.previous ?? rectangle(shot);
    const current = rectangle(shot);
    let target = null;
    let targetTime = Infinity;
    let targetDistance = Infinity;

    for (let alienIndex = 0; alienIndex < game.aliens.length; alienIndex += 1) {
      const alien = game.aliens[alienIndex];
      if (!alien.alive) continue;
      const previousAlien = previousAliens?.[alienIndex] ?? rectangle(alien);
      const collisionTime = sweptAabbTime(previous, current, previousAlien, rectangle(alien));
      if (collisionTime === null) continue;
      const distance = shotDistanceAlongPath(previous, current, previousAlien);
      if (
        collisionTime < targetTime - EPSILON
        || (Math.abs(collisionTime - targetTime) <= EPSILON && distance < targetDistance)
      ) {
        target = alien;
        targetTime = collisionTime;
        targetDistance = distance;
      }
    }

    if (target) {
      target.alive = false;
      game.score += game.alienPoints;
      game.playerShots.splice(shotIndex, 1);
      if (aliveAliens(game).length === 0) endGame(game, "won");
      continue;
    }

    if (current.y + current.height < 0 || current.y > game.height || current.x + current.width < 0 || current.x > game.width) {
      game.playerShots.splice(shotIndex, 1);
    }
  }
}

function resetCannonMotion(game) {
  game.cannon.previousX = game.cannon.x;
  game.cannon.previousY = game.cannon.y;
  game.cannon.motionStartX = game.cannon.x;
  game.cannon.motionStartY = game.cannon.y;
  game.cannon.motionPending = false;
}

function resolveEnemyShots(game, previousCannon, currentCannon) {
  for (let shotIndex = game.enemyShots.length - 1; shotIndex >= 0; shotIndex -= 1) {
    const shot = game.enemyShots[shotIndex];
    const previous = shot.previous ?? rectangle(shot);
    if (sweptAabbTime(previous, rectangle(shot), previousCannon, currentCannon) !== null) {
      game.enemyShots.splice(shotIndex, 1);
      game.lives = Math.max(0, game.lives - 1);
      if (game.lives === 0) {
        endGame(game, "lost");
      } else {
        game.cannon.x = game.initialCannonX;
        game.cannon.y = game.initialCannonY;
        game.playerShots.length = 0;
        game.enemyShots.length = 0;
        resetCannonMotion(game);
      }
      return true;
    }

    const current = rectangle(shot);
    if (current.y > game.height || current.x + current.width < 0 || current.x > game.width) {
      game.enemyShots.splice(shotIndex, 1);
    }
  }
  return false;
}

function formationReachedCannon(game) {
  return aliveAliens(game).some((alien) => alien.y + alien.height >= game.cannon.y);
}

function interpolateRectangle(start, end, progress) {
  const ratio = clamp(progress, 0, 1);
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
    width: end.width,
    height: end.height,
  };
}

function cannonMotion(game) {
  const current = rectangle(game.cannon);
  const start = game.cannon.motionPending
    ? {
      x: finiteNumber(game.cannon.motionStartX, current.x),
      y: finiteNumber(game.cannon.motionStartY, current.y),
      width: current.width,
      height: current.height,
    }
    : {
      x: finiteNumber(game.cannon.previousX, current.x),
      y: finiteNumber(game.cannon.previousY, current.y),
      width: current.width,
      height: current.height,
    };
  return { start, end: current };
}

function simulateFixedStep(game, deltaSeconds, previousCannon, currentCannon) {
  const previousAliens = game.aliens.map((alien) => rectangle(alien));
  moveFormation(game, deltaSeconds);
  moveShots(game, deltaSeconds);
  resolvePlayerShots(game, previousAliens);
  if (game.finished) return false;
  if (resolveEnemyShots(game, previousCannon, currentCannon)) return false;
  if (formationReachedCannon(game)) {
    endGame(game, "lost");
    return false;
  }
  return true;
}

export function createAlienBlaster(options = {}) {
  const width = nonNegative(options.width, DEFAULT_WIDTH) || DEFAULT_WIDTH;
  const height = nonNegative(options.height, DEFAULT_HEIGHT) || DEFAULT_HEIGHT;
  const formationOptions = options.formation && typeof options.formation === "object" ? options.formation : {};
  const cannonOptions = options.cannon && typeof options.cannon === "object" ? options.cannon : {};
  const rows = positiveInteger(options.rows ?? options.formationRows ?? formationOptions.rows, DEFAULT_ROWS);
  const columns = positiveInteger(options.columns ?? options.formationColumns ?? formationOptions.columns, DEFAULT_COLUMNS);
  const alienWidth = nonNegative(options.alienWidth, DEFAULT_ALIEN_WIDTH) || DEFAULT_ALIEN_WIDTH;
  const alienHeight = nonNegative(options.alienHeight, DEFAULT_ALIEN_HEIGHT) || DEFAULT_ALIEN_HEIGHT;
  const alienGapX = nonNegative(options.alienGapX ?? options.alienSpacingX, DEFAULT_ALIEN_GAP_X);
  const alienGapY = nonNegative(options.alienGapY ?? options.alienSpacingY, DEFAULT_ALIEN_GAP_Y);
  const formationX = finiteNumber(options.formationX ?? formationOptions.x, DEFAULT_FORMATION_X);
  const formationY = finiteNumber(options.formationY ?? formationOptions.y, DEFAULT_FORMATION_Y);
  const formationSpeed = nonNegative(options.formationSpeed ?? formationOptions.speed, DEFAULT_FORMATION_SPEED);
  const formationStepDown = nonNegative(
    options.formationStepDown ?? options.stepDown ?? formationOptions.stepDown,
    DEFAULT_FORMATION_STEP_DOWN,
  );
  const cannonWidth = nonNegative(options.cannonWidth ?? cannonOptions.width, DEFAULT_CANNON_WIDTH) || DEFAULT_CANNON_WIDTH;
  const cannonHeight = nonNegative(options.cannonHeight ?? cannonOptions.height, DEFAULT_CANNON_HEIGHT) || DEFAULT_CANNON_HEIGHT;
  const cannonX = clamp(
    finiteNumber(options.cannonX ?? cannonOptions.x, (width - cannonWidth) / 2),
    0,
    Math.max(0, width - cannonWidth),
  );
  const cannonY = clamp(
    finiteNumber(options.cannonY ?? cannonOptions.y, height - cannonHeight - 12),
    0,
    Math.max(0, height - cannonHeight),
  );
  const fixedStep = Math.max(
    MIN_FIXED_STEP,
    positiveNumber(options.fixedStep, DEFAULT_FIXED_STEP),
  );

  const aliens = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      aliens.push({
        id: `${row}-${column}`,
        row,
        column,
        x: formationX + column * (alienWidth + alienGapX),
        y: formationY + row * (alienHeight + alienGapY),
        width: alienWidth,
        height: alienHeight,
        alive: true,
      });
    }
  }

  const game = {
    width,
    height,
    fixedStep,
    accumulator: 0,
    maxElapsedSeconds: MAX_ELAPSED_SECONDS,
    maxSubstepsPerCall: MAX_FIXED_STEPS_PER_CALL,
    cannon: {
      x: cannonX,
      y: cannonY,
      width: cannonWidth,
      height: cannonHeight,
      speed: nonNegative(options.cannonSpeed ?? cannonOptions.speed, DEFAULT_CANNON_SPEED),
      previousX: cannonX,
      previousY: cannonY,
      motionStartX: cannonX,
      motionStartY: cannonY,
      motionPending: false,
    },
    aliens,
    playerShots: [],
    enemyShots: [],
    formation: {
      x: formationX,
      y: formationY,
      width: columns * alienWidth + (columns - 1) * alienGapX,
      direction: finiteNumber(options.formationDirection ?? formationOptions.direction, 1) < 0 ? -1 : 1,
      speed: formationSpeed,
      stepDown: formationStepDown,
      edgePadding: nonNegative(options.edgePadding ?? formationOptions.edgePadding, 0),
    },
    score: 0,
    lives: Math.max(0, Math.floor(finiteNumber(options.lives, DEFAULT_LIVES))),
    status: "playing",
    finished: false,
    won: false,
    lost: false,
    initialCannonX: cannonX,
    initialCannonY: cannonY,
    playerShotSpeed: nonNegative(options.playerShotSpeed, DEFAULT_PLAYER_SHOT_SPEED),
    enemyShotSpeed: nonNegative(options.enemyShotSpeed, DEFAULT_ENEMY_SHOT_SPEED),
    playerShotWidth: nonNegative(options.playerShotWidth, 3) || 3,
    playerShotHeight: nonNegative(options.playerShotHeight, 8) || 8,
    alienPoints: finiteNumber(options.alienPoints, DEFAULT_ALIEN_POINTS),
    rng: typeof options.rng === "function" ? options.rng : Math.random,
    enemyFireEnabled: options.enemyFireEnabled ?? true,
    enemyFireInterval: enemyFireIntervalValue(options.enemyFireInterval),
    enemyFireChance: clamp(nonNegative(options.enemyFireChance, DEFAULT_ENEMY_FIRE_CHANCE), 0, 1),
    enemyFireTimer: 0,
  };

  if (game.lives === 0) endGame(game, "lost");
  return game;
}

export function moveAlienBlaster(game, input, deltaSeconds = DEFAULT_FIXED_STEP) {
  if (!game || game.finished) return game;
  const direction = directionValue(input);
  let delta = deltaSeconds;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    delta = input.deltaSeconds ?? input.dt ?? deltaSeconds;
  }
  delta = elapsedValue(delta, 0);
  if (direction === 0 || delta === 0) return game;

  if (!game.cannon.motionPending) {
    game.cannon.motionStartX = finiteNumber(game.cannon.x, game.initialCannonX);
    game.cannon.motionStartY = finiteNumber(game.cannon.y, game.initialCannonY);
    game.cannon.motionPending = true;
  }
  const currentX = finiteNumber(game.cannon.x, game.initialCannonX);
  game.cannon.x = clamp(
    finiteNumber(currentX + direction * game.cannon.speed * delta, currentX),
    0,
    Math.max(0, game.width - game.cannon.width),
  );
  return game;
}

export function fireAlienBlaster(game) {
  if (!game || game.finished) return game;
  if (game.playerShots.length > 0) return game;

  game.playerShots.push({
    x: game.cannon.x + game.cannon.width / 2 - game.playerShotWidth / 2,
    y: game.cannon.y - game.playerShotHeight,
    width: game.playerShotWidth,
    height: game.playerShotHeight,
    vx: 0,
    vy: -game.playerShotSpeed,
  });
  return game;
}

export function stepAlienBlaster(game, deltaOrInput = DEFAULT_FIXED_STEP, maybeInput) {
  if (!game || game.finished) return game;
  const { deltaSeconds: requestedDelta, input } = stepInput(deltaOrInput, maybeInput);
  const fixedStep = Math.max(
    MIN_FIXED_STEP,
    positiveNumber(game.fixedStep, DEFAULT_FIXED_STEP),
  );
  game.fixedStep = fixedStep;
  const deltaSeconds = Math.min(
    requestedDelta,
    finiteNumber(game.maxElapsedSeconds, MAX_ELAPSED_SECONDS),
  );
  const hasExplicitEnemyFire = Object.prototype.hasOwnProperty.call(input, "enemyFire");
  if (hasExplicitEnemyFire) addEnemyFire(game, input.enemyFire);
  else randomEnemyFire(game, deltaSeconds, { remaining: MAX_AUTOMATIC_ENEMY_FIRE_EVENTS });

  game.accumulator = nonNegative(game.accumulator, 0) + deltaSeconds;
  const motion = cannonMotion(game);
  const plannedSteps = Math.min(
    MAX_FIXED_STEPS_PER_CALL,
    Math.floor((game.accumulator + EPSILON) / fixedStep),
  );
  const motionDuration = Math.max(DEFAULT_FIXED_STEP, plannedSteps * fixedStep);
  let steps = 0;

  while (
    steps < plannedSteps
    && game.accumulator + EPSILON >= game.fixedStep
    && !game.finished
  ) {
    const previousCannon = interpolateRectangle(
      motion.start,
      motion.end,
      (steps * fixedStep) / motionDuration,
    );
    const currentCannon = interpolateRectangle(
      motion.start,
      motion.end,
      ((steps + 1) * fixedStep) / motionDuration,
    );
    game.accumulator -= fixedStep;
    if (Math.abs(game.accumulator) < EPSILON) game.accumulator = 0;
    if (!simulateFixedStep(game, fixedStep, previousCannon, currentCannon)) break;
    steps += 1;
  }

  if (steps === 0 && !game.finished) {
    const previousAliens = game.aliens.map((alien) => rectangle(alien));
    resolvePlayerShots(game, previousAliens);
    if (!game.finished && resolveEnemyShots(game, motion.start, motion.end)) {
      game.accumulator = 0;
    }
    if (!game.finished && formationReachedCannon(game)) endGame(game, "lost");
  }

  if (
    !Number.isFinite(game.accumulator)
    || (game.accumulator >= fixedStep - EPSILON
      && (steps >= MAX_FIXED_STEPS_PER_CALL || game.finished))
  ) {
    // This is another guard for custom state/configuration: never carry an
    // unbounded backlog into the next browser callback.
    game.accumulator = 0;
  }
  resetCannonMotion(game);
  return game;
}
