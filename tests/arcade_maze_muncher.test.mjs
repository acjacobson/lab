import assert from "node:assert/strict";
import test from "node:test";

import {
  createMazeMuncher,
  setMazeDirection,
  stepMazeMuncher,
} from "../lab/static/games/arcade/maze-muncher.mjs";

test("a new maze muncher has a fixed maze, pellets, and starting state", () => {
  const game = createMazeMuncher();
  const walkableTiles = game.map
    .join("")
    .split("")
    .filter((cell) => cell === ".").length;
  const occupiedSpawns = [game.player, ...game.enemies]
    .filter((actor, index, actors) => actors.findIndex((candidate) => (
      candidate.x === actor.x && candidate.y === actor.y
    )) === index)
    .length;

  assert.equal(game.map.length, 7);
  assert.equal(game.map[0].length, 9);
  assert.ok(game.map.every((row) => typeof row === "string" && row.length === 9));
  assert.equal(game.player.x, 1);
  assert.equal(game.player.y, 1);
  assert.equal(game.score, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.status, "playing");
  assert.ok(game.enemies.length >= 1);
  assert.equal(game.pellets.length, walkableTiles - occupiedSpawns);
  assert.ok(game.pellets.some(({ x, y }) => x === 2 && y === 1));
});

test("a direction into a wall leaves the player in place", () => {
  const game = createMazeMuncher();
  setMazeDirection(game, "up");

  stepMazeMuncher(game);

  assert.deepEqual(
    { x: game.player.x, y: game.player.y },
    { x: 1, y: 1 },
  );
  assert.equal(game.score, 0);
});

test("a valid direction moves the player one tile", () => {
  const game = createMazeMuncher();
  setMazeDirection(game, "right");

  stepMazeMuncher(game);

  assert.deepEqual(
    { x: game.player.x, y: game.player.y },
    { x: 2, y: 1 },
  );
  assert.equal(game.player.direction, "right");
});

test("moving onto a pellet awards points and removes that pellet", () => {
  const game = createMazeMuncher();
  const pelletCount = game.pellets.length;
  setMazeDirection(game, "right");

  stepMazeMuncher(game);

  assert.equal(game.score, 10);
  assert.equal(game.pellets.length, pelletCount - 1);
  assert.equal(game.pellets.some(({ x, y }) => x === 2 && y === 1), false);
});

test("enemy movement follows the same deterministic choice every time", () => {
  const first = createMazeMuncher();
  const second = createMazeMuncher();
  setMazeDirection(first, "up");
  setMazeDirection(second, "up");

  stepMazeMuncher(first);
  stepMazeMuncher(second);

  assert.deepEqual(
    first.enemies.map(({ x, y, direction }) => ({ x, y, direction })),
    second.enemies.map(({ x, y, direction }) => ({ x, y, direction })),
  );
  assert.deepEqual(
    first.enemies.map(({ x, y }) => ({ x, y })),
    [{ x: 6, y: 1 }, { x: 6, y: 5 }],
  );
});

test("a collision costs a life and resets the player and enemies", () => {
  const game = createMazeMuncher({
    enemyStarts: [{ x: 2, y: 1 }],
    enemyDirections: ["left"],
    lives: 2,
    pellets: [],
  });
  setMazeDirection(game, "right");

  stepMazeMuncher(game);

  assert.equal(game.lives, 1);
  assert.equal(game.status, "playing");
  assert.deepEqual(
    { x: game.player.x, y: game.player.y },
    { x: 1, y: 1 },
  );
  assert.deepEqual(
    game.enemies.map(({ x, y }) => ({ x, y })),
    [{ x: 2, y: 1 }],
  );
});

test("collecting the final pellet completes the level", () => {
  const game = createMazeMuncher({
    enemyStarts: [],
    pellets: [{ x: 2, y: 1 }],
  });
  setMazeDirection(game, "right");

  stepMazeMuncher(game);

  assert.equal(game.score, 10);
  assert.equal(game.pellets.length, 0);
  assert.equal(game.status, "won");
});

test("losing the last life ends the level and freezes the game", () => {
  const game = createMazeMuncher({
    enemyStarts: [{ x: 2, y: 1 }],
    enemyDirections: ["left"],
    lives: 1,
    pellets: [],
  });
  setMazeDirection(game, "right");

  stepMazeMuncher(game);

  assert.equal(game.lives, 0);
  assert.equal(game.status, "lost");
  assert.equal(game.gameOver, true);

  stepMazeMuncher(game);
  assert.deepEqual(
    { x: game.player.x, y: game.player.y },
    { x: 1, y: 1 },
  );
});
