const DEFAULT_WIDTH = 10;
const DEFAULT_HEIGHT = 20;
const DEFAULT_SEQUENCE = ["I", "J", "L", "O", "S", "T", "Z"];
const LINE_SCORES = [0, 100, 300, 500, 800];

const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]],
};

const sources = new WeakMap();

function integerOr(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function emptyRow(width) {
  return Array(width).fill(null);
}

function normalizeCell(cell) {
  return cell === null || cell === undefined || cell === false || cell === 0 || cell === "."
    ? null
    : cell;
}

function normalizeBoard(board, width, height) {
  if (board === undefined) {
    return Array.from({ length: height }, () => emptyRow(width));
  }
  if (!Array.isArray(board) || board.length !== height) {
    throw new Error(`Board must contain exactly ${height} rows`);
  }

  return board.map((row) => {
    const cells = typeof row === "string" ? [...row] : row;
    if (!Array.isArray(cells) || cells.length !== width) {
      throw new Error(`Board rows must contain exactly ${width} columns`);
    }
    return cells.map(normalizeCell);
  });
}

function normalizeShape(shape) {
  if (!Array.isArray(shape) || shape.length === 0) {
    throw new Error("Piece shape must contain at least one row");
  }
  const width = Array.isArray(shape[0]) ? shape[0].length : 0;
  if (width === 0 || !shape.every((row) => Array.isArray(row) && row.length === width)) {
    throw new Error("Piece shape rows must be equal-length arrays");
  }
  return shape.map((row) => row.map((cell) => (normalizeCell(cell) === null ? 0 : 1)));
}

function normalizePiece(piece) {
  if (typeof piece === "string") {
    const type = piece.toUpperCase();
    if (!SHAPES[type]) throw new Error(`Unknown block piece: ${piece}`);
    return { type, shape: SHAPES[type].map((row) => [...row]) };
  }

  if (Array.isArray(piece)) {
    return { type: "CUSTOM", shape: normalizeShape(piece) };
  }

  if (piece && typeof piece === "object") {
    const type = typeof piece.type === "string" ? piece.type.toUpperCase() : "CUSTOM";
    const shape = piece.shape ?? piece.matrix ?? piece.cells;
    if (shape !== undefined) return { type, shape: normalizeShape(shape) };
    if (SHAPES[type]) return { type, shape: SHAPES[type].map((row) => [...row]) };
  }

  throw new Error("Piece source returned an invalid piece");
}

function sourceFor(options) {
  const sequence = options.sequence ?? options.pieceSequence ?? options.fixedSequence ?? options.pieces;
  const configuredSource = options.pieceSource ?? options.nextPiece ?? options.getPiece;
  const rng = options.rng ?? options.random;
  let index = 0;

  if (typeof configuredSource === "function") {
    return () => {
      const piece = configuredSource(index);
      index += 1;
      return normalizePiece(piece);
    };
  }

  if (configuredSource && typeof configuredSource.next === "function") {
    return () => {
      const result = configuredSource.next();
      index += 1;
      return normalizePiece(result?.value ?? result);
    };
  }

  if (Array.isArray(sequence) && sequence.length > 0) {
    return () => {
      const piece = sequence[index % sequence.length];
      index += 1;
      return normalizePiece(piece);
    };
  }

  if (typeof rng === "function") {
    return () => {
      const randomValue = Number(rng());
      const slot = Number.isFinite(randomValue)
        ? Math.min(DEFAULT_SEQUENCE.length - 1, Math.max(0, Math.floor(randomValue * DEFAULT_SEQUENCE.length)))
        : 0;
      index += 1;
      return normalizePiece(DEFAULT_SEQUENCE[slot]);
    };
  }

  return () => {
    const piece = DEFAULT_SEQUENCE[index % DEFAULT_SEQUENCE.length];
    index += 1;
    return normalizePiece(piece);
  };
}

function exposeAliases(game, state) {
  const stateKeys = [
    "width",
    "height",
    "board",
    "active",
    "score",
    "lines",
    "gameOver",
    "status",
    "lastCleared",
    "dropDistance",
  ];
  for (const key of stateKeys) {
    Object.defineProperty(game, key, {
      configurable: false,
      enumerable: true,
      get: () => state[key],
      set: (value) => {
        state[key] = value;
      },
    });
  }

  Object.defineProperties(game, {
    currentPiece: {
      configurable: false,
      enumerable: false,
      get: () => state.active,
    },
    piece: {
      configurable: false,
      enumerable: false,
      get: () => state.active,
    },
    over: {
      configurable: false,
      enumerable: false,
      get: () => state.gameOver,
    },
  });

  Object.defineProperties(state, {
    currentPiece: {
      configurable: false,
      enumerable: false,
      get: () => state.active,
    },
    piece: {
      configurable: false,
      enumerable: false,
      get: () => state.active,
    },
    over: {
      configurable: false,
      enumerable: false,
      get: () => state.gameOver,
    },
  });
}

function makeActive(piece, state) {
  const shape = piece.shape.map((row) => [...row]);
  const active = {
    type: piece.type,
    shape,
    x: Math.floor((state.width - shape[0].length) / 2),
    y: 0,
    rotation: 0,
  };
  Object.defineProperties(active, {
    matrix: {
      configurable: false,
      enumerable: false,
      get: () => active.shape,
    },
    cells: {
      configurable: false,
      enumerable: false,
      get: () => cellsFor(active, active.x, active.y),
    },
  });
  return active;
}

function cellsFor(active, x = active.x, y = active.y, shape = active.shape) {
  const cells = [];
  for (let row = 0; row < shape.length; row += 1) {
    for (let column = 0; column < shape[row].length; column += 1) {
      if (shape[row][column]) cells.push({ x: x + column, y: y + row });
    }
  }
  return cells;
}

function canPlace(game, active, x, y, shape = active.shape) {
  const state = game.state;
  return cellsFor(active, x, y, shape).every(({ x: cellX, y: cellY }) => (
    cellX >= 0
    && cellX < state.width
    && cellY >= 0
    && cellY < state.height
    && state.board[cellY][cellX] === null
  ));
}

function setGameOver(state) {
  state.active = null;
  state.gameOver = true;
  state.status = "gameover";
}

function spawn(game) {
  const state = game.state;
  const next = sources.get(game)();
  const active = makeActive(next, state);
  if (!canPlace(game, active, active.x, active.y)) {
    setGameOver(state);
    return;
  }
  state.active = active;
  state.status = "playing";
}

function lock(game) {
  const state = game.state;
  const active = state.active;
  if (!active) return;

  for (const { x, y } of cellsFor(active)) {
    if (y >= 0 && y < state.height && x >= 0 && x < state.width) state.board[y][x] = active.type;
  }

  const remaining = state.board.filter((row) => !row.every((cell) => cell !== null));
  const cleared = state.height - remaining.length;
  while (remaining.length < state.height) remaining.unshift(emptyRow(state.width));
  state.board.splice(0, state.height, ...remaining);
  state.lastCleared = cleared;
  state.lines += cleared;
  state.score += LINE_SCORES[cleared] ?? cleared * 100;
  state.dropDistance = 0;
  spawn(game);
}

function rotateClockwise(shape) {
  const height = shape.length;
  const width = shape[0].length;
  return Array.from({ length: width }, (_, row) => (
    Array.from({ length: height }, (_, column) => shape[height - 1 - column][row])
  ));
}

function rotateCounterClockwise(shape) {
  return rotateClockwise(rotateClockwise(rotateClockwise(shape)));
}

function horizontalDelta(direction) {
  if (typeof direction === "string") {
    const normalized = direction.toLowerCase();
    if (["left", "west", "a"].includes(normalized)) return -1;
    if (["right", "east", "d"].includes(normalized)) return 1;
  }
  if (direction && typeof direction === "object") return horizontalDelta(direction.x ?? direction.dx ?? direction.direction);
  const value = Number(direction);
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function rotationDirection(direction) {
  if (typeof direction === "string") {
    const normalized = direction.toLowerCase();
    if (["left", "ccw", "counterclockwise", "a", "up"].includes(normalized)) return -1;
    return 1;
  }
  if (direction && typeof direction === "object") return rotationDirection(direction.direction ?? direction.turns);
  const value = Number(direction);
  return Number.isFinite(value) && value < 0 ? -1 : 1;
}

function stepCount(amount) {
  if (amount === undefined) return 1;
  if (amount && typeof amount === "object") {
    return stepCount(amount.rows ?? amount.steps ?? amount.ticks ?? amount.delta);
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.floor(value));
}

function requireGame(game) {
  if (!game || !game.state || !Array.isArray(game.state.board)) {
    throw new TypeError("Expected a block drop game created by createBlockDrop");
  }
  return game;
}

export function createBlockDrop(options = {}) {
  if (!options || typeof options !== "object") throw new TypeError("Block Drop options must be an object");
  const sourceBoard = options.board;
  const width = integerOr(options.width, Array.isArray(sourceBoard) && sourceBoard[0]
    ? (typeof sourceBoard[0] === "string" ? sourceBoard[0].length : sourceBoard[0].length)
    : DEFAULT_WIDTH);
  const height = integerOr(options.height, Array.isArray(sourceBoard) ? sourceBoard.length : DEFAULT_HEIGHT);
  const state = {
    width,
    height,
    board: normalizeBoard(sourceBoard, width, height),
    active: null,
    score: 0,
    lines: 0,
    gameOver: false,
    status: "playing",
    lastCleared: 0,
    dropDistance: 0,
  };
  const game = { state };
  exposeAliases(game, state);
  sources.set(game, sourceFor(options));
  spawn(game);
  return game;
}

export function moveBlockDrop(game, direction = 0) {
  requireGame(game);
  const state = game.state;
  if (state.gameOver || !state.active) return game;
  const delta = horizontalDelta(direction);
  if (delta === 0) return game;
  const width = state.active.shape[0].length;
  const maxX = Math.max(0, state.width - width);
  const targetX = Math.min(maxX, Math.max(0, state.active.x + delta));
  if (canPlace(game, state.active, targetX, state.active.y)) state.active.x = targetX;
  return game;
}

export function rotateBlockDrop(game, direction = 1) {
  requireGame(game);
  const state = game.state;
  if (state.gameOver || !state.active) return game;

  const turn = rotationDirection(direction);
  const shape = turn > 0
    ? rotateClockwise(state.active.shape)
    : rotateCounterClockwise(state.active.shape);
  const maxX = Math.max(0, state.width - shape[0].length);
  const xCandidates = [
    state.active.x,
    state.active.x - 1,
    state.active.x + 1,
    state.active.x - 2,
    state.active.x + 2,
  ];
  const yCandidates = [state.active.y, state.active.y - 1, state.active.y + 1];

  for (const candidateY of yCandidates) {
    if (candidateY < 0) continue;
    for (const candidate of xCandidates) {
      const candidateX = Math.min(maxX, Math.max(0, candidate));
      if (!canPlace(game, state.active, candidateX, candidateY, shape)) continue;
      state.active.x = candidateX;
      state.active.y = candidateY;
      state.active.shape = shape;
      state.active.rotation = (state.active.rotation + (turn > 0 ? 1 : 3)) % 4;
      return game;
    }
  }
  return game;
}

export function stepBlockDrop(game, amount = 1) {
  requireGame(game);
  const state = game.state;
  if (state.gameOver || !state.active) return game;
  const steps = stepCount(amount);

  for (let index = 0; index < steps; index += 1) {
    if (!state.active || state.gameOver) break;
    if (canPlace(game, state.active, state.active.x, state.active.y + 1)) {
      state.active.y += 1;
    } else {
      lock(game);
    }
  }
  return game;
}

export function dropBlockDrop(game) {
  requireGame(game);
  const state = game.state;
  if (state.gameOver || !state.active) return game;

  let distance = 0;
  while (canPlace(game, state.active, state.active.x, state.active.y + 1)) {
    state.active.y += 1;
    distance += 1;
  }
  state.dropDistance = distance;
  lock(game);
  return game;
}
