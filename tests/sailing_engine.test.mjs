import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAP,
  createGame,
  isWaterAt,
  stepGame,
} from "../lab/static/games/sailing/game-engine.mjs";
import {
  PORTS,
  PORT_PROXIMITY_RADIUS,
  buyItem,
  cargoUsed,
  createTradeState,
  nearbyPort,
  sellItem,
} from "../lab/static/games/sailing/trading.mjs";
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

test("the sailing world is twice as wide and tall as the original map", () => {
  assert.equal(DEFAULT_MAP[0].length, 128);
  assert.equal(DEFAULT_MAP.length, 80);
});

test("ports are spread across the enlarged world", () => {
  const xs = PORTS.map((port) => port.berth.x);
  const ys = PORTS.map((port) => port.berth.y);

  assert.ok(Math.max(...xs) - Math.min(...xs) >= 700);
  assert.ok(Math.max(...ys) - Math.min(...ys) >= 700);
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

test("the trading world has exactly four named ports", () => {
  assert.equal(PORTS.length, 4);
  assert.equal(new Set(PORTS.map((port) => port.id)).size, 4);
  assert.ok(PORTS.every((port) => typeof port.name === "string" && port.name.length > 0));
});

test("each port sells exactly five goods with one signature item", () => {
  for (const port of PORTS) {
    assert.equal(port.goods.length, 5);
    assert.equal(port.goods.filter((good) => good.signature).length, 1);
  }
});

test("signature goods are distinct and ordinary goods deliberately overlap", () => {
  const signatures = PORTS.map((port) => port.goods.find((good) => good.signature).itemId);
  assert.equal(new Set(signatures).size, PORTS.length);

  const ordinaryCatalogs = PORTS.map((port) => new Set(
    port.goods.filter((good) => !good.signature).map((good) => good.itemId),
  ));
  const sharedOrdinaryGoods = [...ordinaryCatalogs[0]].filter((itemId) => (
    ordinaryCatalogs.every((catalog) => catalog.has(itemId))
  ));
  assert.ok(sharedOrdinaryGoods.length >= 2);
});

test("every berth is on navigable water without changing land collision", () => {
  const game = createGame();
  for (const port of PORTS) {
    assert.equal(isWaterAt(game.world, port.berth.x, port.berth.y), true, port.name);
  }
});

test("port proximity includes the deterministic boundary but not beyond it", () => {
  const port = PORTS[0];
  assert.equal(
    nearbyPort({ x: port.berth.x + PORT_PROXIMITY_RADIUS, y: port.berth.y }, [port]),
    port,
  );
  assert.equal(
    nearbyPort({ x: port.berth.x + PORT_PROXIMITY_RADIUS + 0.01, y: port.berth.y }, [port]),
    null,
  );
});

test("a player can buy one unit and sell it at another port", () => {
  const source = PORTS[0];
  const destination = PORTS[1];
  const signature = source.goods.find((good) => good.signature);
  const trade = createTradeState();

  assert.equal(buyItem(trade, source, signature.itemId).ok, true);
  assert.equal(cargoUsed(trade), 1);
  assert.equal(sellItem(trade, destination, signature.itemId).ok, true);
  assert.equal(cargoUsed(trade), 0);
});

test("insufficient funds leave a buy transaction unchanged", () => {
  const port = PORTS[0];
  const good = port.goods[0];
  const trade = createTradeState({ coins: good.buyPrice - 1 });
  const before = JSON.stringify(trade);

  const result = buyItem(trade, port, good.itemId);

  assert.equal(result.ok, false);
  assert.match(result.reason, /fund/i);
  assert.equal(JSON.stringify(trade), before);
});

test("full cargo rejects a buy without changing funds or cargo", () => {
  const port = PORTS[0];
  const [firstGood, secondGood] = port.goods;
  const trade = createTradeState({ capacity: 1 });
  assert.equal(buyItem(trade, port, firstGood.itemId).ok, true);
  const before = JSON.stringify(trade);

  const result = buyItem(trade, port, secondGood.itemId);

  assert.equal(result.ok, false);
  assert.match(result.reason, /cargo/i);
  assert.equal(JSON.stringify(trade), before);
});

test("unknown and absent items do nothing", () => {
  const port = PORTS[0];
  const trade = createTradeState();
  const before = JSON.stringify(trade);

  const unknownBuy = buyItem(trade, port, "not-a-real-good");
  const absentSell = sellItem(trade, port, "not-a-real-good");

  assert.equal(unknownBuy.ok, false);
  assert.equal(absentSell.ok, false);
  assert.equal(JSON.stringify(trade), before);
});

test("all advertised buy and sell prices are positive integers", () => {
  for (const port of PORTS) {
    for (const good of port.goods) {
      assert.equal(Number.isInteger(good.buyPrice), true);
      assert.equal(Number.isInteger(good.sellPrice), true);
      assert.ok(good.buyPrice > 0);
      assert.ok(good.sellPrice > 0);
    }
    for (const price of Object.values(port.sellPrices)) {
      assert.equal(Number.isInteger(price), true);
      assert.ok(price > 0);
    }
  }
});

test("signature goods support a profitable starter route", () => {
  const source = PORTS[0];
  const destination = PORTS[1];
  const signature = source.goods.find((good) => good.signature);
  const trade = createTradeState();
  const startingCoins = trade.coins;

  assert.equal(buyItem(trade, source, signature.itemId).ok, true);
  assert.equal(sellItem(trade, destination, signature.itemId).ok, true);
  assert.ok(trade.coins > startingCoins);
});

test("selling a signature item at its source cannot create same-port arbitrage", () => {
  for (const port of PORTS) {
    const signature = port.goods.find((good) => good.signature);
    const trade = createTradeState();
    assert.equal(buyItem(trade, port, signature.itemId).ok, true);
    assert.equal(sellItem(trade, port, signature.itemId).ok, true);
    assert.ok(trade.coins < 100, port.name);
  }
});
