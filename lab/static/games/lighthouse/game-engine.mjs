const STORM_TURN = 12;

const ROOMS = {
  lantern: {
    name: "LANTERN ROOM",
    text: "The lighthouse lamp is off. Its oil reservoir is empty, its lens is cracked, and the ignition housing is locked. Through the windows you can see the storm approaching from the west.",
    exits: { down: "landing" },
  },
  landing: {
    name: "BELL LANDING",
    text: "The lighthouse bell hangs above this landing. Its rope is within reach. Stone steps lead up to the lamp and down to the yard.",
    exits: { up: "lantern", down: "yard" },
  },
  yard: {
    name: "LIGHTHOUSE YARD",
    text: "Four paths meet outside the lighthouse. The keeper's cottage is west, the cliff is east, the boathouse is south, and a small chapel is northwest.",
    exits: { north: "landing", west: "cottage", east: "cliff", south: "boathouse", northwest: "chapel" },
  },
  cottage: {
    name: "KEEPER'S COTTAGE",
    text: "The cottage door is open, but the keeper is not here. Inside are a cold stove, a bunk, and a workbench with several drawers.",
    exits: { east: "yard" },
  },
  boathouse: {
    name: "BOATHOUSE",
    text: "An overturned rowboat fills most of the boathouse. Fishing nets and emergency equipment hang from the rafters.",
    exits: { north: "yard" },
  },
  cliff: {
    name: "EAST CLIFF",
    text: "A gull stands on a marker stone with a brass key beneath one foot. A sea cave is visible below the cliff, but the entrance depends on the tide.",
    exits: { west: "yard" },
  },
  chapel: {
    name: "TIDE CHAPEL",
    text: "A blue glass lantern lights a memorial to people lost at sea. Its lens appears to be the right size for the lighthouse lamp.",
    exits: { southeast: "yard" },
  },
  cave: {
    name: "SEA CAVE",
    text: "The missing keeper is stranded on a rock ledge with an injured ankle. The path back up the cliff has collapsed.",
    exits: { up: "cliff" },
  },
};

const LOCATION_ALIASES = {
  lighthouse: "landing",
  tower: "landing",
  yard: "yard",
  cottage: "cottage",
  house: "cottage",
  boathouse: "boathouse",
  boat: "boathouse",
  cliff: "cliff",
  chapel: "chapel",
  cave: "cave",
  lamp: "lantern",
  lantern: "lantern",
};

const DIRECTION_ALIASES = {
  n: "north", s: "south", e: "east", w: "west",
  u: "up", d: "down", nw: "northwest", se: "southeast",
};

function clean(command) {
  return command.toLowerCase().trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

function has(game, item) {
  return game.state.inventory.includes(item);
}

function add(game, item) {
  if (!has(game, item)) game.state.inventory.push(item);
}

function remove(game, item) {
  game.state.inventory = game.state.inventory.filter((entry) => entry !== item);
}

function tideFor(turn) {
  if (turn < 4) return "falling";
  if (turn <= 8) return "low";
  return "rising";
}

function weatherFor(turn) {
  const remaining = STORM_TURN - turn;
  if (remaining > 8) return "distant";
  if (remaining > 4) return "closing";
  if (remaining > 1) return "imminent";
  return "overhead";
}

function status(game) {
  return {
    turn: game.state.turn,
    remaining: Math.max(0, STORM_TURN - game.state.turn),
    tide: tideFor(game.state.turn),
    weather: weatherFor(game.state.turn),
    location: ROOMS[game.state.location].name,
    inventory: [...game.state.inventory],
  };
}

function describe(game) {
  const room = ROOMS[game.state.location];
  const details = [];

  if (game.state.location === "cottage" && !game.state.cottageSearched) {
    details.push("The workbench drawers have not been searched.");
  }
  if (game.state.location === "boathouse" && !game.state.boathouseSearched) {
    details.push("An old fishing net covers several objects on the floor.");
  }
  if (game.state.location === "cliff") {
    if (!game.state.gullFed) details.push("The gull watches anything you are carrying but will not leave the key.");
    if (tideFor(game.state.turn) === "low") details.push("The tide is low enough to enter the cave.");
  }
  if (game.state.location === "chapel" && !game.state.lensTaken) {
    details.push("You could TAKE LENS, though the memorial would go dark.");
  }
  if (game.state.location === "cave" && !game.state.keeperRescued) {
    details.push("A rope might get the keeper back up the cliff.");
  }
  if (game.state.location === "lantern") {
    const missing = [];
    if (!game.state.lampFueled) missing.push("fuel");
    if (!game.state.lensFitted) missing.push("a lens");
    if (!game.state.lampUnlocked) missing.push("the ignition key");
    details.push(missing.length ? `The lamp still needs ${missing.join(", ")}.` : "The lamp is ready to be lit.");
  }

  const exits = Object.keys(room.exits).join(", ");
  return `**${room.name}**\n${room.text}${details.length ? `\n\n${details.join(" ")}` : ""}\n\nExits: ${exits}.`;
}

function finishStorm(game) {
  game.state.finished = true;
  return {
    kind: "ending",
    text: "**THE STORM ARRIVES**\nYou do not repair the lamp in time. The ferry turns back rather than approach the island in poor visibility. The lighthouse remains dark until morning.",
    status: status(game),
  };
}

function advance(game, text) {
  game.state.turn += 1;
  if (game.state.turn >= STORM_TURN && !game.state.lampLit) return finishStorm(game);
  return { kind: "response", text, status: status(game) };
}

function ending(game) {
  game.state.finished = true;
  game.state.lampLit = true;
  let text = "**THE LIGHT RETURNS**\nYou light the wick and the repaired lens sends a steady beam across the water. The ferry answers with one long horn and begins its approach to the island.";
  if (game.state.keeperRescued) {
    text += "\n\nThe keeper is safe above the tide line. When the ferry arrives, both of you will be able to leave.";
  } else {
    text += "\n\nThe ferry will reach you by dawn, but the missing keeper is still trapped below the cliff.";
  }
  if (game.state.lensTaken) {
    text += "\n\nThe chapel's memorial lantern is now dark because you used its lens for the lighthouse.";
  }
  return { kind: "ending", text, status: status(game) };
}

function move(game, destination) {
  const room = ROOMS[game.state.location];
  let target = null;
  const direction = DIRECTION_ALIASES[destination] || destination;

  if (room.exits[direction]) target = room.exits[direction];
  if (!target && LOCATION_ALIASES[destination]) {
    const wanted = LOCATION_ALIASES[destination];
    if (Object.values(room.exits).includes(wanted)) target = wanted;
    if (game.state.location === "yard" && ["chapel", "cottage", "boathouse", "cliff"].includes(wanted)) target = wanted;
    if (["chapel", "cottage", "boathouse", "cliff"].includes(game.state.location) && wanted === "yard") target = "yard";
  }

  if (game.state.location === "cliff" && direction === "down") {
    if (tideFor(game.state.turn) !== "low") {
      return { kind: "response", text: "The cave entrance is underwater. You will have to return at low tide.", status: status(game) };
    }
    target = "cave";
  }

  if (!target) return { kind: "response", text: "You cannot go that way.", status: status(game) };
  game.state.location = target;
  return { kind: "scene", text: describe(game), status: status(game) };
}

export function createGame() {
  const game = {
    state: {
      location: "lantern",
      turn: 0,
      inventory: [],
      finished: false,
      cottageSearched: false,
      boathouseSearched: false,
      gullFed: false,
      lensTaken: false,
      lampFueled: false,
      lensFitted: false,
      lampUnlocked: false,
      lampLit: false,
      keeperRescued: false,
    },
  };
  game.intro = `**THE SITUATION**\nYou arrived on the island this afternoon to relieve the lighthouse keeper, but he is missing and the main lamp is not working. The supply ferry returns at dawn. It will only approach if the lighthouse is operating. A storm will reach the island in twelve turns. Repair the lamp before then. Finding the keeper is optional.\n\n**HOW TIME WORKS**\nMoving, looking, checking inventory, and asking for help do not use time. Searching, taking, using, feeding, ringing, rescuing, or waiting uses one turn. The tide changes as turns pass.\n\n${describe(game)}`;
  return game;
}

export function runCommand(game, rawCommand) {
  const command = clean(rawCommand);
  if (!command) return { kind: "response", text: "Type a command, or HELP for examples.", status: status(game) };
  if (game.state.finished) return { kind: "response", text: "This story has ended. Choose PLAY AGAIN to return to the lantern room.", status: status(game) };

  if (["help", "commands", "?"] .includes(command)) {
    return {
      kind: "response",
      text: "Try LOOK, SEARCH, TAKE, GO, USE, FEED, RING, WAIT, INVENTORY, or STATUS. Directions such as NORTH, DOWN, and NW work too. Moving, looking, checking inventory, and HELP are free. Commands that change something use one turn.",
      status: status(game),
    };
  }
  if (["look", "l"].includes(command)) return { kind: "scene", text: describe(game), status: status(game) };
  if (["inventory", "inv", "i"].includes(command)) {
    const items = game.state.inventory.length ? game.state.inventory.join(", ") : "nothing";
    return { kind: "response", text: `You are carrying: ${items}.`, status: status(game) };
  }
  if (command === "status") {
    const current = status(game);
    return { kind: "response", text: `Storm: ${current.weather}. Tide: ${current.tide}. Turns remaining: ${current.remaining}.`, status: current };
  }
  if (command === "wait" || command === "z") return advance(game, "You wait for a while. The storm gets closer.");

  const moveMatch = command.match(/^(?:go|walk|climb|enter)\s+(.+)$/);
  if (moveMatch) return move(game, moveMatch[1].replace(/^to\s+/, ""));
  if (ROOMS[game.state.location].exits[command] || DIRECTION_ALIASES[command] || LOCATION_ALIASES[command] || command === "down") {
    return move(game, command);
  }

  if ((command === "search" || command === "search cottage" || command === "search room") && game.state.location === "cottage") {
    if (game.state.cottageSearched) return { kind: "response", text: "You already emptied the useful drawers.", status: status(game) };
    game.state.cottageSearched = true;
    add(game, "lamp oil");
    add(game, "matches");
    return advance(game, "You search the workbench and find lamp oil and dry matches. You take both.");
  }
  if ((command === "search" || command === "search boathouse" || command === "search nets") && game.state.location === "boathouse") {
    if (game.state.boathouseSearched) return { kind: "response", text: "The remaining nets hold only weed and broken shells.", status: status(game) };
    game.state.boathouseSearched = true;
    add(game, "silver fish");
    add(game, "rope");
    return advance(game, "You move the fishing net and find a fish and a usable coil of rope. You take both.");
  }
  if (["take lens", "get lens", "remove lens"].includes(command) && game.state.location === "chapel") {
    if (game.state.lensTaken) return { kind: "response", text: "The empty lantern frame reflects your face.", status: status(game) };
    game.state.lensTaken = true;
    add(game, "blue lens");
    return advance(game, "You remove the blue lens. Without it, the memorial lantern goes out.");
  }
  if (["feed gull", "give fish to gull", "use fish on gull", "feed fish to gull"].includes(command) && game.state.location === "cliff") {
    if (game.state.gullFed) return { kind: "response", text: "The gull is gone. Its bargain is complete.", status: status(game) };
    if (!has(game, "silver fish")) return { kind: "response", text: "The gull tilts its head. You have nothing it wants.", status: status(game) };
    remove(game, "silver fish");
    add(game, "brass key");
    game.state.gullFed = true;
    return advance(game, "You offer the fish to the gull. It takes the fish and leaves the brass key behind.");
  }
  if (["ring bell", "pull rope", "pull bell rope"].includes(command) && game.state.location === "landing") {
    return advance(game, "You ring the bell. Someone answers with three knocks from below the eastern cliff.");
  }
  if (["use rope", "rescue keeper", "help keeper", "use rope on keeper"].includes(command) && game.state.location === "cave") {
    if (game.state.keeperRescued) return { kind: "response", text: "The keeper is already safe above the tide line.", status: status(game) };
    if (!has(game, "rope")) return { kind: "response", text: "You cannot lift him up the broken cliff with your bare hands.", status: status(game) };
    game.state.keeperRescued = true;
    return advance(game, "You secure the rope and help the keeper climb above the tide line. His ankle is injured, so he waits there while you return to the lighthouse.");
  }
  if (["use oil", "use oil on lamp", "fill lamp", "fuel lamp"].includes(command) && game.state.location === "lantern") {
    if (game.state.lampFueled) return { kind: "response", text: "The lamp's reservoir is already full.", status: status(game) };
    if (!has(game, "lamp oil")) return { kind: "response", text: "The reservoir is dry. You need fuel.", status: status(game) };
    remove(game, "lamp oil");
    game.state.lampFueled = true;
    return advance(game, "You fill the lamp's reservoir with oil.");
  }
  if (["fit lens", "use lens", "use lens on lamp", "install lens"].includes(command) && game.state.location === "lantern") {
    if (game.state.lensFitted) return { kind: "response", text: "The blue lens is already seated in the lamp.", status: status(game) };
    if (!has(game, "blue lens")) return { kind: "response", text: "The lamp's cracked optic needs a replacement lens.", status: status(game) };
    remove(game, "blue lens");
    game.state.lensFitted = true;
    return advance(game, "You fit the blue lens into the lamp's brass frame.");
  }
  if (["unlock lamp", "use key", "use key on lamp", "turn key"].includes(command) && game.state.location === "lantern") {
    if (game.state.lampUnlocked) return { kind: "response", text: "The ignition housing is already unlocked.", status: status(game) };
    if (!has(game, "brass key")) return { kind: "response", text: "The ignition housing is locked. Its key is missing.", status: status(game) };
    game.state.lampUnlocked = true;
    return advance(game, "The brass key unlocks the ignition housing.");
  }
  if (["light lamp", "strike match", "light wick", "ignite lamp"].includes(command) && game.state.location === "lantern") {
    const missing = [];
    if (!game.state.lampFueled) missing.push("fuel");
    if (!game.state.lensFitted) missing.push("a lens");
    if (!game.state.lampUnlocked) missing.push("the key");
    if (!has(game, "matches")) missing.push("a flame");
    if (missing.length) return { kind: "response", text: `The lamp is not ready. It still needs ${missing.join(", ")}.`, status: status(game) };
    return ending(game);
  }

  return { kind: "response", text: "Nothing happens. Try a simpler verb and noun, or type HELP.", status: status(game) };
}

export { status };
