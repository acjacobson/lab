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

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.floor(finiteNumber(value, fallback));
  return Math.max(1, number);
}

function nonNegative(value, fallback) {
  return Math.max(0, finiteNumber(value, fallback));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function aliveAliens(game) {
  return game.aliens.filter((alien) => alien.alive);
}

function rectangle(entity) {
  return {
    x: finiteNumber(entity.x, 0),
    y: finiteNumber(entity.y, 0),
    width: nonNegative(entity.width, 1) || 1,
    height: nonNegative(entity.height, 1) || 1,
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

// The union of a shot's old and new rectangles prevents fast shots from
// skipping a target between fixed updates.
function sweptOverlaps(previous, current, target) {
  const path = {
    x: Math.min(previous.x, current.x),
    y: Math.min(previous.y, current.y),
    width: Math.max(previous.x + previous.width, current.x + current.width) - Math.min(previous.x, current.x),
    height: Math.max(previous.y + previous.height, current.y + current.height) - Math.min(previous.y, current.y),
  };
  return overlaps(path, target);
}

function directionValue(input) {
  if (typeof input === "number") return Math.sign(input);
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
  if (deltaOrInput && typeof deltaOrInput === "object") {
    return {
      deltaSeconds: nonNegative(
        deltaOrInput.deltaSeconds ?? deltaOrInput.dt ?? deltaOrInput.delta,
        1 / 60,
      ),
      input: deltaOrInput,
    };
  }

  const deltaSeconds = nonNegative(deltaOrInput, 1 / 60);
  if (maybeInput && typeof maybeInput === "object") {
    return { deltaSeconds, input: maybeInput };
  }
  if (typeof maybeInput === "boolean" || Array.isArray(maybeInput)) {
    return { deltaSeconds, input: { enemyFire: maybeInput } };
  }
  return { deltaSeconds, input: {} };
}

function randomValue(game) {
  const value = finiteNumber(game.rng(), 0.5);
  return clamp(value, 0, 1);
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
  return lowest[Math.floor(randomValue(game) * lowest.length)];
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

function randomEnemyFire(game, deltaSeconds) {
  if (!game.enemyFireEnabled || game.enemyFireInterval <= 0) return;
  game.enemyFireTimer += deltaSeconds;
  while (game.enemyFireTimer >= game.enemyFireInterval) {
    game.enemyFireTimer -= game.enemyFireInterval;
    if (randomValue(game) < game.enemyFireChance) addEnemyFire(game, true);
  }
}

function moveFormation(game, deltaSeconds) {
  const living = aliveAliens(game);
  if (living.length === 0 || game.formation.speed === 0 || deltaSeconds === 0) return;

  const intendedDelta = game.formation.direction * game.formation.speed * deltaSeconds;
  const nextLeft = Math.min(...living.map((alien) => alien.x + intendedDelta));
  const nextRight = Math.max(...living.map((alien) => alien.x + intendedDelta + alien.width));
  const hitLeft = nextLeft < game.formation.edgePadding;
  const hitRight = nextRight > game.width - game.formation.edgePadding;

  let actualDelta = intendedDelta;
  if (hitLeft || hitRight) {
    game.formation.direction *= -1;
    for (const alien of living) alien.y += game.formation.stepDown;
    game.formation.y += game.formation.stepDown;

    if (hitLeft) actualDelta += game.formation.edgePadding - nextLeft;
    if (hitRight) actualDelta += game.width - game.formation.edgePadding - nextRight;
  }

  for (const alien of living) alien.x += actualDelta;
  game.formation.x += actualDelta;
}

function moveShots(game, deltaSeconds) {
  for (const shot of game.playerShots) {
    shot.previous = rectangle(shot);
    shot.x += finiteNumber(shot.vx, 0) * deltaSeconds;
    shot.y += finiteNumber(shot.vy, 0) * deltaSeconds;
  }
  for (const shot of game.enemyShots) {
    shot.previous = rectangle(shot);
    shot.x += finiteNumber(shot.vx, 0) * deltaSeconds;
    shot.y += finiteNumber(shot.vy, 0) * deltaSeconds;
  }
}

function resolvePlayerShots(game) {
  for (let shotIndex = game.playerShots.length - 1; shotIndex >= 0; shotIndex -= 1) {
    const shot = game.playerShots[shotIndex];
    const previous = shot.previous ?? rectangle(shot);
    const target = aliveAliens(game).find((alien) => (
      sweptOverlaps(previous, rectangle(shot), rectangle(alien))
    ));

    if (target) {
      target.alive = false;
      game.score += game.alienPoints;
      game.playerShots.splice(shotIndex, 1);
      if (aliveAliens(game).length === 0) endGame(game, "won");
      continue;
    }

    if (shot.y + shot.height < 0 || shot.y > game.height || shot.x + shot.width < 0 || shot.x > game.width) {
      game.playerShots.splice(shotIndex, 1);
    }
  }
}

function resolveEnemyShots(game) {
  for (let shotIndex = game.enemyShots.length - 1; shotIndex >= 0; shotIndex -= 1) {
    const shot = game.enemyShots[shotIndex];
    const previous = shot.previous ?? rectangle(shot);
    if (sweptOverlaps(previous, rectangle(shot), rectangle(game.cannon))) {
      game.enemyShots.splice(shotIndex, 1);
      game.lives = Math.max(0, game.lives - 1);
      if (game.lives === 0) {
        endGame(game, "lost");
      } else {
        game.cannon.x = game.initialCannonX;
        game.playerShots.length = 0;
        game.enemyShots.length = 0;
      }
      return;
    }

    if (shot.y > game.height || shot.x + shot.width < 0 || shot.x > game.width) {
      game.enemyShots.splice(shotIndex, 1);
    }
  }
}

function formationReachedCannon(game) {
  return aliveAliens(game).some((alien) => alien.y + alien.height >= game.cannon.y);
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
    cannon: {
      x: cannonX,
      y: cannonY,
      width: cannonWidth,
      height: cannonHeight,
      speed: nonNegative(options.cannonSpeed ?? cannonOptions.speed, DEFAULT_CANNON_SPEED),
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
    playerShotSpeed: nonNegative(options.playerShotSpeed, DEFAULT_PLAYER_SHOT_SPEED),
    enemyShotSpeed: nonNegative(options.enemyShotSpeed, DEFAULT_ENEMY_SHOT_SPEED),
    playerShotWidth: nonNegative(options.playerShotWidth, 3) || 3,
    playerShotHeight: nonNegative(options.playerShotHeight, 8) || 8,
    alienPoints: finiteNumber(options.alienPoints, DEFAULT_ALIEN_POINTS),
    rng: typeof options.rng === "function" ? options.rng : Math.random,
    enemyFireEnabled: options.enemyFireEnabled ?? true,
    enemyFireInterval: nonNegative(options.enemyFireInterval, DEFAULT_ENEMY_SHOT_INTERVAL),
    enemyFireChance: clamp(nonNegative(options.enemyFireChance, DEFAULT_ENEMY_FIRE_CHANCE), 0, 1),
    enemyFireTimer: 0,
  };

  if (game.lives === 0) endGame(game, "lost");
  return game;
}

export function moveAlienBlaster(game, input, deltaSeconds = 1 / 60) {
  if (!game || game.finished) return game;
  let direction = directionValue(input);
  let delta = deltaSeconds;
  if (input && typeof input === "object") {
    delta = input.deltaSeconds ?? input.dt ?? deltaSeconds;
  }
  delta = nonNegative(delta, 1 / 60);
  if (direction === 0 || delta === 0) return game;

  game.cannon.x = clamp(
    game.cannon.x + direction * game.cannon.speed * delta,
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

export function stepAlienBlaster(game, deltaOrInput = 1 / 60, maybeInput) {
  if (!game || game.finished) return game;
  const { deltaSeconds, input } = stepInput(deltaOrInput, maybeInput);
  const hasExplicitEnemyFire = Object.prototype.hasOwnProperty.call(input, "enemyFire");

  if (hasExplicitEnemyFire) addEnemyFire(game, input.enemyFire);
  else randomEnemyFire(game, deltaSeconds);

  moveFormation(game, deltaSeconds);
  moveShots(game, deltaSeconds);
  resolvePlayerShots(game);
  if (game.finished) return game;
  resolveEnemyShots(game);
  if (game.finished) return game;
  if (formationReachedCannon(game)) endGame(game, "lost");
  return game;
}
