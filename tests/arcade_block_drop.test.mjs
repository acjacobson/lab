import assert from "node:assert/strict";
import test from "node:test";

import {
  createBlockDrop,
  dropBlockDrop,
  moveBlockDrop,
  rotateBlockDrop,
  stepBlockDrop,
} from "../lab/static/games/arcade/block-drop.mjs";

function emptyBoard(width = 10, height = 20) {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

test("a new game has an empty board and deterministic active piece", () => {
  const game = createBlockDrop({ sequence: ["I", "O"] });

  assert.equal(game.width, 10);
  assert.equal(game.height, 20);
  assert.strictEqual(game.state.board, game.board);
  assert.equal(game.board.length, 20);
  assert.ok(game.board.every((row) => row.length === 10 && row.every((cell) => cell === null)));
  assert.equal(game.score, 0);
  assert.equal(game.lines, 0);
  assert.equal(game.gameOver, false);
  assert.equal(game.status, "playing");
  assert.equal(game.active.type, "I");
  assert.deepEqual(game.active.shape, [[1, 1, 1, 1]]);
  assert.equal(game.active.x, 3);
  assert.equal(game.active.y, 0);
  assert.equal(game.active.rotation, 0);
});

test("horizontal movement stops at both board edges", () => {
  const game = createBlockDrop({ sequence: ["I"] });

  moveBlockDrop(game, -100);
  assert.equal(game.active.x, 0);

  moveBlockDrop(game, 100);
  assert.equal(game.active.x, 6);
  assert.equal(game.active.x + game.active.shape[0].length, game.width);
});

test("rotation changes the active piece while keeping it in bounds", () => {
  const game = createBlockDrop({ sequence: ["T"] });

  rotateBlockDrop(game);

  assert.equal(game.active.rotation, 1);
  assert.deepEqual(game.active.shape, [
    [1, 0],
    [1, 1],
    [1, 0],
  ]);
  assert.ok(game.active.x >= 0);
  assert.ok(game.active.x + game.active.shape[0].length <= game.width);
  assert.ok(game.active.y + game.active.shape.length <= game.height);
});

test("gravity moves a piece down and locks it before spawning the next piece", () => {
  const game = createBlockDrop({ width: 5, height: 4, sequence: ["I", "O"] });

  stepBlockDrop(game);
  stepBlockDrop(game);
  stepBlockDrop(game);
  assert.equal(game.active.type, "I");
  assert.equal(game.active.y, 3);

  stepBlockDrop(game);

  assert.equal(game.active.type, "O");
  assert.equal(game.active.y, 0);
  assert.deepEqual(game.board[3], ["I", "I", "I", "I", null]);
  assert.equal(game.gameOver, false);
});

test("hard drop clears a completed line and awards standard line score", () => {
  const board = emptyBoard();
  board[19] = ["X", "X", "X", null, null, null, null, "X", "X", "X"];
  const game = createBlockDrop({ sequence: ["I", "O"], board });

  dropBlockDrop(game);

  assert.equal(game.lines, 1);
  assert.equal(game.score, 100);
  assert.ok(game.board[19].every((cell) => cell === null));
  assert.equal(game.active.type, "O");
});

test("clearing two lines awards the deterministic double-line score", () => {
  const board = emptyBoard();
  board[18] = ["X", "X", "X", "X", null, null, "X", "X", "X", "X"];
  board[19] = ["X", "X", "X", "X", null, null, "X", "X", "X", "X"];
  const game = createBlockDrop({ sequence: ["O", "I"], board });

  dropBlockDrop(game);

  assert.equal(game.lines, 2);
  assert.equal(game.score, 300);
  assert.ok(game.board[18].every((cell) => cell === null));
  assert.ok(game.board[19].every((cell) => cell === null));
});

test("a blocked spawn enters game over and a new game starts clean", () => {
  const board = emptyBoard(4, 4);
  board[0] = ["X", "X", "X", "X"];
  const game = createBlockDrop({ width: 4, height: 4, sequence: ["I"], board });

  assert.equal(game.gameOver, true);
  assert.equal(game.status, "gameover");
  assert.equal(game.active, null);

  dropBlockDrop(game);
  assert.equal(game.status, "gameover");

  const restarted = createBlockDrop({ width: 4, height: 4, sequence: ["I"] });
  assert.equal(restarted.gameOver, false);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.lines, 0);
  assert.ok(restarted.board.every((row) => row.every((cell) => cell === null)));
});
