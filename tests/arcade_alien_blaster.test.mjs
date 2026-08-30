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

test("fixed substeps make uneven frame chunks deterministic", () => {
  const oneChunk = quietGame({
    width: 100,
    height: 200,
    rows: 1,
    columns: 1,
    alienWidth: 18,
    formationX: 70,
    formationSpeed: 120,
  });
  const manyChunks = quietGame({
    width: 100,
    height: 200,
    rows: 1,
    columns: 1,
    alienWidth: 18,
    formationX: 70,
    formationSpeed: 120,
  });

  stepAlienBlaster(oneChunk, 0.2, { enemyFire: false });
  for (let index = 0; index < 12; index += 1) {
    stepAlienBlaster(manyChunks, 1 / 60, { enemyFire: false });
  }

  assert.deepEqual(oneChunk.aliens, manyChunks.aliens);
  assert.deepEqual(oneChunk.formation, manyChunks.formation);
  assert.equal(oneChunk.accumulator, manyChunks.accumulator);
});

test("a moving formation cannot tunnel past a stationary player shot", () => {
  const game = quietGame({
    width: 120,
    height: 200,
    rows: 1,
    columns: 1,
    alienWidth: 10,
    alienHeight: 10,
    formationX: 20,
    formationY: 60,
    formationSpeed: 240,
  });
  game.playerShots.push({
    x: 55,
    y: 62,
    width: 4,
    height: 4,
    vx: 0,
    vy: 0,
  });

  stepAlienBlaster(game, 0.3, { enemyFire: false });

  assert.equal(game.aliens[0].alive, false);
  assert.equal(game.score, 10);
});

test("a moving cannon cannot tunnel past a stationary enemy shot", () => {
  const game = quietGame({
    width: 160,
    height: 220,
    rows: 1,
    columns: 1,
    formationSpeed: 0,
    lives: 2,
  });
  const startingX = game.cannon.x;
  game.enemyShots.push({
    x: startingX + 32,
    y: game.cannon.y,
    width: 3,
    height: 8,
    vx: 0,
    vy: 0,
  });

  moveAlienBlaster(game, 1, 0.5);
  stepAlienBlaster(game, 0.5, { enemyFire: false });

  assert.equal(game.lives, 1);
  assert.equal(game.cannon.x, startingX);
});

test("diagonal shot sweeps do not use a false axis-aligned union", () => {
  const game = quietGame({
    width: 140,
    height: 180,
    rows: 1,
    columns: 1,
    formationX: 60,
    formationY: 25,
    formationSpeed: 0,
  });
  game.playerShots.push({
    x: 20,
    y: 20,
    width: 4,
    height: 4,
    vx: 240,
    vy: 240,
  });

  stepAlienBlaster(game, 0.25, { enemyFire: false });

  assert.equal(game.aliens[0].alive, true);
  assert.equal(game.score, 0);
});

test("a shot crossing multiple rows hits the nearest alien first", () => {
  const game = quietGame({
    width: 160,
    height: 240,
    rows: 2,
    columns: 1,
    alienWidth: 20,
    alienHeight: 10,
    alienGapY: 10,
    formationX: 70,
    formationY: 30,
    formationSpeed: 0,
    playerShotSpeed: 1000,
  });

  fireAlienBlaster(game);
  stepAlienBlaster(game, 0.2, { enemyFire: false });

  assert.equal(game.aliens[0].alive, true);
  assert.equal(game.aliens[1].alive, false);
  assert.equal(game.score, 10);
  assert.equal(game.status, "playing");
});

test("large elapsed gaps use the documented safety cap", () => {
  const capped = quietGame({ formationSpeed: 72 });
  const cappedReference = quietGame({ formationSpeed: 72 });

  stepAlienBlaster(capped, 1000, { enemyFire: false });
  stepAlienBlaster(cappedReference, 0.5, { enemyFire: false });

  assert.deepEqual(capped.aliens, cappedReference.aliens);
  assert.equal(capped.accumulator, cappedReference.accumulator);
});

test("an impractically tiny fixed step is clamped to one millisecond", () => {
  const game = quietGame({ fixedStep: Number.MIN_VALUE });

  assert.equal(game.fixedStep, 1 / 1000);
  stepAlienBlaster(game, game.fixedStep, { enemyFire: false });
  assert.ok(Number.isFinite(game.accumulator));
});

test("automatic enemy fire clamps tiny intervals and caps work per call", () => {
  let randomCalls = 0;
  const game = createAlienBlaster({
    enemyFireEnabled: true,
    enemyFireInterval: 1e-12,
    enemyFireChance: 1,
    rng: () => {
      randomCalls += 1;
      return 0;
    },
  });

  stepAlienBlaster(game, 1000);

  assert.ok(game.enemyFireInterval > 1e-12);
  assert.ok(game.enemyShots.length <= 8);
  assert.ok(randomCalls <= 16);
});

test("an RNG value of one still selects the final alien", () => {
  const game = createAlienBlaster({
    rows: 1,
    columns: 2,
    formationSpeed: 0,
    enemyFireEnabled: true,
    enemyFireInterval: 1 / 60,
    enemyFireChance: 1,
    rng: () => 1,
  });

  stepAlienBlaster(game, 1 / 60);

  assert.equal(game.enemyShots.length, 1);
  const finalAlien = game.aliens[1];
  assert.equal(game.enemyShots[0].x, finalAlien.x + finalAlien.width / 2 - game.enemyShots[0].width / 2);
});

test("NaN cannon movement is ignored instead of poisoning the position", () => {
  const game = quietGame();
  const startingX = game.cannon.x;

  moveAlienBlaster(game, 1, Number.NaN);

  assert.equal(game.cannon.x, startingX);
  assert.ok(Number.isFinite(game.cannon.x));
});
