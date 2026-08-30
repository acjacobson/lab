import assert from "node:assert/strict";
import test from "node:test";

import * as blockDrop from "../lab/static/games/arcade/block-drop.mjs";

const {
  createBlockDrop,
  dropBlockDrop,
  moveBlockDrop,
  rotateBlockDrop,
  stepBlockDrop,
} = blockDrop;

function emptyBoard(width = 10, height = 20) {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

test("the module exposes only the five block drop operations", () => {
  assert.deepEqual(Object.keys(blockDrop).sort(), [
    "createBlockDrop",
    "dropBlockDrop",
    "moveBlockDrop",
    "rotateBlockDrop",
    "stepBlockDrop",
  ].sort());
});

test("a new game has an empty board and deterministic active piece", () => {
  const game = createBlockDrop({ sequence: ["I", "O"] });
  const state = game.state;

  assert.deepEqual(Object.keys(game), ["state"]);
  assert.deepEqual(Object.keys(state).sort(), [
    "active",
    "board",
    "gameOver",
    "height",
    "lines",
    "score",
    "status",
    "width",
  ].sort());
  assert.equal(state.width, 10);
  assert.equal(state.height, 20);
  assert.equal(state.board.length, 20);
  assert.ok(state.board.every((row) => row.length === 10 && row.every((cell) => cell === null)));
  assert.equal(state.score, 0);
  assert.equal(state.lines, 0);
  assert.equal(state.gameOver, false);
  assert.equal(state.status, "playing");
  assert.equal(state.active.type, "I");
  assert.deepEqual(state.active.shape, [[1, 1, 1, 1]]);
  assert.equal(state.active.x, 3);
  assert.equal(state.active.y, 0);
  assert.equal(state.active.rotation, 0);
});

test("public state does not expose compatibility aliases or transient drop fields", () => {
  const game = createBlockDrop({ sequence: ["T"] });
  const publicObjects = [game, game.state, game.state.active];

  for (const key of ["currentPiece", "piece", "over", "lastCleared", "dropDistance", "matrix", "cells"]) {
    for (const object of publicObjects) {
      assert.equal(key in object, false, `${key} should not be public`);
    }
  }
});

test("horizontal movement advances one column and stops at both board edges", () => {
  const game = createBlockDrop({ sequence: ["I"] });
  const state = game.state;

  moveBlockDrop(game, -1);
  assert.equal(state.active.x, 2);
  moveBlockDrop(game, { x: -1 });
  assert.equal(state.active.x, 2);
  moveBlockDrop(game, -100);
  assert.equal(state.active.x, 2);

  for (let index = 0; index < 10; index += 1) moveBlockDrop(game, -1);
  assert.equal(state.active.x, 0);

  for (let index = 0; index < 10; index += 1) moveBlockDrop(game, 1);
  assert.equal(state.active.x, 6);
  assert.equal(state.active.x + state.active.shape[0].length, state.width);
});

test("rotation changes the active piece while keeping it in bounds", () => {
  const game = createBlockDrop({ sequence: ["T"] });
  const state = game.state;

  rotateBlockDrop(game);

  assert.equal(state.active.rotation, 1);
  assert.deepEqual(state.active.shape, [
    [1, 0],
    [1, 1],
    [1, 0],
  ]);
  assert.ok(state.active.x >= 0);
  assert.ok(state.active.x + state.active.shape[0].length <= state.width);
  assert.ok(state.active.y + state.active.shape.length <= state.height);
});

test("gravity moves a piece down and locks it before spawning the next piece", () => {
  const game = createBlockDrop({ width: 5, height: 4, sequence: ["I", "O"] });
  const state = game.state;

  stepBlockDrop(game);
  stepBlockDrop(game);
  stepBlockDrop(game);
  assert.equal(state.active.type, "I");
  assert.equal(state.active.y, 3);

  stepBlockDrop(game, 10);

  assert.equal(state.active.type, "O");
  assert.equal(state.active.y, 0);
  assert.deepEqual(state.board[3], ["I", "I", "I", "I", null]);
  assert.equal(state.gameOver, false);
});

test("hard drop clears a completed line and awards standard line score", () => {
  const board = emptyBoard();
  board[19] = ["X", "X", "X", null, null, null, null, "X", "X", "X"];
  const game = createBlockDrop({ sequence: ["I", "O"], board });
  const state = game.state;

  dropBlockDrop(game);

  assert.equal(state.lines, 1);
  assert.equal(state.score, 100);
  assert.ok(state.board[19].every((cell) => cell === null));
  assert.equal(state.active.type, "O");
});

test("clearing two lines awards the deterministic double-line score", () => {
  const board = emptyBoard();
  board[18] = ["X", "X", "X", "X", null, null, "X", "X", "X", "X"];
  board[19] = ["X", "X", "X", "X", null, null, "X", "X", "X", "X"];
  const game = createBlockDrop({ sequence: ["O", "I"], board });
  const state = game.state;

  dropBlockDrop(game);

  assert.equal(state.lines, 2);
  assert.equal(state.score, 300);
  assert.ok(state.board[18].every((cell) => cell === null));
  assert.ok(state.board[19].every((cell) => cell === null));
});

test("sequence and pieceSource are the only supported deterministic piece inputs", () => {
  const sourceGame = createBlockDrop({ pieceSource: (index) => (index === 0 ? "T" : "O") });
  assert.equal(sourceGame.state.active.type, "T");
  dropBlockDrop(sourceGame);
  assert.equal(sourceGame.state.active.type, "O");

  const aliases = createBlockDrop({
    pieces: ["O"],
    pieceSequence: ["T"],
    fixedSequence: ["Z"],
    rng: () => 0.99,
  });
  assert.equal(aliases.state.active.type, "I");

  assert.throws(() => createBlockDrop({ sequence: [[[1]]] }), /standard tetromino/);
  assert.throws(() => createBlockDrop({ pieceSource: () => [[1]] }), /standard tetromino/);
});

test("a blocked spawn enters game over and a new game starts clean", () => {
  const board = emptyBoard(4, 4);
  board[0] = ["X", "X", "X", "X"];
  const game = createBlockDrop({ width: 4, height: 4, sequence: ["I"], board });
  const state = game.state;

  assert.equal(state.gameOver, true);
  assert.equal(state.status, "gameover");
  assert.equal(state.active, null);

  dropBlockDrop(game);
  assert.equal(state.status, "gameover");

  const restarted = createBlockDrop({ width: 4, height: 4, sequence: ["I"] });
  assert.equal(restarted.state.gameOver, false);
  assert.equal(restarted.state.score, 0);
  assert.equal(restarted.state.lines, 0);
  assert.ok(restarted.state.board.every((row) => row.every((cell) => cell === null)));
});

test("separate games have fresh mutable boards", () => {
  const first = createBlockDrop({ sequence: ["I"] });
  first.state.board[19][0] = "X";

  const second = createBlockDrop({ sequence: ["I"] });

  assert.equal(second.state.board[19][0], null);
  assert.notStrictEqual(first.state.board, second.state.board);
});
