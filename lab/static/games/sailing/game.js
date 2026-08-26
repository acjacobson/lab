import { createGame, stepGame } from "./game-engine.mjs";

const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
context.imageSmoothingEnabled = false;

const game = createGame();
const heldDirections = new Set();
const pointerDirections = new Map();
const keyDirections = new Map([
  ["ArrowUp", "north"], ["w", "north"], ["W", "north"],
  ["ArrowDown", "south"], ["s", "south"], ["S", "south"],
  ["ArrowLeft", "west"], ["a", "west"], ["A", "west"],
  ["ArrowRight", "east"], ["d", "east"], ["D", "east"],
]);

function currentInput() {
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

function tileColor(world, x, y) {
  const water = world.map[y]?.[x] === ".";
  if (water) return "#2c93b8";
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const coast = neighbors.some(([dx, dy]) => world.map[y + dy]?.[x + dx] === ".");
  return coast ? "#e7c873" : "#69a84f";
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
      const water = world.map[y][x] === ".";
      context.fillStyle = tileColor(world, x, y);
      context.fillRect(screenX, screenY, world.tileSize, world.tileSize);

      if (water) {
        const phase = Math.floor(now / 500) % 3;
        if ((x * 7 + y * 11 + phase) % 5 === 0) {
          context.fillStyle = "#66c8d2";
          context.fillRect(screenX + 3, screenY + 5, 5, 1);
          context.fillRect(screenX + 9, screenY + 6, 3, 1);
        }
      } else if (tileColor(world, x, y) === "#69a84f") {
        const hash = (x * 19 + y * 13) % 7;
        if (hash < 2) {
          context.fillStyle = "#3f7d45";
          context.fillRect(screenX + 4 + hash * 5, screenY + 4, 2, 3);
          context.fillStyle = "#8fc45b";
          context.fillRect(screenX + 5 + hash * 5, screenY + 3, 1, 2);
        }
      } else {
        context.fillStyle = "#f3dc91";
        if ((x + y) % 3 === 0) context.fillRect(screenX + 5, screenY + 9, 2, 1);
      }
    }
  }

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

let previousTime = performance.now();
function frame(now) {
  const delta = (now - previousTime) / 1000;
  previousTime = now;
  stepGame(game, currentInput(), delta);
  drawWorld(now);
  requestAnimationFrame(frame);
}

window.__SAILING_GAME__ = {
  game,
  currentInput,
  clearInput,
  getState: () => ({ x: game.ship.x, y: game.ship.y, heading: game.ship.heading }),
};
requestAnimationFrame(frame);
