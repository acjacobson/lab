import assert from "node:assert/strict";
import test from "node:test";

import {
  createAlienBlaster,
  fireAlienBlaster,
  moveAlienBlaster,
  stepAlienBlaster,
} from "../lab/static/games/arcade/alien-blaster.mjs";

function quietGame(options = {}) {
  return createAlienBlaster({ enemyFireEnabled: false, ...options });
}

test("a new game starts with a live formation, centered cannon, and three lives", () => {
  const game = quietGame();

  assert.equal(game.aliens.length, 18);
  assert.equal(game.aliens.filter((alien) => alien.alive).length, 18);
  assert.equal(game.lives, 3);
  assert.equal(game.score, 0);
  assert.equal(game.status, "playing");
  assert.ok(game.cannon.x > 0);
  assert.ok(game.cannon.x + game.cannon.width < game.width);
  assert.equal(game.playerShots.length, 0);
  assert.equal(game.enemyShots.length, 0);
});

test("the cannon stays inside the screen bounds", () => {
  const game = quietGame({ width: 200 });
  const startingX = game.cannon.x;

  moveAlienBlaster(game, -1, 10);
  assert.equal(game.cannon.x, 0);

  moveAlienBlaster(game, 1, 10);
  assert.equal(game.cannon.x, game.width - game.cannon.width);
  assert.notEqual(game.cannon.x, startingX);
});

test("firing creates one upward player shot above the cannon", () => {
  const game = quietGame();

  fireAlienBlaster(game);

  assert.equal(game.playerShots.length, 1);
  const [shot] = game.playerShots;
  assert.equal(shot.x, game.cannon.x + game.cannon.width / 2 - shot.width / 2);
  assert.ok(shot.y < game.cannon.y);
  assert.ok(shot.vy < 0);
});

test("a player shot destroys an alien and adds its points", () => {
  const game = quietGame({
    width: 160,
    height: 220,
    rows: 1,
    columns: 1,
    formationX: 66,
    formationY: 30,
    formationSpeed: 0,
    playerShotSpeed: 180,
  });

  fireAlienBlaster(game);
  for (let i = 0; i < 20 && game.status === "playing"; i += 1) {
    stepAlienBlaster(game, 0.1, { enemyFire: false });
  }

  assert.equal(game.aliens[0].alive, false);
  assert.equal(game.score, 10);
  assert.equal(game.playerShots.length, 0);
  assert.equal(game.status, "won");
});

test("the formation descends and reverses when it reaches an edge", () => {
  const game = quietGame({
    width: 100,
    height: 200,
    rows: 1,
    columns: 2,
    alienWidth: 20,
    alienGapX: 5,
    formationX: 50,
    formationSpeed: 20,
    formationStepDown: 12,
  });
  const startingY = game.aliens[0].y;

  stepAlienBlaster(game, 1, { enemyFire: false });

  assert.equal(game.formation.direction, -1);
  assert.equal(game.aliens[0].y, startingY + 12);
});

test("deterministic enemy-fire input can hit the cannon and cost a life", () => {
  const game = quietGame({
    width: 160,
    height: 220,
    rows: 1,
    columns: 1,
    formationSpeed: 0,
    lives: 2,
  });
  const cannonShot = {
    x: game.cannon.x + game.cannon.width / 2,
    y: game.cannon.y,
    width: 2,
    height: 8,
    vy: 0,
  };

  stepAlienBlaster(game, 0, { enemyFire: cannonShot });

  assert.equal(game.lives, 1);
  assert.equal(game.status, "playing");
  assert.equal(game.enemyShots.length, 0);
});

test("an injected random source can deterministically create enemy fire", () => {
  const game = createAlienBlaster({
    enemyFireEnabled: true,
    enemyFireInterval: 0.5,
    rng: () => 0,
  });

  stepAlienBlaster(game, 0.5);

  assert.equal(game.enemyShots.length, 1);
  assert.ok(game.enemyShots[0].vy > 0);
});

test("losing the last life ends the game", () => {
  const game = quietGame({ lives: 1, rows: 1, columns: 1 });
  game.enemyShots.push({
    x: game.cannon.x + game.cannon.width / 2,
    y: game.cannon.y,
    width: 2,
    height: 8,
    vy: 0,
  });

  stepAlienBlaster(game, 0, { enemyFire: false });

  assert.equal(game.lives, 0);
  assert.equal(game.status, "lost");
  assert.equal(game.finished, true);
});
