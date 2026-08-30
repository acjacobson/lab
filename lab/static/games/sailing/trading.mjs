const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
};

export const PORT_PROXIMITY_RADIUS = 28;
export const TRADE_PROXIMITY_RADIUS = PORT_PROXIMITY_RADIUS;

export const ITEM_CATALOG = freezeDeep({
  amber: { id: "amber", name: "Amber" },
  pearls: { id: "pearls", name: "Pearls" },
  cacao: { id: "cacao", name: "Cacao" },
  maps: { id: "maps", name: "Sea maps" },
  salt: { id: "salt", name: "Salt" },
  cloth: { id: "cloth", name: "Cloth" },
  tea: { id: "tea", name: "Tea" },
  spices: { id: "spices", name: "Spices" },
});

const rawPorts = [
  {
    id: "dawnwatch",
    name: "Dawnwatch Quay",
    berth: { x: 328, y: 136 },
    settlement: { x: 294, y: 112 },
    dock: { x1: 310, y1: 136, x2: 330, y2: 136 },
    goods: [
      { itemId: "amber", signature: true, buyPrice: 18, sellPrice: 12 },
      { itemId: "salt", signature: false, buyPrice: 7, sellPrice: 4 },
      { itemId: "cloth", signature: false, buyPrice: 12, sellPrice: 7 },
      { itemId: "tea", signature: false, buyPrice: 9, sellPrice: 5 },
      { itemId: "spices", signature: false, buyPrice: 14, sellPrice: 8 },
    ],
    sellPrices: {
      amber: 12, pearls: 20, cacao: 17, maps: 13,
      salt: 4, cloth: 7, tea: 5, spices: 8,
    },
  },
  {
    id: "starfall",
    name: "Starfall Harbor",
    berth: { x: 712, y: 136 },
    settlement: { x: 746, y: 112 },
    dock: { x1: 710, y1: 136, x2: 730, y2: 136 },
    goods: [
      { itemId: "pearls", signature: true, buyPrice: 24, sellPrice: 16 },
      { itemId: "salt", signature: false, buyPrice: 8, sellPrice: 5 },
      { itemId: "cloth", signature: false, buyPrice: 11, sellPrice: 6 },
      { itemId: "tea", signature: false, buyPrice: 8, sellPrice: 5 },
      { itemId: "spices", signature: false, buyPrice: 13, sellPrice: 8 },
    ],
    sellPrices: {
      amber: 34, pearls: 16, cacao: 31, maps: 26,
      salt: 5, cloth: 6, tea: 5, spices: 8,
    },
  },
  {
    id: "emberwake",
    name: "Emberwake Landing",
    berth: { x: 360, y: 520 },
    settlement: { x: 326, y: 496 },
    dock: { x1: 342, y1: 520, x2: 362, y2: 520 },
    goods: [
      { itemId: "cacao", signature: true, buyPrice: 20, sellPrice: 14 },
      { itemId: "salt", signature: false, buyPrice: 6, sellPrice: 4 },
      { itemId: "cloth", signature: false, buyPrice: 13, sellPrice: 7 },
      { itemId: "tea", signature: false, buyPrice: 10, sellPrice: 6 },
      { itemId: "spices", signature: false, buyPrice: 15, sellPrice: 9 },
    ],
    sellPrices: {
      amber: 29, pearls: 33, cacao: 14, maps: 24,
      salt: 4, cloth: 7, tea: 6, spices: 9,
    },
  },
  {
    id: "moonharbor",
    name: "Moonharbor",
    berth: { x: 648, y: 520 },
    settlement: { x: 682, y: 496 },
    dock: { x1: 646, y1: 520, x2: 666, y2: 520 },
    goods: [
      { itemId: "maps", signature: true, buyPrice: 16, sellPrice: 10 },
      { itemId: "salt", signature: false, buyPrice: 8, sellPrice: 5 },
      { itemId: "cloth", signature: false, buyPrice: 12, sellPrice: 7 },
      { itemId: "tea", signature: false, buyPrice: 9, sellPrice: 5 },
      { itemId: "spices", signature: false, buyPrice: 12, sellPrice: 7 },
    ],
    sellPrices: {
      amber: 27, pearls: 30, cacao: 28, maps: 10,
      salt: 5, cloth: 7, tea: 5, spices: 7,
    },
  },
];

const immutablePorts = rawPorts.map((port) => ({
  ...port,
  signatureItemId: port.goods.find((good) => good.signature)?.itemId ?? null,
  goods: port.goods.map((good) => ({
    ...good,
    name: ITEM_CATALOG[good.itemId].name,
  })),
}));

export const PORTS = freezeDeep(immutablePorts);

function isSafeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isTradeState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  if (!isSafeNonNegativeInteger(state.coins) || !isSafeNonNegativeInteger(state.capacity)) return false;
  if (!state.cargo || typeof state.cargo !== "object" || Array.isArray(state.cargo)) return false;
  return Object.values(state.cargo).every((quantity) => isSafeNonNegativeInteger(quantity));
}

function canMutateTradeState(state) {
  return !Object.isFrozen(state)
    && !Object.isFrozen(state.cargo)
    && Object.isExtensible(state)
    && Object.isExtensible(state.cargo);
}

function failure(reason) {
  return { ok: false, reason };
}

function canonicalPort(port) {
  if (typeof port === "string") return PORTS.find((candidate) => candidate.id === port) ?? null;
  if (!port || typeof port !== "object" || typeof port.id !== "string") return null;
  return PORTS.find((candidate) => candidate.id === port.id) ?? null;
}

function itemName(itemId) {
  return ITEM_CATALOG[itemId]?.name ?? itemId;
}

export function createTradeState(options = {}) {
  const { coins = 100, capacity = 8 } = options ?? {};
  if (!isSafeNonNegativeInteger(coins)) throw new Error("Coins must be a non-negative safe integer");
  if (!isSafeNonNegativeInteger(capacity)) throw new Error("Capacity must be a non-negative safe integer");
  return { coins, capacity, cargo: {} };
}

export function cargoUsed(tradeState) {
  if (!isTradeState(tradeState)) return 0;
  return Object.values(tradeState.cargo).reduce((total, quantity) => total + quantity, 0);
}

export function nearbyPort(ship, ports = PORTS) {
  if (!ship || !Number.isFinite(ship.x) || !Number.isFinite(ship.y) || !Array.isArray(ports)) return null;
  for (const port of ports) {
    if (!port?.berth || !Number.isFinite(port.berth.x) || !Number.isFinite(port.berth.y)) continue;
    const distance = Math.hypot(ship.x - port.berth.x, ship.y - port.berth.y);
    if (distance <= PORT_PROXIMITY_RADIUS) return port;
  }
  return null;
}

export function buyItem(tradeState, port, itemId) {
  if (!isTradeState(tradeState) || !canMutateTradeState(tradeState)) return failure("Invalid trade state");
  const activePort = canonicalPort(port);
  if (!activePort) return failure("Unknown port");
  if (typeof itemId !== "string") return failure("Unknown item");

  const good = activePort.goods.find((candidate) => candidate.itemId === itemId);
  if (!good) return failure(`${itemName(itemId)} is not sold here`);
  if (cargoUsed(tradeState) >= tradeState.capacity) return failure("Cargo is full");
  if (tradeState.coins < good.buyPrice) return failure("Insufficient funds");

  const currentQuantity = tradeState.cargo[itemId] ?? 0;
  if (!isSafeNonNegativeInteger(currentQuantity) || currentQuantity === Number.MAX_SAFE_INTEGER) {
    return failure("Invalid trade state");
  }
  tradeState.coins -= good.buyPrice;
  tradeState.cargo[itemId] = currentQuantity + 1;
  return { ok: true, itemId, price: good.buyPrice };
}

export function sellItem(tradeState, port, itemId) {
  if (!isTradeState(tradeState) || !canMutateTradeState(tradeState)) return failure("Invalid trade state");
  const activePort = canonicalPort(port);
  if (!activePort) return failure("Unknown port");
  if (typeof itemId !== "string" || !Object.prototype.hasOwnProperty.call(ITEM_CATALOG, itemId)) return failure("Unknown item");

  const currentQuantity = tradeState.cargo[itemId] ?? 0;
  if (!isSafeNonNegativeInteger(currentQuantity) || currentQuantity < 1) {
    return failure(`You do not carry ${itemName(itemId)}`);
  }
  const price = activePort.sellPrices[itemId];
  if (!isSafeNonNegativeInteger(price) || price < 1) return failure(`${itemName(itemId)} is not bought here`);
  if (!Number.isSafeInteger(tradeState.coins + price)) return failure("Invalid trade state");

  if (currentQuantity === 1) delete tradeState.cargo[itemId];
  else tradeState.cargo[itemId] = currentQuantity - 1;
  tradeState.coins += price;
  return { ok: true, itemId, price };
}
