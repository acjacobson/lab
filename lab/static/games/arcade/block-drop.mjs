const DEFAULT_WIDTH = 10;
const DEFAULT_HEIGHT = 20;
const DEFAULT_SEQUENCE = ["I", "J", "L", "O", "S", "T", "Z"];
const LINE_SCORES = [0, 100, 300, 500, 800];

const SHAPES = Object.freeze({
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]],
});

const sources = new WeakMap();

function positiveInteger(value, fallback) {
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

function normalizeBoard(input, width, height) {
  if (input === undefined) {
    return Array.from({ length: height }, () => emptyRow(width));
  }
  if (!Array.isArray(input) || input.length !== height) {
    throw new Error(`Board must contain exactly ${height} rows`);
  }

  return input.map((row) => {
    const values = typeof row === "string" ? [...row] : row;
    if (!Array.isArray(values) || values.length !== width) {
      throw new Error(`Board rows must contain exactly ${width} columns`);
    }
    return values.map(normalizeCell);
  });
}

function standardType(value) {
  if (typeof value !== "string") {
    throw new Error("Piece source must return a standard tetromino name");
  }
  const type = value.toUpperCase();
  if (!Object.hasOwn(SHAPES, type)) {
    throw new Error(`Unknown standard tetromino: ${value}`);
  }
  return type;
}

function copyShape(type) {
  return SHAPES[type].map((row) => [...row]);
}

function createSource(options) {
  const sequence = options.sequence === undefined ? DEFAULT_SEQUENCE : options.sequence;
  if (!Array.isArray(sequence) || sequence.length === 0) {
    throw new Error("Sequence must contain at least one standard tetromino");
  }
  const names = sequence.map(standardType);
  if (options.pieceSource !== undefined && typeof options.pieceSource !== "function") {
    throw new TypeError("pieceSource must be a function");
  }

  let index = 0;
  return () => {
    const value = options.pieceSource === undefined
      ? names[index % names.length]
      : options.pieceSource(index);
    index += 1;
    return standardType(value);
  };
}

function makeActive(type, state) {
  const shape = copyShape(type);
  return {
    type,
    shape,
    x: Math.floor((state.width - shape[0].length) / 2),
    y: 0,
    rotation: 0,
  };
}

function canPlace(state, active, x, y, shape = active.shape) {
  for (let row = 0; row < shape.length; row += 1) {
    for (let column = 0; column < shape[row].length; column += 1) {
      if (!shape[row][column]) continue;
      const cellX = x + column;
      const cellY = y + row;
      if (
        cellX < 0
        || cellX >= state.width
        || cellY < 0
        || cellY >= state.height
        || state.board[cellY][cellX] !== null
      ) return false;
    }
  }
  return true;
}

function spawn(game) {
  const state = game.state;
  const active = makeActive(sources.get(game)(), state);
  if (!canPlace(state, active, active.x, active.y)) {
    state.active = null;
    state.gameOver = true;
    state.status = "gameover";
    return;
  }
  state.active = active;
  state.status = "playing";
}

function lock(game) {
  const state = game.state;
  const active = state.active;
  for (let row = 0; row < active.shape.length; row += 1) {
    for (let column = 0; column < active.shape[row].length; column += 1) {
      if (active.shape[row][column]) state.board[active.y + row][active.x + column] = active.type;
    }
  }

  const remaining = state.board.filter((row) => row.some((cell) => cell === null));
  const cleared = state.height - remaining.length;
  const rows = Array.from({ length: cleared }, () => emptyRow(state.width));
  state.board.splice(0, state.height, ...rows, ...remaining);
  state.lines += cleared;
  state.score += LINE_SCORES[cleared] ?? cleared * 100;
  spawn(game);
}

function rotateClockwise(shape) {
  return Array.from({ length: shape[0].length }, (_, row) => (
    Array.from({ length: shape.length }, (_, column) => shape[shape.length - 1 - column][row])
  ));
}

function rotatedShape(shape, direction) {
  if (direction > 0) return rotateClockwise(shape);
  return rotateClockwise(rotateClockwise(rotateClockwise(shape)));
}

function validDirection(direction) {
  return direction === -1 || direction === 1 ? direction : 0;
}

function requireGame(game) {
  if (!game || !game.state || !Array.isArray(game.state.board)) {
    throw new TypeError("Expected a block drop game created by createBlockDrop");
  }
  return game;
}

export function createBlockDrop(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Block Drop options must be an object");
  }

  const input = options.board;
  const inferredWidth = Array.isArray(input) && input[0] ? input[0].length : DEFAULT_WIDTH;
  const inferredHeight = Array.isArray(input) && input.length ? input.length : DEFAULT_HEIGHT;
  const width = positiveInteger(options.width, inferredWidth);
  const height = positiveInteger(options.height, inferredHeight);
  const state = {
    width,
    height,
    board: normalizeBoard(input, width, height),
    active: null,
    score: 0,
    lines: 0,
    gameOver: false,
    status: "playing",
  };
  const game = { state };
  sources.set(game, createSource(options));
  spawn(game);
  return game;
}

export function moveBlockDrop(game, direction = 0) {
  requireGame(game);
  const state = game.state;
  const delta = validDirection(direction);
  if (state.gameOver || !state.active || delta === 0) return game;

  const targetX = state.active.x + delta;
  if (canPlace(state, state.active, targetX, state.active.y)) state.active.x = targetX;
  return game;
}

export function rotateBlockDrop(game, direction = 1) {
  requireGame(game);
  const state = game.state;
  const turn = validDirection(direction);
  if (state.gameOver || !state.active || turn === 0) return game;

  const shape = rotatedShape(state.active.shape, turn);
  const offsets = [0, -1, 1, -2, 2];
  for (const yOffset of [0, -1, 1]) {
    const targetY = state.active.y + yOffset;
    if (targetY < 0) continue;
    for (const xOffset of offsets) {
      const targetX = state.active.x + xOffset;
      if (!canPlace(state, state.active, targetX, targetY, shape)) continue;
      state.active.x = targetX;
      state.active.y = targetY;
      state.active.shape = shape;
      state.active.rotation = (state.active.rotation + (turn > 0 ? 1 : 3)) % 4;
      return game;
    }
  }
  return game;
}

export function stepBlockDrop(game) {
  requireGame(game);
  const state = game.state;
  if (state.gameOver || !state.active) return game;

  if (canPlace(state, state.active, state.active.x, state.active.y + 1)) {
    state.active.y += 1;
  } else {
    lock(game);
  }
  return game;
}

export function dropBlockDrop(game) {
  requireGame(game);
  const state = game.state;
  if (state.gameOver || !state.active) return game;

  while (canPlace(state, state.active, state.active.x, state.active.y + 1)) {
    state.active.y += 1;
  }
  lock(game);
  return game;
}
