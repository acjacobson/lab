import assert from "node:assert/strict";
import test from "node:test";

import {
  createGame,
  isWaterAt,
  stepGame,
} from "../lab/static/games/sailing/game-engine.mjs";
import { buildTerrainCells } from "../lab/static/games/sailing/terrain.mjs";

const TEST_MAP = [
  "#####",
  "#...#",
  "#...#",
  "#####",
];

test("the ship starts on navigable water", () => {
  const game = createGame({ map: TEST_MAP, start: { x: 24, y: 24 } });

  assert.equal(isWaterAt(game.world, game.ship.x, game.ship.y), true);
});

test("the opening camera includes enough land to read as an island world", () => {
  const game = createGame();
  const firstX = Math.floor((game.ship.x - 160) / game.world.tileSize);
  const firstY = Math.floor((game.ship.y - 90) / game.world.tileSize);
  let visibleLand = 0;
  for (let y = firstY; y <= firstY + 12; y += 1) {
    for (let x = firstX; x <= firstX + 20; x += 1) {
      if (game.world.map[y]?.[x] === "#") visibleLand += 1;
    }
  }

  assert.ok(visibleLand >= 12);
});

test("held input sails the ship across open water", () => {
  const game = createGame({ map: TEST_MAP, start: { x: 24, y: 24 } });

  stepGame(game, { x: 1, y: 0 }, 0.1);

  assert.ok(game.ship.x > 24);
  assert.equal(game.ship.y, 24);
  assert.equal(game.ship.heading, "east");
});

test("diagonal sailing is not faster than cardinal sailing", () => {
  const cardinal = createGame({ map: TEST_MAP, start: { x: 24, y: 24 } });
  const diagonal = createGame({ map: TEST_MAP, start: { x: 24, y: 24 } });

  stepGame(cardinal, { x: 1, y: 0 }, 0.05);
  stepGame(diagonal, { x: 1, y: 1 }, 0.05);

  const cardinalDistance = Math.hypot(cardinal.ship.x - 24, cardinal.ship.y - 24);
  const diagonalDistance = Math.hypot(diagonal.ship.x - 24, diagonal.ship.y - 24);
  assert.ok(Math.abs(cardinalDistance - diagonalDistance) < 0.001);
});

test("land blocks the ship", () => {
  const game = createGame({ map: TEST_MAP, start: { x: 24, y: 24 } });

  stepGame(game, { x: -1, y: 0 }, 1);

  assert.equal(isWaterAt(game.world, game.ship.x, game.ship.y), true);
  assert.ok(game.ship.x >= 21);
});

test("coastline cells round exposed tile edges into smaller pixel steps", () => {
  const game = createGame({
    map: [
      ".....",
      ".###.",
      ".###.",
      ".###.",
      ".....",
    ],
    start: { x: 8, y: 8 },
  });

  const terrain = buildTerrainCells(game.world, 4);

  assert.equal(terrain.length, 20);
  assert.equal(terrain[0].length, 20);
  assert.equal(terrain[4][4], ".");
  assert.equal(terrain[5][8], "s");
  assert.equal(terrain[8][8], "g");
});