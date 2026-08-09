import { createGame, runCommand, status } from "./game-engine.mjs";

const transcript = document.querySelector("#transcript");
const form = document.querySelector("#command-form");
const input = document.querySelector("#command-input");
const suggestions = document.querySelector("#suggestions");
const restartButton = document.querySelector("#restart");
const locationLabel = document.querySelector("#location-label");
const tideLabel = document.querySelector("#tide-label");
const stormLabel = document.querySelector("#storm-label");
const inventoryLabel = document.querySelector("#inventory-label");
const stormBar = document.querySelector("#storm-bar");

let game;

function addFormattedText(container, text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      container.append(strong);
    } else {
      container.append(document.createTextNode(part));
    }
  }
}

function appendEntry(text, className = "narrative") {
  const entry = document.createElement("div");
  entry.className = `entry ${className}`;

  for (const paragraph of text.split("\n")) {
    if (!paragraph) continue;
    const line = document.createElement("p");
    addFormattedText(line, paragraph);
    entry.append(line);
  }

  transcript.append(entry);
  transcript.scrollTop = transcript.scrollHeight;
}

function hintsFor(state) {
  const common = ["LOOK", "INVENTORY"];
  const local = {
    lantern: state.lampLit ? [] : ["DOWN", "LIGHT LAMP"],
    landing: ["DOWN", "RING BELL", "UP"],
    yard: ["WEST", "EAST", "SOUTH", "GO CHAPEL"],
    cottage: state.cottageSearched ? ["EAST"] : ["SEARCH COTTAGE", "EAST"],
    boathouse: state.boathouseSearched ? ["NORTH"] : ["SEARCH BOATHOUSE", "NORTH"],
    cliff: state.gullFed ? ["DOWN", "WEST"] : ["FEED GULL", "DOWN", "WEST"],
    chapel: state.lensTaken ? ["GO YARD"] : ["TAKE LENS", "GO YARD"],
    cave: state.keeperRescued ? ["UP"] : ["USE ROPE", "UP"],
  };
  return [...(local[state.location] || []), ...common].slice(0, 5);
}

function renderStatus(current = status(game)) {
  locationLabel.textContent = current.location;
  tideLabel.textContent = current.tide;
  stormLabel.textContent = `${current.remaining} turns`;
  inventoryLabel.textContent = current.inventory.length ? current.inventory.join(", ") : "empty";
  stormBar.style.width = `${Math.min(100, (current.turn / 12) * 100)}%`;
  stormBar.parentElement.setAttribute("aria-valuenow", String(current.turn));

  suggestions.replaceChildren();
  for (const command of hintsFor(game.state)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.textContent = command;
    button.addEventListener("click", () => submitCommand(command));
    suggestions.append(button);
  }
}

function submitCommand(rawCommand) {
  const command = rawCommand.trim();
  if (!command) return;

  appendEntry(`> ${command}`, "command");
  const result = runCommand(game, command);
  appendEntry(result.text, result.kind === "ending" ? "ending" : "narrative");
  renderStatus(result.status);
  input.value = "";
  input.focus();
}

function startGame() {
  game = createGame();
  transcript.replaceChildren();
  appendEntry("THE LAST LIGHTHOUSE KEEPER", "title-entry");
  appendEntry(game.intro);
  appendEntry("Type a command below. HELP shows the verbs the game understands.", "aside-entry");
  renderStatus();
  transcript.scrollTop = 0;
  input.value = "";
  input.focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitCommand(input.value);
});

restartButton.addEventListener("click", startGame);
startGame();
