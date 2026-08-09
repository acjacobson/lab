import test from "node:test";
import assert from "node:assert/strict";

import { createGame, runCommand } from "../lab/static/games/lighthouse/game-engine.mjs";

test("a new game starts in the dark lantern room", () => {
  const game = createGame();

  assert.equal(game.state.location, "lantern");
  assert.equal(game.state.turn, 0);
  assert.equal(game.state.finished, false);
  assert.match(game.intro, /The supply ferry returns at dawn/);
  assert.match(game.intro, /Moving, looking, checking inventory, and asking for help do not use time/);
  assert.match(game.intro, /Searching, taking, using, feeding, ringing, rescuing, or waiting uses one turn/);
  assert.doesNotMatch(game.intro, /significant action/i);
  assert.match(game.intro, /LANTERN ROOM/);
});

test("the lamp can be repaired and lit through exploration", () => {
  const game = createGame();
  const commands = [
    "down", "down", "west", "search cottage", "east",
    "south", "search boathouse", "north", "east", "feed gull",
    "west", "go chapel", "take lens", "go yard", "north", "up",
    "use oil on lamp", "fit lens", "unlock lamp", "light lamp",
  ];

  let result;
  for (const command of commands) result = runCommand(game, command);

  assert.equal(result.kind, "ending");
  assert.match(result.text, /ferry answers/i);
  assert.equal(game.state.finished, true);
  assert.equal(game.state.lampLit, true);
});

test("waiting out the storm ends the game", () => {
  const game = createGame();

  let result;
  for (let i = 0; i < 12; i += 1) result = runCommand(game, "wait");

  assert.equal(result.kind, "ending");
  assert.match(result.text, /storm arrives/i);
});
