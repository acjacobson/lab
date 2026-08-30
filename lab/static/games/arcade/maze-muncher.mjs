const DEFAULT_MAP = Object.freeze([
  "#########",
  "#.......#",
  "#.###.#.#",
  "#.......#",
  "#.#.###.#",
  "#.......#",
  "#########",
]);

const DEFAULT_PLAYER_START = Object.freeze({ x: 1, y: 1 });
const DEFAULT_ENEMY_STARTS = Object.freeze([
  Object.freeze({ x: 7, y: 1 }),
  Object.freeze({ x: 7, y: 5 }),
]);
const DEFAULT_DIRECTION = "left";
const DEFAULT_LIVES = 3;
const PELLET_VALUE = 10;

const DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});

const DIRECTION_ALIASES = Object.freeze({
  n: "up",
  e: "right",
  s: "down",
  w: "left",
});

const OPPOSITE = Object.freeze({
  up: "down",
  right: "left",
  down: "up",
  left: "right",
});

const CLOCKWISE = Object.freeze({
  up: "right",
  right: "down",
  down: "left",
  left: "up",
});

const COUNTERCLOCKWISE = Object.freeze({
  up: "left",
  left: "down",
  down: "right",
  right: "up",
});

function normalizeDirection(direction) {
  if (typeof direction !== "string") return null;
  const value = direction.trim().toLowerCase();
  return DIRECTIONS[value] ? value : DIRECTION_ALIASES[value] ?? null;
}

function clonePosition(position, label) {
  if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y)) {
    throw new Error(`${label} must have integer x and y coordinates`);
  }
  return { x: position.x, y: position.y };
}

function validateLives(lives) {
  if (!Number.isInteger(lives) || lives < 1) {
    throw new Error("Lives must be a positive integer");
  }
}

function validateTileSize(tileSize) {
  if (!Number.isFinite(tileSize) || tileSize <= 0) {
    throw new Error("Tile size must be a positive number");
  }
}

function positionKey(position) {
  return `${position.x},${position.y}`;
}

function isInside(game, x, y) {
  return y >= 0 && y < game.height && x >= 0 && x < game.width;
}

function isWalkable(game, x, y) {
  return isInside(game, x, y) && game.map[y][x] !== "#";
}

function validateWalkable(game, position, label) {
  if (!isWalkable(game, position.x, position.y)) {
    throw new Error(`${label} must be on a walkable maze tile`);
  }
}

function defaultPellets(game, occupied) {
  const pellets = [];
  for (let y = 0; y < game.height; y += 1) {
    for (let x = 0; x < game.width; x += 1) {
      if (game.map[y][x] === "." && !occupied.has(`${x},${y}`)) {
        pellets.push({ x, y });
      }
    }
  }
  return pellets;
}

function clonePellets(game, pellets, occupied) {
  if (!Array.isArray(pellets)) throw new Error("Pellets must be an array");
  const seen = new Set();
  return pellets.map((pellet, index) => {
    const position = clonePosition(pellet, `Pellet ${index + 1}`);
    validateWalkable(game, position, `Pellet ${index + 1}`);
    const key = positionKey(position);
    if (seen.has(key)) throw new Error(`Duplicate pellet at ${key}`);
    if (occupied.has(key)) throw new Error(`Pellet cannot occupy a spawn tile at ${key}`);
    seen.add(key);
    return position;
  });
}

function directionChoices(direction) {
  return [
    direction,
    CLOCKWISE[direction],
    COUNTERCLOCKWISE[direction],
    OPPOSITE[direction],
  ];
}

function moveActor(game, actor) {
  const vector = DIRECTIONS[actor.direction];
  const nextX = actor.x + vector.x;
  const nextY = actor.y + vector.y;
  if (isWalkable(game, nextX, nextY)) {
    actor.x = nextX;
    actor.y = nextY;
    return true;
  }
  return false;
}

function moveEnemy(game, enemy) {
  for (const direction of directionChoices(enemy.direction)) {
    const vector = DIRECTIONS[direction];
    if (!isWalkable(game, enemy.x + vector.x, enemy.y + vector.y)) continue;
    enemy.direction = direction;
    enemy.x += vector.x;
    enemy.y += vector.y;
    return;
  }
}

function samePosition(first, second) {
  return first.x === second.x && first.y === second.y;
}

function hasCollision(game, previousPlayer, previousEnemies) {
  for (let index = 0; index < game.enemies.length; index += 1) {
    const enemy = game.enemies[index];
    if (samePosition(game.player, enemy)) return true;
    if (
      previousEnemies[index]
      && samePosition(previousPlayer, enemy)
      && samePosition(game.player, previousEnemies[index])
    ) return true;
  }
  return false;
}

function resetActors(game) {
  game.player.x = game.player.start.x;
  game.player.y = game.player.start.y;
  game.player.direction = DEFAULT_DIRECTION;
  for (const enemy of game.enemies) {
    enemy.x = enemy.start.x;
    enemy.y = enemy.start.y;
    enemy.direction = enemy.startDirection;
  }
}

function loseLife(game) {
  game.lives -= 1;
  if (game.lives === 0) {
    game.status = "lost";
    game.gameOver = true;
  }
  resetActors(game);
}

function collectPellet(game) {
  const index = game.pellets.findIndex((pellet) => samePosition(pellet, game.player));
  if (index === -1) return false;
  game.pellets.splice(index, 1);
  game.score += PELLET_VALUE;
  return true;
}

export function createMazeMuncher(options = {}) {
  const config = options ?? {};
  const tileSize = config.tileSize ?? 24;
  const lives = config.lives ?? DEFAULT_LIVES;
  validateTileSize(tileSize);
  validateLives(lives);

  const game = {
    map: [...DEFAULT_MAP],
    width: DEFAULT_MAP[0].length,
    height: DEFAULT_MAP.length,
    tileSize,
    player: null,
    enemies: [],
    pellets: [],
    score: 0,
    lives,
    status: "playing",
    gameOver: false,
  };

  const playerStart = clonePosition(config.playerStart ?? DEFAULT_PLAYER_START, "Player start");
  validateWalkable(game, playerStart, "Player start");

  const enemyStarts = config.enemyStarts ?? DEFAULT_ENEMY_STARTS;
  if (!Array.isArray(enemyStarts)) throw new Error("Enemy starts must be an array");
  const enemyDirections = config.enemyDirections ?? [];
  if (!Array.isArray(enemyDirections)) throw new Error("Enemy directions must be an array");

  game.player = {
    x: playerStart.x,
    y: playerStart.y,
    start: playerStart,
    direction: DEFAULT_DIRECTION,
  };

  game.enemies = enemyStarts.map((start, index) => {
    const position = clonePosition(start, `Enemy ${index + 1} start`);
    validateWalkable(game, position, `Enemy ${index + 1} start`);
    const direction = normalizeDirection(enemyDirections[index] ?? DEFAULT_DIRECTION);
    if (!direction) throw new Error(`Enemy ${index + 1} has an invalid direction`);
    return {
      x: position.x,
      y: position.y,
      start: position,
      direction,
      startDirection: direction,
    };
  });

  const occupied = new Set([
    positionKey(game.player),
    ...game.enemies.map((enemy) => positionKey(enemy)),
  ]);
  game.pellets = config.pellets === undefined
    ? defaultPellets(game, occupied)
    : clonePellets(game, config.pellets, occupied);

  return game;
}

export function setMazeDirection(game, direction) {
  if (!game || game.status !== "playing") return game;
  const normalized = normalizeDirection(direction);
  if (normalized) game.player.direction = normalized;
  return game;
}

export function stepMazeMuncher(game) {
  if (!game || game.status !== "playing") return game;

  const previousPlayer = { x: game.player.x, y: game.player.y };
  const previousEnemies = game.enemies.map((enemy) => ({ x: enemy.x, y: enemy.y }));

  moveActor(game, game.player);
  if (hasCollision(game, previousPlayer, previousEnemies)) {
    loseLife(game);
    return game;
  }

  collectPellet(game);
  if (game.pellets.length === 0) {
    game.status = "won";
    game.gameOver = true;
    return game;
  }

  for (const enemy of game.enemies) moveEnemy(game, enemy);
  if (hasCollision(game, previousPlayer, previousEnemies)) loseLife(game);

  return game;
}
