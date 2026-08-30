import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrickBreaker,
  launchBrickBreaker,
  moveBrickBreaker,
  stepBrickBreaker,
} from "../lab/static/games/arcade/brick-breaker.mjs";

const FIXED_STEP = 1 / 60;

function hitBrick(game, brick = game.bricks[0]) {
  game.ball.x = brick.x + brick.width / 2;
  game.ball.y = brick.y + brick.height + game.ball.radius + 1;
  game.ball.vx = 0;
  game.ball.vy = -120;
  stepBrickBreaker(game, FIXED_STEP);
}

function dropBall(game) {
  game.ball.x = game.width / 2;
  game.ball.y = game.height + game.ball.radius + 1;
  game.ball.vx = 0;
  game.ball.vy = 120;
  stepBrickBreaker(game, FIXED_STEP);
}

test("a new game has a deterministic brick layout and three lives", () => {
  const game = createBrickBreaker();

  assert.equal(game.lives, 3);
  assert.equal(game.score, 0);
  assert.equal(game.status, "ready");
  assert.equal(game.bricks.length, 40);
  assert.equal(new Set(game.bricks.map((brick) => `${brick.row}:${brick.column}`)).size, 40);
  assert.ok(game.bricks.every((brick) => brick.width > 0 && brick.height > 0));
  assert.equal(game.ball.launched, false);
});

test("the paddle stays inside the playfield bounds", () => {
  const game = createBrickBreaker({ width: 120 });

  moveBrickBreaker(game, -1, 10);
  assert.equal(game.paddle.x, 0);

  moveBrickBreaker(game, 1, 10);
  assert.equal(game.paddle.x, game.width - game.paddle.width);
});

test("a launched ball bounces off the top and side walls", () => {
  const game = createBrickBreaker({ width: 120, height: 140, brickRows: 2, brickColumns: 2 });
  launchBrickBreaker(game);

  game.ball.x = game.ball.radius + 1;
  game.ball.y = 100;
  game.ball.vx = -120;
  game.ball.vy = 0;
  stepBrickBreaker(game, FIXED_STEP);
  assert.ok(game.ball.vx > 0);

  game.ball.x = 60;
  game.ball.y = game.ball.radius + 1;
  game.ball.vx = 0;
  game.ball.vy = -120;
  stepBrickBreaker(game, FIXED_STEP);
  assert.ok(game.ball.vy > 0);
});

test("a ball hitting the paddle reverses its vertical direction", () => {
  const game = createBrickBreaker({ brickRows: 2, brickColumns: 2 });
  launchBrickBreaker(game);

  game.ball.x = game.paddle.x + game.paddle.width / 2;
  game.ball.y = game.paddle.y - game.ball.radius - 1;
  game.ball.vx = 0;
  game.ball.vy = 120;
  stepBrickBreaker(game, FIXED_STEP);

  assert.ok(game.ball.vy < 0);
  assert.equal(game.status, "playing");
});

test("hitting a brick removes it and awards its points", () => {
  const game = createBrickBreaker({ brickRows: 2, brickColumns: 2 });
  const brickCount = game.bricks.length;
  launchBrickBreaker(game);

  hitBrick(game);

  assert.equal(game.bricks.length, brickCount - 1);
  assert.equal(game.score, 10);
  assert.ok(game.ball.vy > 0);
  assert.equal(game.status, "playing");
});

test("fixed-step updates are independent of frame chunking", () => {
  const oneFrame = createBrickBreaker({ brickRows: 2, brickColumns: 2 });
  const twoFrames = createBrickBreaker({ brickRows: 2, brickColumns: 2 });
  launchBrickBreaker(oneFrame);
  launchBrickBreaker(twoFrames);

  for (const game of [oneFrame, twoFrames]) {
    game.ball.x = 160;
    game.ball.y = 100;
    game.ball.vx = 60;
    game.ball.vy = -90;
  }

  stepBrickBreaker(oneFrame, FIXED_STEP * 2);
  stepBrickBreaker(twoFrames, FIXED_STEP);
  stepBrickBreaker(twoFrames, FIXED_STEP);

  assert.equal(oneFrame.ball.x, twoFrames.ball.x);
  assert.equal(oneFrame.ball.y, twoFrames.ball.y);
  assert.equal(oneFrame.ball.vx, twoFrames.ball.vx);
  assert.equal(oneFrame.ball.vy, twoFrames.ball.vy);
});

test("losing a ball costs one life and resets the round", () => {
  const game = createBrickBreaker({ brickRows: 2, brickColumns: 2 });
  const startingPaddleX = game.paddle.x;
  launchBrickBreaker(game);
  moveBrickBreaker(game, -1, 0.25);
  assert.notEqual(game.paddle.x, startingPaddleX);

  dropBall(game);

  assert.equal(game.lives, 2);
  assert.equal(game.status, "ready");
  assert.equal(game.ball.launched, false);
  assert.equal(game.ball.vx, 0);
  assert.equal(game.ball.vy, 0);
  assert.equal(game.ball.x, game.width / 2);
  assert.equal(game.paddle.x, startingPaddleX);
});

test("clearing the final brick wins the game", () => {
  const game = createBrickBreaker({ brickRows: 1, brickColumns: 1 });
  launchBrickBreaker(game);

  hitBrick(game);

  assert.equal(game.bricks.length, 0);
  assert.equal(game.score, 10);
  assert.equal(game.status, "won");
  assert.equal(game.ball.launched, false);
});

test("losing the last life ends the game", () => {
  const game = createBrickBreaker({ brickRows: 1, brickColumns: 2 });

  for (let life = 0; life < 3; life += 1) {
    launchBrickBreaker(game);
    dropBall(game);
  }

  assert.equal(game.lives, 0);
  assert.equal(game.status, "lost");
  assert.equal(game.ball.launched, false);
  assert.equal(game.score, 0);
});
