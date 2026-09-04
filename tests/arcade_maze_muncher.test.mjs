import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createMazeMuncher,
  restartMazeMuncher,
  setMazeDirection,
  startMazeMuncher,
  stepMazeMuncher,
} from "../lab/static/games/arcade/maze-muncher.mjs";

function position(actor) {
  return { x: actor.x, y: actor.y };
}

function countWalkable(map) {
  return map.join("").split("").filter((cell) => cell !== "#").length;
}

const MAZE_SEARCH_DIRECTIONS = Object.freeze(["left", "right", "up", "down"]);
const MAZE_SEARCH_MAX_STEPS = 220;
const MAZE_SEARCH_BEAM_WIDTH = 32;

function cloneMazeState(game) {
  return JSON.parse(JSON.stringify(game));
}

function mazeSearchKey(game) {
  const player = game.player;
  const enemies = game.enemies.map((enemy) => `${enemy.x},${enemy.y},${enemy.direction}`).join(";");
  const pellets = game.pellets.map(({ x, y }) => `${x},${y}`).join(";");
  return [
    game.lives,
    game.status,
    game.phase,
    game.collisionGraceTicks ?? 0,
    `${player.x},${player.y},${player.direction},${player.requestedDirection}`,
    enemies,
    pellets,
  ].join("|");
}

function mazeSearchHeuristic(game, depth) {
  if (game.status === "won") return 1e12;
  if (game.status === "lost") return -1e12;
  const collected = game.totalPellets - game.remainingPellets;
  const minEnemyDistance = game.enemies.length
    ? Math.min(...game.enemies.map((enemy) => (
      Math.abs(enemy.x - game.player.x) + Math.abs(enemy.y - game.player.y)
    )))
    : 20;
  const dangerPenalty = minEnemyDistance <= 1 ? 10_000 : minEnemyDistance <= 2 ? 2_000 : 0;
  return collected * 10_000
    + game.lives * 200
    - depth * 2
    + Math.min(minEnemyDistance, 12) * 20
    - dangerPenalty;
}

function mazeSearchResult(game) {
  return {
    status: game.status,
    phase: game.phase,
    score: game.score,
    lives: game.lives,
    remainingPellets: game.remainingPellets,
    boardCleared: game.boardCleared,
    finished: game.finished,
    collisionGraceTicks: game.collisionGraceTicks,
  };
}

function mazeRouteHash(route) {
  return createHash("sha256").update(route.join(",")).digest("hex").slice(0, 16);
}

function findDeterministicClearRoute() {
  const initial = createMazeMuncher();
  startMazeMuncher(initial);
  let beam = [{ game: initial, route: [], value: mazeSearchHeuristic(initial, 0) }];
  let generated = 0;
  let generationOrder = 0;

  for (let depth = 0; depth < MAZE_SEARCH_MAX_STEPS; depth += 1) {
    const next = [];
    const seen = new Set();
    for (const node of beam) {
      for (const direction of MAZE_SEARCH_DIRECTIONS) {
        const game = cloneMazeState(node.game);
        setMazeDirection(game, direction);
        stepMazeMuncher(game);
        const tieBreak = generationOrder;
        generationOrder += 1;
        generated += 1;
        if (game.status === "won") {
          return {
            route: [...node.route, direction],
            generated,
            result: mazeSearchResult(game),
          };
        }
        if (game.status === "lost") continue;
        const stateKey = mazeSearchKey(game);
        if (seen.has(stateKey)) continue;
        seen.add(stateKey);
        const route = [...node.route, direction];
        next.push({
          game,
          route,
          value: mazeSearchHeuristic(game, depth + 1),
          tieBreak,
        });
      }
    }
    next.sort((first, second) => {
      if (first.value !== second.value) return second.value - first.value;
      // Make equal-score selection explicit instead of relying on stable sort.
      return first.tieBreak - second.tieBreak;
    });
    beam = next.slice(0, MAZE_SEARCH_BEAM_WIDTH);
    if (beam.length === 0) break;
  }
  return { route: null, generated, result: null };
}

test("a new maze muncher is a ready 15 by 11 multi-route board with a full pellet field", () => {
  const game = createMazeMuncher();
  const walkableTiles = countWalkable(game.map);

  assert.equal(game.map.length, 11);
  assert.ok(game.map.every((row) => typeof row === "string" && row.length === 15));
  assert.ok(game.map.some((row) => row.includes(".")));
  assert.equal(game.width, 15);
  assert.equal(game.height, 11);
  assert.equal(game.status, "ready");
  assert.equal(game.phase, "ready");
  assert.equal(game.gameOver, false);
  assert.equal(game.finished, false);
  assert.equal(game.score, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.player.direction, "left");
  assert.equal(game.player.requestedDirection, "left");
  assert.equal(game.enemies.length, 2);
  assert.deepEqual(game.enemies.map((enemy) => enemy.profile), ["chaser", "patrol"]);
  assert.notEqual(game.enemies[0].profile, game.enemies[1].profile);
  assert.equal(game.totalPellets, walkableTiles - 3);
  assert.equal(game.remainingPellets, game.totalPellets);
  assert.equal(game.pellets.length, game.totalPellets);
  assert.equal(game.progress, 0);
});

test("a direction into a wall is blocked while the requested turn remains buffered", () => {
  const game = createMazeMuncher({ enemyStarts: [], pellets: [{ x: 13, y: 9 }] });
  setMazeDirection(game, "up");

  stepMazeMuncher(game);

  assert.deepEqual(position(game.player), { x: 1, y: 1 });
  assert.equal(game.player.direction, "left");
  assert.equal(game.player.requestedDirection, "up");
  assert.equal(game.score, 0);
});

test("a buffered turn is taken at the first legal intersection", () => {
  const game = createMazeMuncher({ enemyStarts: [], pellets: [{ x: 13, y: 9 }] });
  setMazeDirection(game, "right");
  stepMazeMuncher(game);
  assert.deepEqual(position(game.player), { x: 2, y: 1 });

  setMazeDirection(game, "down");
  stepMazeMuncher(game);
  stepMazeMuncher(game);
  stepMazeMuncher(game);
  assert.deepEqual(position(game.player), { x: 5, y: 1 });
  assert.equal(game.player.direction, "right");
  assert.equal(game.player.requestedDirection, "down");

  stepMazeMuncher(game);
  assert.deepEqual(position(game.player), { x: 5, y: 2 });
  assert.equal(game.player.direction, "down");
});

test("a valid direction moves one fixed tile and collects a pellet for ten points", () => {
  const game = createMazeMuncher({ enemyStarts: [], pellets: [{ x: 2, y: 1 }, { x: 13, y: 9 }] });
  setMazeDirection(game, "right");

  stepMazeMuncher(game);

  assert.deepEqual(position(game.player), { x: 2, y: 1 });
  assert.equal(game.player.direction, "right");
  assert.equal(game.score, 10);
  assert.equal(game.remainingPellets, 1);
  assert.equal(game.pellets.some(({ x, y }) => x === 2 && y === 1), false);
  assert.equal(game.progress, 0.5);
});

test("the two enemy profiles are deterministic and produce distinct movement", () => {
  const first = createMazeMuncher();
  const second = createMazeMuncher();
  startMazeMuncher(first);
  startMazeMuncher(second);

  stepMazeMuncher(first);
  stepMazeMuncher(second);

  assert.deepEqual(
    first.enemies.map(({ x, y, direction, profile }) => ({ x, y, direction, profile })),
    second.enemies.map(({ x, y, direction, profile }) => ({ x, y, direction, profile })),
  );
  assert.notDeepEqual(
    first.enemies.map(position),
    first.enemies.map((enemy) => position(first.enemies[0])).slice(0, first.enemies.length),
  );
  assert.equal(first.enemies[0].profile, "chaser");
  assert.equal(first.enemies[1].profile, "patrol");
  assert.notEqual(first.enemies[0].direction, first.enemies[1].direction);
});

test("a collision costs one life, records life loss, and resets actors to their spawns", () => {
  const game = createMazeMuncher({
    enemyStarts: [{ x: 2, y: 1 }, { x: 13, y: 9 }],
    enemyDirections: ["left", "up"],
    lives: 2,
    pellets: [{ x: 12, y: 9 }],
  });
  setMazeDirection(game, "right");

  stepMazeMuncher(game);

  assert.equal(game.lives, 1);
  assert.equal(game.status, "playing");
  assert.equal(game.phase, "life-lost");
  assert.equal(game.lastEvent, "life-lost");
  assert.equal(game.lifeLost, true);
  assert.deepEqual(position(game.player), { x: 1, y: 1 });
  assert.deepEqual(game.enemies.map(position), [{ x: 2, y: 1 }, { x: 13, y: 9 }]);
  assert.equal(game.remainingPellets, 1);
});

test("losing the final life enters game over and freezes the simulation", () => {
  const game = createMazeMuncher({
    enemyStarts: [{ x: 2, y: 1 }],
    enemyDirections: ["left"],
    lives: 1,
    pellets: [{ x: 13, y: 9 }],
  });
  setMazeDirection(game, "right");

  stepMazeMuncher(game);
  const frozen = JSON.stringify(game);
  stepMazeMuncher(game);

  assert.equal(game.lives, 0);
  assert.equal(game.status, "lost");
  assert.equal(game.phase, "game-over");
  assert.equal(game.gameOver, true);
  assert.equal(game.finished, true);
  assert.equal(game.lastEvent, "game-over");
  assert.equal(JSON.stringify(game), frozen);
});

test("clearing the final pellet enters board-cleared and freezes the simulation", () => {
  const game = createMazeMuncher({
    enemyStarts: [],
    pellets: [{ x: 2, y: 1 }],
  });
  setMazeDirection(game, "right");

  stepMazeMuncher(game);
  const frozen = JSON.stringify(game);
  stepMazeMuncher(game);

  assert.equal(game.score, 10);
  assert.equal(game.remainingPellets, 0);
  assert.equal(game.status, "won");
  assert.equal(game.phase, "board-cleared");
  assert.equal(game.boardCleared, true);
  assert.equal(game.gameOver, true);
  assert.equal(game.finished, true);
  assert.equal(game.lastEvent, "board-cleared");
  assert.equal(JSON.stringify(game), frozen);
});

test("a complete short route supports a start-to-clear flow", () => {
  const game = createMazeMuncher({
    enemyStarts: [],
    pellets: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }],
  });
  assert.equal(game.status, "ready");

  setMazeDirection(game, "right");
  stepMazeMuncher(game);
  stepMazeMuncher(game);
  stepMazeMuncher(game);

  assert.equal(game.status, "won");
  assert.equal(game.phase, "board-cleared");
  assert.equal(game.score, 30);
});

test("restart restores the ready state, score, lives, actors, and pellet field", () => {
  const game = createMazeMuncher({
    enemyStarts: [{ x: 13, y: 1 }, { x: 13, y: 9 }],
    pellets: [{ x: 2, y: 1 }, { x: 3, y: 1 }],
  });
  setMazeDirection(game, "right");
  stepMazeMuncher(game);
  stepMazeMuncher(game);
  assert.equal(game.status, "won");

  restartMazeMuncher(game);

  assert.equal(game.status, "ready");
  assert.equal(game.phase, "ready");
  assert.equal(game.gameOver, false);
  assert.equal(game.finished, false);
  assert.equal(game.score, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.remainingPellets, 2);
  assert.equal(game.progress, 0);
  assert.deepEqual(position(game.player), { x: 1, y: 1 });
  assert.equal(game.player.direction, "left");
  assert.equal(game.player.requestedDirection, "left");
  assert.deepEqual(game.enemies.map(position), [{ x: 13, y: 1 }, { x: 13, y: 9 }]);
});

test("invalid directions are ignored without breaking the deterministic step", () => {
  const game = createMazeMuncher({ enemyStarts: [], pellets: [{ x: 2, y: 1 }] });
  setMazeDirection(game, "__proto__");
  setMazeDirection(game, "constructor");

  assert.equal(game.player.direction, "left");
  assert.equal(game.player.requestedDirection, "left");
  assert.doesNotThrow(() => stepMazeMuncher(game));
  assert.deepEqual(position(game.player), { x: 1, y: 1 });
});

test("overlapping and duplicate spawns are rejected", () => {
  assert.throws(
    () => createMazeMuncher({ enemyStarts: [{ x: 1, y: 1 }] }),
    /overlap.*player.*1,1/i,
  );
  assert.throws(
    () => createMazeMuncher({ enemyStarts: [{ x: 2, y: 1 }, { x: 2, y: 1 }] }),
    /duplicate.*enemy.*2,1/i,
  );
});

test("a post-collision reset gives the player one safe tick before enemies can re-enter the spawn", () => {
  const game = createMazeMuncher({
    enemyStarts: [{ x: 2, y: 1 }],
    enemyDirections: ["left"],
    enemyProfiles: ["chaser"],
    lives: 3,
    pellets: [{ x: 13, y: 9 }],
  });
  setMazeDirection(game, "right");
  stepMazeMuncher(game);

  assert.equal(game.lives, 2);
  assert.equal(game.phase, "life-lost");
  assert.equal(game.collisionGraceTicks, 1);
  stepMazeMuncher(game);

  assert.equal(game.lives, 2);
  assert.equal(game.phase, "playing");
  assert.equal(game.lifeLost, false);
  assert.equal(game.collisionGraceTicks, 0);
});

test("collecting the final pellet during collision grace clears grace before the board-cleared terminal state", () => {
  const game = createMazeMuncher({
    playerDirection: "left",
    enemyStarts: [{ x: 2, y: 1 }],
    enemyDirections: ["left"],
    enemyProfiles: ["chaser"],
    pellets: [{ x: 1, y: 2 }],
  });
  startMazeMuncher(game);
  stepMazeMuncher(game);

  assert.equal(game.phase, "life-lost");
  assert.equal(game.collisionGraceTicks, 1);

  setMazeDirection(game, "down");
  stepMazeMuncher(game);

  assert.equal(game.status, "won");
  assert.equal(game.phase, "board-cleared");
  assert.equal(game.boardCleared, true);
  assert.equal(game.finished, true);
  assert.equal(game.remainingPellets, 0);
  assert.equal(game.collisionGraceTicks, 0);
});

test("a bounded deterministic search repeats the same route and terminal result before game over", () => {
  const first = findDeterministicClearRoute();
  const second = findDeterministicClearRoute();

  for (const result of [first, second]) {
    assert.ok(result.route, `no clear route found within ${MAZE_SEARCH_MAX_STEPS} steps`);
    assert.ok(result.route.length <= MAZE_SEARCH_MAX_STEPS);
    assert.ok(result.generated <= MAZE_SEARCH_MAX_STEPS * MAZE_SEARCH_BEAM_WIDTH * MAZE_SEARCH_DIRECTIONS.length);
  }
  assert.deepEqual(second.route, first.route);
  assert.deepEqual(second.result, first.result);
  assert.equal(second.generated, first.generated);
  assert.equal(first.route.length, 164);
  assert.equal(first.result.score, 720);
  assert.equal(first.result.lives, 1);
  assert.equal(mazeRouteHash(first.route), "84fdf521c8766e0c");

  const replay = createMazeMuncher();
  startMazeMuncher(replay);
  for (const direction of first.route) {
    setMazeDirection(replay, direction);
    stepMazeMuncher(replay);
  }

  assert.deepEqual(mazeSearchResult(replay), first.result);
});
