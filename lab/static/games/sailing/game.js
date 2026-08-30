import { createGame, stepGame } from "./game-engine.mjs";
import { ITEM_CATALOG, PORTS, buyItem, cargoUsed, nearbyPort, sellItem } from "./trading.mjs";
import { buildTerrainCells } from "./terrain.mjs";

const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
context.imageSmoothingEnabled = false;

const game = createGame();
const terrainDetail = 4;
const terrain = buildTerrainCells(game.world, terrainDetail);
const terrainCellSize = game.world.tileSize / terrainDetail;
const heldDirections = new Set();
const pointerDirections = new Map();
const keyDirections = new Map([
  ["ArrowUp", "north"], ["w", "north"], ["W", "north"],
  ["ArrowDown", "south"], ["s", "south"], ["S", "south"],
  ["ArrowLeft", "west"], ["a", "west"], ["A", "west"],
  ["ArrowRight", "east"], ["d", "east"], ["D", "east"],
]);

const coinsValue = document.querySelector("#coins-value");
const cargoValue = document.querySelector("#cargo-value");
const tradeButton = document.querySelector("#trade-button");
const tradeDialog = document.querySelector("#trade-dialog");
const tradePortName = document.querySelector("#trade-port-name");
const tradeCoinsValue = document.querySelector("#trade-coins-value");
const tradeCargoValue = document.querySelector("#trade-cargo-value");
const buyTab = document.querySelector("#buy-tab");
const sellTab = document.querySelector("#sell-tab");
const buyPanel = document.querySelector("#buy-panel");
const sellPanel = document.querySelector("#sell-panel");
const buyList = document.querySelector("#buy-list");
const sellList = document.querySelector("#sell-list");
const tradeFeedback = document.querySelector("#trade-feedback");
const closeTradeButton = document.querySelector("#close-trade");

let dialogOpen = false;
let activeTradePort = null;
let activeTab = "buy";
let scrollLockState = null;

function currentPort() {
  return nearbyPort(game.ship, PORTS);
}

function currentInput() {
  if (dialogOpen) return { x: 0, y: 0 };
  return {
    x: Number(heldDirections.has("east")) - Number(heldDirections.has("west")),
    y: Number(heldDirections.has("south")) - Number(heldDirections.has("north")),
  };
}

function setButtonState(direction) {
  document.querySelector(`[data-direction="${direction}"]`)?.classList.toggle("active", heldDirections.has(direction));
}

function releasePointer(pointerId) {
  const direction = pointerDirections.get(pointerId);
  if (!direction) return;
  pointerDirections.delete(pointerId);
  if (![...pointerDirections.values()].includes(direction)) heldDirections.delete(direction);
  setButtonState(direction);
}

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    if (dialogOpen) return;
    event.preventDefault();
    const direction = button.dataset.direction;
    pointerDirections.set(event.pointerId, direction);
    heldDirections.add(direction);
    setButtonState(direction);
    button.setPointerCapture?.(event.pointerId);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => {
    button.addEventListener(name, (event) => releasePointer(event.pointerId));
  });
});

window.addEventListener("keydown", (event) => {
  if (dialogOpen) return;
  const direction = keyDirections.get(event.key);
  if (!direction) return;
  event.preventDefault();
  heldDirections.add(direction);
  setButtonState(direction);
});
window.addEventListener("keyup", (event) => {
  const direction = keyDirections.get(event.key);
  if (!direction) return;
  heldDirections.delete(direction);
  setButtonState(direction);
});

function clearInput() {
  pointerDirections.clear();
  heldDirections.clear();
  document.querySelectorAll("[data-direction]").forEach((button) => button.classList.remove("active"));
}
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => { if (document.hidden) clearInput(); });

function itemName(itemId) {
  return ITEM_CATALOG[itemId]?.name ?? itemId;
}

function updateHud() {
  const port = currentPort();
  const used = cargoUsed(game.trade);
  coinsValue.textContent = String(game.trade.coins);
  cargoValue.textContent = `${used}/${game.trade.capacity}`;
  tradeButton.disabled = !port || dialogOpen;
  tradeCoinsValue.textContent = String(game.trade.coins);
  tradeCargoValue.textContent = `${used}/${game.trade.capacity}`;
}

function setTradeTab(tab) {
  activeTab = tab === "sell" ? "sell" : "buy";
  const buying = activeTab === "buy";
  buyTab.setAttribute("aria-selected", String(buying));
  sellTab.setAttribute("aria-selected", String(!buying));
  buyTab.tabIndex = buying ? 0 : -1;
  sellTab.tabIndex = buying ? -1 : 0;
  buyPanel.hidden = !buying;
  sellPanel.hidden = buying;
}

function tradeRow({ itemId, price, action, disabled, onClick }) {
  const row = document.createElement("div");
  row.className = "trade-row";

  const copy = document.createElement("div");
  copy.className = "trade-row-content";
  const name = document.createElement("span");
  name.className = "trade-item-name";
  name.textContent = itemName(itemId);
  const meta = document.createElement("span");
  meta.className = "trade-item-meta";
  meta.textContent = `${price} coins`;
  copy.append(name, meta);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = action === "buy" ? "Buy 1" : "Sell 1";
  button.setAttribute("aria-label", `${action === "buy" ? "Buy" : "Sell"} one ${itemName(itemId)}`);
  button.disabled = disabled;
  button.addEventListener("click", onClick);

  row.append(copy, button);
  return row;
}

function renderBuyRows() {
  buyList.replaceChildren(...activeTradePort.goods.map((good) => tradeRow({
    itemId: good.itemId,
    price: good.buyPrice,
    action: "buy",
    disabled: game.trade.coins < good.buyPrice || cargoUsed(game.trade) >= game.trade.capacity,
    onClick: () => {
      const result = buyItem(game.trade, activeTradePort, good.itemId);
      tradeFeedback.textContent = result.ok ? `Bought 1 ${itemName(good.itemId)}.` : result.reason;
      renderTrade();
      updateHud();
    },
  })));
}

function renderSellRows() {
  const carriedItems = Object.entries(game.trade.cargo).filter(([, quantity]) => quantity > 0);
  if (carriedItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "trade-empty";
    empty.textContent = "No cargo aboard.";
    sellList.replaceChildren(empty);
    return;
  }

  sellList.replaceChildren(...carriedItems.map(([itemId, quantity]) => {
    const price = activeTradePort.sellPrices[itemId];
    return tradeRow({
      itemId,
      price: Number.isInteger(price) ? price : 0,
      action: "sell",
      disabled: !Number.isInteger(price) || price < 1,
      onClick: () => {
        const result = sellItem(game.trade, activeTradePort, itemId);
        tradeFeedback.textContent = result.ok ? `Sold 1 ${itemName(itemId)}.` : result.reason;
        renderTrade();
        updateHud();
      },
    });
  }));
}

function renderTrade() {
  if (!activeTradePort) return;
  tradePortName.textContent = activeTradePort.name;
  tradeCoinsValue.textContent = String(game.trade.coins);
  tradeCargoValue.textContent = `${cargoUsed(game.trade)}/${game.trade.capacity}`;
  renderBuyRows();
  renderSellRows();
  setTradeTab(activeTab);
}

function lockBackgroundScroll() {
  if (scrollLockState) return;
  scrollLockState = {
    x: window.scrollX,
    y: window.scrollY,
    htmlStyle: document.documentElement.getAttribute("style"),
    bodyStyle: document.body.getAttribute("style"),
  };
  document.documentElement.classList.add("trade-modal-open");
  document.body.classList.add("trade-modal-open");
  document.body.style.top = `-${scrollLockState.y}px`;
  document.body.style.left = `-${scrollLockState.x}px`;
}

function restoreStyleAttribute(element, value) {
  if (value === null) element.removeAttribute("style");
  else element.setAttribute("style", value);
}

function unlockBackgroundScroll() {
  if (!scrollLockState) return;
  const { x, y, htmlStyle, bodyStyle } = scrollLockState;
  scrollLockState = null;
  document.documentElement.classList.remove("trade-modal-open");
  document.body.classList.remove("trade-modal-open");
  restoreStyleAttribute(document.documentElement, htmlStyle);
  restoreStyleAttribute(document.body, bodyStyle);
  window.scrollTo(x, y);
}

function finishClosingTrade() {
  dialogOpen = false;
  activeTradePort = null;
  unlockBackgroundScroll();
  clearInput();
  updateHud();
}

function closeTrade() {
  if (!dialogOpen) return;
  if (typeof tradeDialog.close === "function" && tradeDialog.open) tradeDialog.close();
  else {
    tradeDialog.removeAttribute("open");
    finishClosingTrade();
  }
}

function openTrade() {
  const port = currentPort();
  if (!port || dialogOpen) return;
  clearInput();
  activeTradePort = port;
  activeTab = "buy";
  tradeFeedback.textContent = "";
  dialogOpen = true;
  lockBackgroundScroll();
  renderTrade();
  if (typeof tradeDialog.showModal === "function") tradeDialog.showModal();
  else tradeDialog.setAttribute("open", "");
  updateHud();
}

tradeButton.addEventListener("click", openTrade);
closeTradeButton.addEventListener("click", closeTrade);
buyTab.addEventListener("click", () => setTradeTab("buy"));
sellTab.addEventListener("click", () => setTradeTab("sell"));
tradeDialog.addEventListener("close", finishClosingTrade);
tradeDialog.addEventListener("cancel", () => clearInput());
tradeDialog.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  closeTrade();
});

function drawPort(port, cameraX, cameraY) {
  const settlementX = Math.round(port.settlement.x - cameraX);
  const settlementY = Math.round(port.settlement.y - cameraY);
  const berthX = Math.round(port.berth.x - cameraX);
  const berthY = Math.round(port.berth.y - cameraY);

  if (berthX < -30 || berthX > canvas.width + 30 || berthY < -30 || berthY > canvas.height + 30) return;

  const dockStartX = Math.round(Math.min(port.dock.x1, port.dock.x2) - cameraX);
  const dockEndX = Math.round(Math.max(port.dock.x1, port.dock.x2) - cameraX);
  const dockY = Math.round((port.dock.y1 + port.dock.y2) / 2 - cameraY);
  context.fillStyle = "#70472f";
  context.fillRect(dockStartX, dockY - 2, Math.max(4, dockEndX - dockStartX), 4);
  context.fillStyle = "#c28a4d";
  for (let x = dockStartX + 2; x <= dockEndX; x += 7) context.fillRect(x, dockY - 4, 2, 8);
  context.fillStyle = "#e7c873";
  context.fillRect(berthX - 2, berthY - 2, 4, 4);

  context.fillStyle = "#5b2d2a";
  context.fillRect(settlementX - 9, settlementY - 5, 18, 11);
  context.fillStyle = "#d36f45";
  context.fillRect(settlementX - 11, settlementY - 8, 22, 4);
  context.fillStyle = "#f4d38b";
  context.fillRect(settlementX - 5, settlementY - 1, 3, 4);
  context.fillRect(settlementX + 3, settlementY - 1, 3, 4);
  context.fillStyle = "#9b5038";
  context.fillRect(settlementX + 8, settlementY - 14, 2, 10);
  context.fillStyle = "#ffe59a";
  context.fillRect(settlementX + 10, settlementY - 14, 5, 3);

  const distance = Math.hypot(game.ship.x - port.berth.x, game.ship.y - port.berth.y);
  if (distance > 150) return;
  context.fillStyle = "#fff4d6";
  context.font = "6px ui-monospace, monospace";
  const labelWidth = context.measureText(port.name).width;
  if (settlementX - labelWidth / 2 < 0 || settlementX + labelWidth / 2 > canvas.width || settlementY - 18 < 0 || settlementY - 18 > canvas.height) return;
  context.textAlign = "center";
  context.fillText(port.name, settlementX, settlementY - 18);
  context.textAlign = "start";
}

function drawWorld(now) {
  const world = game.world;
  const worldWidth = world.width * world.tileSize;
  const worldHeight = world.height * world.tileSize;
  const cameraX = Math.max(0, Math.min(worldWidth - canvas.width, Math.round(game.ship.x - canvas.width / 2)));
  const cameraY = Math.max(0, Math.min(worldHeight - canvas.height, Math.round(game.ship.y - canvas.height / 2)));
  const firstX = Math.floor(cameraX / world.tileSize);
  const firstY = Math.floor(cameraY / world.tileSize);
  const lastX = Math.min(world.width - 1, Math.ceil((cameraX + canvas.width) / world.tileSize));
  const lastY = Math.min(world.height - 1, Math.ceil((cameraY + canvas.height) / world.tileSize));

  context.fillStyle = "#2c93b8";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const screenX = x * world.tileSize - cameraX;
      const screenY = y * world.tileSize - cameraY;
      if (world.map[y][x] === ".") {
        const phase = Math.floor(now / 500) % 3;
        if ((x * 7 + y * 11 + phase) % 5 === 0) {
          context.fillStyle = "#66c8d2";
          context.fillRect(screenX + 3, screenY + 5, 5, 1);
          context.fillRect(screenX + 9, screenY + 6, 3, 1);
        }
      }
    }
  }

  const firstCellX = Math.floor(cameraX / terrainCellSize);
  const firstCellY = Math.floor(cameraY / terrainCellSize);
  const lastCellX = Math.min(terrain[0].length - 1, Math.ceil((cameraX + canvas.width) / terrainCellSize));
  const lastCellY = Math.min(terrain.length - 1, Math.ceil((cameraY + canvas.height) / terrainCellSize));

  for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
      const material = terrain[cellY][cellX];
      if (material === ".") continue;
      const screenX = cellX * terrainCellSize - cameraX;
      const screenY = cellY * terrainCellSize - cameraY;
      context.fillStyle = material === "s" ? "#e7c873" : "#69a84f";
      context.fillRect(screenX, screenY, terrainCellSize, terrainCellSize);

      const hash = cellX * 19 + cellY * 13;
      if (material === "g" && hash % 29 === 0) {
        context.fillStyle = "#3f7d45";
        context.fillRect(screenX + 1, screenY + 1, 1, 2);
      } else if (material === "s" && hash % 31 === 0) {
        context.fillStyle = "#f3dc91";
        context.fillRect(screenX + 1, screenY + 2, 2, 1);
      }
    }
  }

  PORTS.forEach((port) => drawPort(port, cameraX, cameraY));
  drawShip(Math.round(game.ship.x - cameraX), Math.round(game.ship.y - cameraY));
}

const headingAngles = {
  north: 0,
  "north-east": Math.PI / 4,
  east: Math.PI / 2,
  "south-east": Math.PI * 3 / 4,
  south: Math.PI,
  "south-west": -Math.PI * 3 / 4,
  west: -Math.PI / 2,
  "north-west": -Math.PI / 4,
};

function drawShip(x, y) {
  context.save();
  context.translate(x, y);
  context.rotate(headingAngles[game.ship.heading] ?? 0);
  context.fillStyle = "#5b2d2a";
  context.fillRect(-4, -6, 9, 12);
  context.fillStyle = "#9b5038";
  context.fillRect(-3, -7, 7, 12);
  context.fillStyle = "#f8e7b0";
  context.fillRect(0, -8, 1, 12);
  context.fillRect(1, -6, 4, 1);
  context.fillRect(1, -5, 5, 1);
  context.fillRect(1, -4, 6, 4);
  context.fillStyle = "#d36f45";
  context.fillRect(-3, 4, 7, 2);
  context.restore();
}

function publicState() {
  const port = currentPort();
  return Object.freeze({
    x: game.ship.x,
    y: game.ship.y,
    heading: game.ship.heading,
    currentPort: port?.id ?? null,
    currentPortName: port?.name ?? null,
    coins: game.trade.coins,
    cargo: Object.freeze({ ...game.trade.cargo }),
    cargoUsed: cargoUsed(game.trade),
    capacity: game.trade.capacity,
    modalOpen: dialogOpen,
  });
}

function positionShipAtBerth(portId) {
  const port = PORTS.find((candidate) => candidate.id === portId);
  if (!port) return false;
  if (dialogOpen) closeTrade();
  game.ship.x = port.berth.x;
  game.ship.y = port.berth.y;
  clearInput();
  updateHud();
  return true;
}

window.__SAILING_GAME__ = Object.freeze({
  getState: publicState,
  positionShipAtBerth,
  get currentPort() { return currentPort()?.id ?? null; },
  get currentPortName() { return currentPort()?.name ?? null; },
  get coins() { return game.trade.coins; },
  get cargo() { return Object.freeze({ ...game.trade.cargo }); },
  get capacity() { return game.trade.capacity; },
  get cargoUsed() { return cargoUsed(game.trade); },
  get modalOpen() { return dialogOpen; },
  get modalState() { return dialogOpen ? "open" : "closed"; },
});

let previousTime = performance.now();
function frame(now) {
  const delta = (now - previousTime) / 1000;
  previousTime = now;
  if (!dialogOpen) stepGame(game, currentInput(), delta);
  updateHud();
  drawWorld(now);
  requestAnimationFrame(frame);
}

updateHud();
requestAnimationFrame(frame);
