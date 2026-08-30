import { WORLD_SCALE, createTradeState } from "./trading.mjs";

export const TILE_SIZE = 16;
export const SHIP_SPEED = 70;
export const MAP_SCALE = WORLD_SCALE;

function makeDefaultMap() {
  const width = 64;
  const height = 40;
  const cells = Array.from({ length: height }, () => Array(width).fill("."));

  const paintIsland = (cx, cy, rx, ry) => {
    for (let y = Math.max(0, cy - ry - 1); y <= Math.min(height - 1, cy + ry + 1); y += 1) {
      for (let x = Math.max(0, cx - rx - 1); x <= Math.min(width - 1, cx + rx + 1); x += 1) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const edge = 1 + 0.08 * Math.sin(x * 1.7 + y * 0.8);
        if (dx * dx + dy * dy < edge) cells[y][x] = "#";
      }
    }
  };

  paintIsland(7, 7, 12, 8);
  paintIsland(55, 8, 11, 7);
  paintIsland(12, 34, 10, 7);
  paintIsland(54, 33, 14, 9);
  paintIsland(31, 5, 5, 4);
  paintIsland(33, 36, 4, 3);

  const baseMap = cells.map((row) => row.join(""));
  return baseMap.flatMap((row) => {
    const scaledRow = [...row].map((cell) => cell.repeat(MAP_SCALE)).join("");
    return Array(MAP_SCALE).fill(scaledRow);
  });
}

export const DEFAULT_MAP = makeDefaultMap();

function validateMap(map) {
  if (!Array.isArray(map) || map.length === 0 || map[0].length === 0) {
    throw new Error("Map must contain at least one row and column");
  }
  const width = map[0].length;
  if (!map.every((row) => typeof row === "string" && row.length === width)) {
    throw new Error("Map rows must be equal-length strings");
  }
}

export function isWaterAt(world, x, y) {
  const tileX = Math.floor(x / world.tileSize);
  const tileY = Math.floor(y / world.tileSize);
  if (tileX < 0 || tileY < 0 || tileX >= world.width || tileY >= world.height) return false;
  return world.map[tileY][tileX] === ".";
}

function canShipFit(world, x, y, radius) {
  const samples = [
    [0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
    [radius * 0.7, radius * 0.7], [radius * 0.7, -radius * 0.7],
    [-radius * 0.7, radius * 0.7], [-radius * 0.7, -radius * 0.7],
  ];
  return samples.every(([dx, dy]) => isWaterAt(world, x + dx, y + dy));
}

function headingFor(x, y, fallback) {
  if (x === 0 && y === 0) return fallback;
  const horizontal = x > 0 ? "east" : "west";
  const vertical = y > 0 ? "south" : "north";
  if (Math.abs(x) < 0.35) return vertical;
  if (Math.abs(y) < 0.35) return horizontal;
  return `${vertical}-${horizontal}`;
}

export function createGame({ map = DEFAULT_MAP, start, tileSize = TILE_SIZE } = {}) {
  validateMap(map);
  const world = {
    map,
    tileSize,
    width: map[0].length,
    height: map.length,
  };
  const spawn = start ?? {
    x: 79 * tileSize + tileSize / 2,
    y: 51 * tileSize + tileSize / 2,
  };
  const ship = { x: spawn.x, y: spawn.y, radius: 5, heading: "north" };
  if (!canShipFit(world, ship.x, ship.y, ship.radius)) {
    throw new Error("Ship must start on navigable water");
  }
  return { world, ship, trade: createTradeState() };
}

export function stepGame(game, input, deltaSeconds) {
  let dx = Number(input?.x) || 0;
  let dy = Number(input?.y) || 0;
  const length = Math.hypot(dx, dy);
  if (length > 1) {
    dx /= length;
    dy /= length;
  }
  game.ship.heading = headingFor(dx, dy, game.ship.heading);
  if (length === 0) return game;

  const distance = SHIP_SPEED * Math.max(0, Math.min(deltaSeconds, 0.25));
  const steps = Math.max(1, Math.ceil(distance / 2));
  const stepX = (dx * distance) / steps;
  const stepY = (dy * distance) / steps;

  for (let i = 0; i < steps; i += 1) {
    const nextX = game.ship.x + stepX;
    if (canShipFit(game.world, nextX, game.ship.y, game.ship.radius)) game.ship.x = nextX;
    const nextY = game.ship.y + stepY;
    if (canShipFit(game.world, game.ship.x, nextY, game.ship.radius)) game.ship.y = nextY;
  }
  return game;
}
