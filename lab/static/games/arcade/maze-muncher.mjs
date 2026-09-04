const DEFAULT_MAP = Object.freeze([
  "###############",
  "#.............#",
  "#.###.###.###.#",
  "#.#...#...#.#.#",
  "#.#.#.###.#.#.#",
  "#...#.....#...#",
  "#.#.#.###.#.#.#",
  "#.#...#...#.#.#",
  "#.###.###.###.#",
  "#.............#",
  "###############",
]);

export const MAZE_MAP = DEFAULT_MAP;
export const PELLET_VALUE = 10;

const DEFAULT_PLAYER_START = Object.freeze({ x: 1, y: 1 });
const DEFAULT_ENEMY_STARTS = Object.freeze([
  Object.freeze({ x: 13, y: 1 }),
  Object.freeze({ x: 13, y: 9 }),
]);
const DEFAULT_ENEMY_DIRECTIONS = Object.freeze(["left", "up"]);
const DEFAULT_ENEMY_PROFILES = Object.freeze(["chaser", "patrol"]);
const DEFAULT_DIRECTION = "left";
const DEFAULT_LIVES = 3;
const DEFAULT_TILE_SIZE = 24;
const COLLISION_GRACE_TICKS = 1;

export const MAZE_DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});

const DIRECTION_ALIASES = Object.freeze({
  n: "up",
  north: "up",
  arrowup: "up",
  e: "right",
  east: "right",
  arrowright: "right",
  s: "down",
  south: "down",
  arrowdown: "down",
  w: "left",
  west: "left",
  arrowleft: "left",
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

const PROFILE_ALIASES = Object.freeze({
  hunter: "chaser",
  tracker: "chaser",
  direct: "chaser",
  scout: "patrol",
  wanderer: "patrol",
  clockwise: "patrol",
});

const gameMetadata = new WeakMap();

function normalizeDirection(direction) {
  if (typeof direction !== "string") return null;
  const value = direction.trim().toLowerCase();
  if (Object.hasOwn(MAZE_DIRECTIONS, value)) return value;
  if (Object.hasOwn(DIRECTION_ALIASES, value)) return DIRECTION_ALIASES[value];
  return null;
}

function normalizeProfile(profile) {
  if (typeof profile !== "string") return null;
  const value = profile.trim().toLowerCase();
  if (value === "chaser" || value === "patrol") return value;
  return PROFILE_ALIASES[value] ?? null;
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

function cloneMap(input) {
  const source = input === undefined ? DEFAULT_MAP : input;
  if (!Array.isArray(source) || source.length < 3) {
    throw new Error("Maze map must contain at least three rows");
  }

  const rows = source.map((row, index) => {
    const value = typeof row === "string" ? row : Array.isArray(row) ? row.join("") : null;
    if (!value || value.length < 3) throw new Error(`Maze row ${index + 1} is invalid`);
    if ([...value].some((cell) => typeof cell !== "string")) {
      throw new Error(`Maze row ${index + 1} is invalid`);
    }
    return value;
  });
  const width = rows[0].length;
  if (rows.some((row) => row.length !== width)) {
    throw new Error("Maze rows must all have the same width");
  }
  if (rows.every((row) => [...row].every((cell) => cell === "#"))) {
    throw new Error("Maze must contain at least one walkable tile");
  }
  return rows;
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
      if (isWalkable(game, x, y) && !occupied.has(`${x},${y}`)) {
        pellets.push({ x, y });
      }
    }
  }
  return pellets;
}

function clonePelletValue(pellet, index) {
  const position = Array.isArray(pellet)
    ? { x: pellet[0], y: pellet[1] }
    : pellet;
  return clonePosition(position, `Pellet ${index + 1}`);
}

function clonePellets(game, pellets, occupied) {
  if (!Array.isArray(pellets)) throw new Error("Pellets must be an array");
  const seen = new Set();
  return pellets.map((pellet, index) => {
    const position = clonePelletValue(pellet, index);
    validateWalkable(game, position, `Pellet ${index + 1}`);
    const key = positionKey(position);
    if (seen.has(key)) throw new Error(`Duplicate pellet at ${key}`);
    if (occupied.has(key)) throw new Error(`Pellet cannot occupy a spawn tile at ${key}`);
    seen.add(key);
    return position;
  });
}

function samePosition(first, second) {
  return Boolean(first && second) && first.x === second.x && first.y === second.y;
}

function position(actor) {
  return { x: actor.x, y: actor.y };
}

function directionChoices(direction) {
  return [
    direction,
    CLOCKWISE[direction],
    COUNTERCLOCKWISE[direction],
    OPPOSITE[direction],
  ];
}

function legalDirections(game, actor) {
  return Object.keys(MAZE_DIRECTIONS).filter((direction) => {
    const vector = MAZE_DIRECTIONS[direction];
    return isWalkable(game, actor.x + vector.x, actor.y + vector.y);
  });
}

function setRequestedDirection(player, direction) {
  player.requestedDirection = direction;
  // These aliases keep the input intent discoverable to older integrations and
  // make the buffered-turn state explicit for the browser snapshot.
  player.nextDirection = direction;
  player.queuedDirection = direction;
}

function movePlayer(game) {
  const player = game.player;
  const requested = normalizeDirection(player.requestedDirection) ?? player.direction;
  if (isWalkable(game, player.x + MAZE_DIRECTIONS[requested].x, player.y + MAZE_DIRECTIONS[requested].y)) {
    player.direction = requested;
  }

  const vector = MAZE_DIRECTIONS[player.direction];
  const nextX = player.x + vector.x;
  const nextY = player.y + vector.y;
  if (!isWalkable(game, nextX, nextY)) return false;
  player.x = nextX;
  player.y = nextY;
  return true;
}

function chaserDirection(game, enemy) {
  const candidates = legalDirections(game, enemy);
  if (candidates.length === 0) return null;
  const preference = new Map(directionChoices(enemy.direction).map((direction, index) => [direction, index]));
  const player = game.player;
  candidates.sort((first, second) => {
    const firstVector = MAZE_DIRECTIONS[first];
    const secondVector = MAZE_DIRECTIONS[second];
    const firstDistance = Math.abs(player.x - (enemy.x + firstVector.x))
      + Math.abs(player.y - (enemy.y + firstVector.y));
    const secondDistance = Math.abs(player.x - (enemy.x + secondVector.x))
      + Math.abs(player.y - (enemy.y + secondVector.y));
    if (firstDistance !== secondDistance) return firstDistance - secondDistance;
    return (preference.get(first) ?? Number.MAX_SAFE_INTEGER)
      - (preference.get(second) ?? Number.MAX_SAFE_INTEGER);
  });
  return candidates[0];
}

function patrolDirection(game, enemy) {
  const preferred = [
    CLOCKWISE[enemy.direction],
    enemy.direction,
    COUNTERCLOCKWISE[enemy.direction],
    OPPOSITE[enemy.direction],
  ];
  return preferred.find((direction) => {
    const vector = MAZE_DIRECTIONS[direction];
    return isWalkable(game, enemy.x + vector.x, enemy.y + vector.y);
  }) ?? null;
}

function moveEnemy(game, enemy) {
  const direction = enemy.profile === "patrol"
    ? patrolDirection(game, enemy)
    : chaserDirection(game, enemy);
  if (!direction) return false;
  enemy.direction = direction;
  const vector = MAZE_DIRECTIONS[direction];
  enemy.x += vector.x;
  enemy.y += vector.y;
  return true;
}

function hasCollision(game, previousPlayer, previousEnemies) {
  for (let index = 0; index < game.enemies.length; index += 1) {
    const enemy = game.enemies[index];
    if (samePosition(game.player, enemy)) return true;
    const previousEnemy = previousEnemies?.[index];
    if (
      previousEnemy
      && samePosition(previousPlayer, enemy)
      && samePosition(game.player, previousEnemy)
    ) return true;
  }
  return false;
}

function updatePelletStats(game) {
  game.remainingPellets = game.pellets.length;
  game.pelletsRemaining = game.pellets.length;
  game.progress = game.totalPellets > 0
    ? (game.totalPellets - game.remainingPellets) / game.totalPellets
    : game.boardCleared ? 1 : 0;
}

function resetActors(game) {
  const player = game.player;
  player.x = player.start.x;
  player.y = player.start.y;
  player.direction = player.startDirection;
  setRequestedDirection(player, player.startDirection);
  for (const enemy of game.enemies) {
    enemy.x = enemy.start.x;
    enemy.y = enemy.start.y;
    enemy.direction = enemy.startDirection;
  }
}

function clearLifeLostNotice(game) {
  if (game.phase !== "life-lost") return;
  game.phase = "playing";
  game.lifeLost = false;
  game.lastEvent = "playing";
}

function loseLife(game) {
  game.lives = Math.max(0, game.lives - 1);
  resetActors(game);
  game.collisionGraceTicks = game.lives > 0 ? COLLISION_GRACE_TICKS : 0;
  game.lastEvent = "life-lost";
  game.lifeLost = true;
  game.boardCleared = false;

  if (game.lives === 0) {
    game.status = "lost";
    game.phase = "game-over";
    game.gameOver = true;
    game.finished = true;
    game.lastEvent = "game-over";
    return;
  }

  // Actors reset immediately while the status stays playable. The phase and
  // event give the renderer a short, clear life-lost feedback state.
  game.status = "playing";
  game.phase = "life-lost";
  game.gameOver = false;
  game.finished = false;
}

function collectPellet(game) {
  const index = game.pellets.findIndex((pellet) => samePosition(pellet, game.player));
  if (index === -1) return false;
  game.pellets.splice(index, 1);
  game.score += PELLET_VALUE;
  updatePelletStats(game);
  return true;
}

function clearBoard(game) {
  game.status = "won";
  game.phase = "board-cleared";
  game.gameOver = true;
  game.finished = true;
  game.boardCleared = true;
  game.lifeLost = false;
  game.collisionGraceTicks = 0;
  game.lastEvent = "board-cleared";
  updatePelletStats(game);
}

function requireMazeGame(game) {
  if (!game || typeof game !== "object") {
    throw new TypeError("Maze Muncher game is required");
  }
  return game.state && game.state.map ? game.state : game;
}

export function createMazeMuncher(options = {}) {
  if (options !== null && (typeof options !== "object" || Array.isArray(options))) {
    throw new TypeError("Maze Muncher options must be an object");
  }
  const config = options ?? {};
  const map = cloneMap(config.map);
  const tileSize = config.tileSize ?? DEFAULT_TILE_SIZE;
  const lives = config.lives ?? DEFAULT_LIVES;
  validateTileSize(tileSize);
  validateLives(lives);

  const game = {
    map,
    width: map[0].length,
    height: map.length,
    tileSize,
    player: null,
    enemies: [],
    pellets: [],
    totalPellets: 0,
    remainingPellets: 0,
    pelletsRemaining: 0,
    progress: 0,
    score: 0,
    lives,
    initialLives: lives,
    status: "ready",
    phase: "ready",
    gameOver: false,
    finished: false,
    boardCleared: false,
    lifeLost: false,
    lastEvent: "ready",
    collisionGraceTicks: 0,
    tick: 0,
  };

  const playerStart = clonePosition(config.playerStart ?? DEFAULT_PLAYER_START, "Player start");
  validateWalkable(game, playerStart, "Player start");
  const playerDirection = normalizeDirection(config.playerDirection ?? DEFAULT_DIRECTION);
  if (!playerDirection) throw new Error("Player has an invalid direction");
  game.player = {
    x: playerStart.x,
    y: playerStart.y,
    start: playerStart,
    startDirection: playerDirection,
    direction: playerDirection,
    requestedDirection: playerDirection,
    nextDirection: playerDirection,
    queuedDirection: playerDirection,
  };

  const enemyStarts = config.enemyStarts ?? DEFAULT_ENEMY_STARTS;
  if (!Array.isArray(enemyStarts)) throw new Error("Enemy starts must be an array");
  const enemyDirections = config.enemyDirections
    ?? config.enemyStartDirections
    ?? DEFAULT_ENEMY_DIRECTIONS;
  if (!Array.isArray(enemyDirections)) throw new Error("Enemy directions must be an array");
  const enemyProfiles = config.enemyProfiles
    ?? config.enemyBehaviors
    ?? DEFAULT_ENEMY_PROFILES;
  if (!Array.isArray(enemyProfiles)) throw new Error("Enemy profiles must be an array");

  game.enemies = enemyStarts.map((start, index) => {
    const position = clonePosition(start, `Enemy ${index + 1} start`);
    validateWalkable(game, position, `Enemy ${index + 1} start`);
    const direction = normalizeDirection(enemyDirections[index] ?? DEFAULT_DIRECTION);
    if (!direction) throw new Error(`Enemy ${index + 1} has an invalid direction`);
    const profile = normalizeProfile(enemyProfiles[index] ?? DEFAULT_ENEMY_PROFILES[index] ?? "patrol");
    if (!profile) throw new Error(`Enemy ${index + 1} has an invalid profile`);
    return {
      x: position.x,
      y: position.y,
      start: position,
      startDirection: direction,
      direction,
      profile,
      behavior: profile,
      mode: profile,
    };
  });

  const spawnOwners = new Map([[positionKey(game.player), "player"]]);
  for (let index = 0; index < game.enemies.length; index += 1) {
    const enemy = game.enemies[index];
    const key = positionKey(enemy);
    const owner = spawnOwners.get(key);
    if (owner === "player") {
      throw new Error(`Enemy ${index + 1} start overlaps player start at ${key}`);
    }
    if (owner) {
      throw new Error(`Duplicate enemy spawn at ${key} (Enemy ${index + 1} overlaps ${owner})`);
    }
    spawnOwners.set(key, `Enemy ${index + 1}`);
  }

  const occupied = new Set([
    positionKey(game.player),
    ...game.enemies.map((enemy) => positionKey(enemy)),
  ]);
  const pellets = config.pellets === undefined
    ? defaultPellets(game, occupied)
    : clonePellets(game, config.pellets, occupied);
  game.pellets = pellets;
  game.totalPellets = pellets.length;
  updatePelletStats(game);
  gameMetadata.set(game, {
    initialLives: lives,
    initialPellets: pellets.map((pellet) => ({ ...pellet })),
  });

  return game;
}

export function startMazeMuncher(candidate) {
  const game = requireMazeGame(candidate);
  if (game.gameOver || game.finished) return candidate;
  if (game.status === "ready") {
    game.status = "playing";
    game.phase = "playing";
    game.lastEvent = "start";
    game.lifeLost = false;
  }
  return candidate;
}

export function setMazeDirection(candidate, direction) {
  const game = requireMazeGame(candidate);
  if (game.gameOver || game.finished) return candidate;
  const normalized = normalizeDirection(direction);
  if (!normalized) return candidate;
  if (game.status === "ready") startMazeMuncher(game);
  setRequestedDirection(game.player, normalized);
  return candidate;
}

export function stepMazeMuncher(candidate) {
  const game = requireMazeGame(candidate);
  if (game.gameOver || game.finished || game.status === "ready") return candidate;
  clearLifeLostNotice(game);
  const previousPlayer = position(game.player);
  const previousEnemies = game.enemies.map(position);
  const collisionGraceActive = game.collisionGraceTicks > 0;

  game.tick += 1;
  movePlayer(game);
  if (!collisionGraceActive && hasCollision(game, previousPlayer, previousEnemies)) {
    loseLife(game);
    return candidate;
  }

  collectPellet(game);
  if (game.remainingPellets === 0) {
    clearBoard(game);
    return candidate;
  }

  for (const enemy of game.enemies) moveEnemy(game, enemy);
  if (!collisionGraceActive && hasCollision(game, previousPlayer, previousEnemies)) loseLife(game);
  if (collisionGraceActive) game.collisionGraceTicks -= 1;
  updatePelletStats(game);
  return candidate;
}

export function restartMazeMuncher(candidate) {
  const game = requireMazeGame(candidate);
  const metadata = gameMetadata.get(game);
  if (!metadata) return candidate;
  game.score = 0;
  game.lives = metadata.initialLives;
  game.status = "ready";
  game.phase = "ready";
  game.gameOver = false;
  game.finished = false;
  game.boardCleared = false;
  game.lifeLost = false;
  game.lastEvent = "restart";
  game.collisionGraceTicks = 0;
  game.tick = 0;
  game.pellets = metadata.initialPellets.map((pellet) => ({ ...pellet }));
  game.totalPellets = metadata.initialPellets.length;
  resetActors(game);
  updatePelletStats(game);
  return candidate;
}

export const resetMazeMuncher = restartMazeMuncher;
