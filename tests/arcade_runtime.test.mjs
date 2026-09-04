import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controllerUrl = pathToFileURL(path.join(root, "lab/static/games/arcade/game.js")).href;
let importSerial = 0;

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatchEvent(event) {
    if (!event || typeof event.type !== "string") throw new TypeError("Fake events need a type");
    if (event.target == null) event.target = this;
    event.currentTarget = this;
    if (typeof event.preventDefault !== "function") {
      event.defaultPrevented = false;
      event.preventDefault = () => { event.defaultPrevented = true; };
    }
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener.call(this, event);
    return !event.defaultPrevented;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = Object.create(null);
    this.style = Object.create(null);
    this.textContent = "";
    this.hidden = false;
    this.isContentEditable = false;
    this.tabIndex = -1;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  click() {
    return this.dispatchEvent(createEvent("click", { target: this }));
  }

  matches(selector) {
    const simpleSelector = selector.split(",").map((value) => value.trim());
    return simpleSelector.some((value) => {
      if (value === "[contenteditable]") return this.isContentEditable;
      return value.toLowerCase() === this.tagName.toLowerCase();
    });
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  setPointerCapture(pointerId) {
    this.capturedPointerId = pointerId;
  }

  hasPointerCapture(pointerId) {
    return this.capturedPointerId === pointerId;
  }

  releasePointerCapture(pointerId) {
    if (this.capturedPointerId === pointerId) this.capturedPointerId = null;
  }

  scrollIntoView(options) {
    this.scrollIntoViewCalls ??= [];
    this.scrollIntoViewCalls.push(options);
  }
}

class FakeCanvas extends FakeElement {
  constructor(ownerDocument) {
    super("canvas", ownerDocument);
    this.width = 480;
    this.height = 360;
    this.context = createCanvasContext();
  }

  getContext() {
    return this.context;
  }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.activeElement = null;
    this.elements = new Map();
    this.choices = [];
    this.directionButtons = [];
    this.body = new FakeElement("body", this);
  }

  register(element, id = null) {
    if (id) this.elements.set(id, element);
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) ?? null;
  }

  querySelector(selector) {
    if (selector === ".screen-inset") return this.screenInset ?? null;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === ".game-choice[data-game]") return this.choices;
    if (selector === ".direction-control[data-direction]") return this.directionButtons;
    return [];
  }
}

class FakeWindow extends FakeEventTarget {
  constructor() {
    super();
    this.nextFrameId = 1;
    this.frames = new Map();
  }

  requestAnimationFrame(callback) {
    const id = this.nextFrameId;
    this.nextFrameId += 1;
    this.frames.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id) {
    this.frames.delete(id);
  }

  flush(timestamp) {
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    callbacks.forEach((callback) => callback(timestamp));
  }

  get pendingFrameCount() {
    return this.frames.size;
  }
}

function createCanvasContext() {
  const context = {};
  for (const method of [
    "clearRect", "fillRect", "strokeRect", "fillText", "beginPath", "moveTo", "lineTo",
    "stroke", "arc", "fill", "closePath", "save", "restore", "scale",
  ]) context[method] = () => {};
  context.fillStyle = "";
  context.strokeStyle = "";
  context.lineWidth = 1;
  context.font = "";
  context.textAlign = "left";
  return context;
}

function createEvent(type, properties = {}) {
  return {
    type,
    ...properties,
    target: properties.target ?? null,
    currentTarget: null,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function createEnvironment() {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const screenInset = new FakeElement("div", document);
  const selector = document.register(new FakeElement("section", document), "game-selector");
  const screenMessage = document.register(new FakeElement("p", document), "screen-message");
  const canvas = document.register(new FakeCanvas(document), "game-canvas");
  const creditDisplay = document.register(new FakeElement("span", document), "credit-display");
  const highScoreDisplay = document.register(new FakeElement("b", document), "high-score");
  const primaryAction = document.register(new FakeElement("button", document), "primary-action");
  const restartButton = document.register(new FakeElement("button", document), "restart-game");
  const homeButton = document.register(new FakeElement("button", document), "selector-home");
  const soundToggle = document.register(new FakeElement("button", document), "sound-toggle");

  screenInset.appendChild(canvas);
  screenInset.appendChild(selector);
  screenInset.appendChild(screenMessage);
  document.body.appendChild(screenInset);
  document.screenInset = screenInset;

  const choices = ["block-drop", "brick-breaker", "alien-blaster", "maze-muncher"].map((slug) => {
    const choice = new FakeElement("button", document);
    choice.dataset.game = slug;
    choice.setAttribute("aria-pressed", slug === "block-drop");
    selector.appendChild(choice);
    return choice;
  });
  const directionButtons = ["up", "left", "right", "down"].map((direction) => {
    const button = new FakeElement("button", document);
    button.dataset.direction = direction;
    document.body.appendChild(button);
    return button;
  });

  document.choices = choices;
  document.directionButtons = directionButtons;
  document.register(canvas);
  document.register(selector);
  document.register(screenMessage);
  document.register(creditDisplay);
  document.register(highScoreDisplay);
  document.register(primaryAction);
  document.register(restartButton);
  document.register(homeButton);
  document.register(soundToggle);

  return {
    document,
    window,
    screenInset,
    selector,
    screenMessage,
    canvas,
    creditDisplay,
    highScoreDisplay,
    primaryAction,
    restartButton,
    homeButton,
    soundToggle,
    choices,
    directionButtons,
  };
}

async function loadController() {
  const environment = createEnvironment();
  const hadWindow = Object.hasOwn(globalThis, "window");
  const hadDocument = Object.hasOwn(globalThis, "document");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = environment.window;
  globalThis.document = environment.document;
  await import(`${controllerUrl}?runtime=${importSerial}`);
  importSerial += 1;
  return {
    ...environment,
    hook: environment.window.__ARCADE_TEST__,
    restore() {
      if (hadWindow) globalThis.window = previousWindow;
      else delete globalThis.window;
      if (hadDocument) globalThis.document = previousDocument;
      else delete globalThis.document;
    },
  };
}

function dispatchKey(environment, target, key, repeat = false) {
  const event = createEvent("keydown", { target, key, repeat });
  environment.window.dispatchEvent(event);
  return event;
}

function dispatchKeyUp(environment, target, key) {
  const event = createEvent("keyup", { target, key });
  environment.window.dispatchEvent(event);
  return event;
}

test("starting a selected game hides the selector and exposes the active status", async () => {
  const environment = await loadController();
  try {
    assert.equal(environment.hook.selector, true);
    assert.equal(environment.selector.hidden, false);
    environment.choices[2].click();
    environment.primaryAction.click();
    assert.equal(environment.hook.activeGame, "alien-blaster");
    assert.equal(environment.selector.hidden, true);
    assert.equal(environment.selector.getAttribute("aria-hidden"), "true");
    assert.match(environment.screenMessage.textContent, /^Alien Blaster/);
    assert.equal(environment.screenMessage.parentElement, environment.screenInset);
  } finally {
    environment.restore();
  }
});

test("focused native controls keep Enter and Space for native activation", async () => {
  const environment = await loadController();
  try {
    const primaryKey = dispatchKey(environment, environment.primaryAction, "Enter");
    assert.equal(primaryKey.defaultPrevented, false);
    assert.equal(environment.hook.activeGame, null);
    environment.primaryAction.click();
    assert.equal(environment.hook.activeGame, "block-drop");

    const rotationBefore = environment.hook.snapshot().active.rotation;
    const restartKey = dispatchKey(environment, environment.restartButton, "Enter");
    assert.equal(restartKey.defaultPrevented, false);
    assert.equal(environment.hook.snapshot().active.rotation, rotationBefore);
    environment.restartButton.click();
    assert.equal(environment.hook.activeGame, "block-drop");

    const soundKey = dispatchKey(environment, environment.soundToggle, " ");
    assert.equal(soundKey.defaultPrevented, false);
    assert.equal(environment.hook.muted, false);
    environment.soundToggle.click();
    assert.equal(environment.hook.muted, true);

    const homeKey = dispatchKey(environment, environment.homeButton, "Enter");
    assert.equal(homeKey.defaultPrevented, false);
    assert.equal(environment.hook.activeGame, "block-drop");
    environment.homeButton.click();
    assert.equal(environment.hook.selector, true);
  } finally {
    environment.restore();
  }
});

test("releasing one of two aliases keeps the other direction held", async () => {
  const environment = await loadController();
  try {
    environment.primaryAction.click();
    environment.window.flush(0);
    const before = environment.hook.snapshot().active.x;
    dispatchKey(environment, environment.canvas, "ArrowLeft");
    dispatchKey(environment, environment.canvas, "a");
    const afterPress = environment.hook.snapshot().active.x;
    dispatchKeyUp(environment, environment.canvas, "ArrowLeft");
    environment.window.flush(200);
    const afterRelease = environment.hook.snapshot().active.x;
    assert.equal(afterPress, before - 2);
    assert.equal(afterRelease, afterPress - 1);
    dispatchKeyUp(environment, environment.canvas, "a");
  } finally {
    environment.restore();
  }
});

test("pointer input and lifecycle events release all held movement", async () => {
  const environment = await loadController();
  try {
    environment.primaryAction.click();
    environment.window.flush(0);
    const beforePointer = environment.hook.snapshot().active.x;
    const pointerDown = createEvent("pointerdown", {
      target: environment.directionButtons[2],
      currentTarget: environment.directionButtons[2],
      pointerId: 7,
    });
    environment.directionButtons[2].dispatchEvent(pointerDown);
    environment.directionButtons[2].dispatchEvent(createEvent("pointerup", {
      target: environment.directionButtons[2],
      pointerId: 7,
    }));
    assert.equal(environment.hook.snapshot().active.x, beforePointer + 1);

    dispatchKey(environment, environment.canvas, "ArrowRight");
    environment.document.hidden = true;
    environment.document.dispatchEvent(createEvent("visibilitychange"));
    environment.window.flush(200);
    const afterVisibility = environment.hook.snapshot().active.x;
    assert.equal(afterVisibility, beforePointer + 2);

    environment.document.hidden = false;
    environment.restartButton.click();
    environment.window.flush(0);
    const afterRestart = environment.hook.snapshot().active.x;
    environment.window.flush(200);
    assert.equal(environment.hook.snapshot().active.x, afterRestart);

    environment.homeButton.click();
    assert.equal(environment.hook.selector, true);
    assert.equal(environment.window.pendingFrameCount, 0);
  } finally {
    environment.restore();
  }
});

test("all four game controls start and accept their primary interaction", async () => {
  for (const [index, slug] of [
    [0, "block-drop"],
    [1, "brick-breaker"],
    [2, "alien-blaster"],
    [3, "maze-muncher"],
  ]) {
    const environment = await loadController();
    try {
      environment.choices[index].click();
      environment.primaryAction.click();
      assert.equal(environment.hook.activeGame, slug);
      assert.equal(environment.selector.hidden, true);
      if (slug === "maze-muncher") dispatchKey(environment, environment.canvas, "ArrowRight");
      else dispatchKey(environment, environment.canvas, " ");
      assert.equal(environment.hook.snapshot().slug, slug);
    } finally {
      environment.restore();
    }
  }
});

test("clicking Maze Muncher in-game Start returns keyboard focus to the canvas", async () => {
  const environment = await loadController();
  try {
    environment.choices[3].click();
    environment.primaryAction.click();
    assert.equal(environment.hook.snapshot().status, "ready");

    environment.primaryAction.focus();
    environment.primaryAction.click();
    assert.equal(environment.hook.snapshot().status, "playing");
    assert.equal(environment.document.activeElement, environment.canvas);

    environment.window.flush(0);
    const beforeMove = environment.hook.snapshot();
    const directionKey = dispatchKey(environment, environment.document.activeElement, "ArrowRight");
    assert.equal(directionKey.defaultPrevented, true);
    environment.window.flush(160);

    const afterMove = environment.hook.snapshot();
    assert.equal(afterMove.player.x, beforeMove.player.x + 1);
    assert.equal(afterMove.score, beforeMove.score + 10);
  } finally {
    environment.restore();
  }
});

test("maze starts ready, accepts a buffered direction, exposes progress, and restarts", async () => {
  const environment = await loadController();
  try {
    environment.choices[3].click();
    environment.primaryAction.click();

    const ready = environment.hook.snapshot();
    assert.equal(ready.status, "ready");
    assert.equal(ready.phase, "ready");
    assert.equal(environment.primaryAction.textContent, "Start");
    assert.equal(ready.width, 15);
    assert.equal(ready.height, 11);
    assert.equal(ready.player.requestedDirection, "left");
    assert.equal(ready.remainingPellets, ready.totalPellets);

    environment.primaryAction.click();
    assert.equal(environment.hook.snapshot().status, "playing");
    environment.window.flush(0);
    const beforeMove = environment.hook.snapshot();
    dispatchKey(environment, environment.canvas, "ArrowRight");
    assert.equal(environment.hook.snapshot().player.requestedDirection, "right");
    environment.window.flush(160);
    const afterMove = environment.hook.snapshot();
    assert.equal(afterMove.player.x, beforeMove.player.x + 1);
    assert.equal(afterMove.player.y, beforeMove.player.y);
    assert.ok(afterMove.remainingPellets < afterMove.totalPellets);
    assert.ok(afterMove.progress > 0);

    environment.restartButton.click();
    const restarted = environment.hook.snapshot();
    assert.equal(restarted.status, "ready");
    assert.equal(restarted.score, 0);
    assert.equal(restarted.lives, 3);
    assert.equal(restarted.remainingPellets, restarted.totalPellets);
  } finally {
    environment.restore();
  }
});

test("starting Maze Muncher recenters the canvas without changing other game layout", async () => {
  const environment = await loadController();
  try {
    environment.choices[3].click();
    environment.primaryAction.click();
    environment.primaryAction.click();
    assert.deepEqual(environment.canvas.scrollIntoViewCalls, [
      { block: "center", inline: "nearest" },
      { block: "center", inline: "nearest" },
    ]);
  } finally {
    environment.restore();
  }
});

test("Maze Muncher freezes all simulation state while the window is unfocused", async () => {
  const environment = await loadController();
  try {
    environment.choices[3].click();
    environment.primaryAction.click();
    environment.primaryAction.click();
    environment.window.flush(0);
    dispatchKey(environment, environment.canvas, "ArrowRight");
    environment.window.flush(160);
    const beforeBlur = environment.hook.snapshot();

    environment.window.dispatchEvent(createEvent("blur"));
    assert.equal(environment.hook.paused, true);
    environment.window.flush(500);

    assert.deepEqual(environment.hook.snapshot(), beforeBlur);

    environment.window.dispatchEvent(createEvent("focus"));
    assert.equal(environment.hook.paused, false);
    environment.window.flush(0);
    environment.window.flush(160);
    const resumed = environment.hook.snapshot();
    assert.equal(resumed.player.x, beforeBlur.player.x + 1);
    assert.equal(resumed.score, beforeBlur.score + 10);
  } finally {
    environment.restore();
  }
});

test("Maze Muncher freezes all simulation state while the document is hidden", async () => {
  const environment = await loadController();
  try {
    environment.choices[3].click();
    environment.primaryAction.click();
    environment.primaryAction.click();
    environment.window.flush(0);
    dispatchKey(environment, environment.canvas, "ArrowRight");
    environment.window.flush(160);
    const beforeHidden = environment.hook.snapshot();

    environment.document.hidden = true;
    environment.document.dispatchEvent(createEvent("visibilitychange"));
    assert.equal(environment.hook.paused, true);
    environment.window.flush(500);

    assert.deepEqual(environment.hook.snapshot(), beforeHidden);

    environment.document.hidden = false;
    environment.document.dispatchEvent(createEvent("visibilitychange"));
    assert.equal(environment.hook.paused, false);
    environment.window.flush(0);
    environment.window.flush(160);
    const resumed = environment.hook.snapshot();
    assert.equal(resumed.player.x, beforeHidden.player.x + 1);
    assert.equal(resumed.score, beforeHidden.score + 10);
  } finally {
    environment.restore();
  }
});
