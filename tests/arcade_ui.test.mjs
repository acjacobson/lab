import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "lab/static/games/arcade/game.js");
const htmlPath = path.join(root, "lab/templates/arcade.html");
const stylesheetPath = path.join(root, "lab/static/games/arcade/styles.css");
const testScriptPath = path.join(root, "scripts/test.sh");

function readSource() {
  assert.equal(fs.existsSync(sourcePath), true, "arcade controller must exist");
  return fs.readFileSync(sourcePath, "utf8");
}

function readHtml() {
  return fs.readFileSync(htmlPath, "utf8");
}

test("controller imports exactly the four approved engine modules", () => {
  const source = readSource();
  const imports = [...source.matchAll(/from\s+["'](\.\/[^"']+\.mjs)["']/g)].map((match) => match[1]);
  assert.deepEqual(imports.sort(), [
    "./alien-blaster.mjs",
    "./block-drop.mjs",
    "./brick-breaker.mjs",
    "./maze-muncher.mjs",
  ]);
  assert.match(source, /createBlockDrop/);
  assert.match(source, /moveBlockDrop/);
  assert.match(source, /rotateBlockDrop/);
  assert.match(source, /stepBlockDrop/);
  assert.match(source, /dropBlockDrop/);
  assert.match(source, /createBrickBreaker/);
  assert.match(source, /moveBrickBreaker/);
  assert.match(source, /launchBrickBreaker/);
  assert.match(source, /stepBrickBreaker/);
  assert.match(source, /createAlienBlaster/);
  assert.match(source, /moveAlienBlaster/);
  assert.match(source, /fireAlienBlaster/);
  assert.match(source, /stepAlienBlaster/);
  assert.match(source, /createMazeMuncher/);
  assert.match(source, /setMazeDirection/);
  assert.match(source, /stepMazeMuncher/);
});

test("arcade HTML exposes one accessible four-game selector and shared controls", () => {
  const html = readHtml();
  assert.match(html, /<canvas id="game-canvas" width="480" height="360"/);
  assert.match(html, /id="game-selector"/);
  assert.match(html, /id="screen-message"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.deepEqual(
    [...html.matchAll(/class="game-choice"[^>]+data-game="([^"]+)"/g)].map((match) => match[1]),
    ["block-drop", "brick-breaker", "alien-blaster", "maze-muncher"],
  );
  for (const id of ["primary-action", "restart-game", "selector-home", "sound-toggle"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const direction of ["up", "left", "right", "down"]) {
    assert.match(html, new RegExp(`data-direction="${direction}"`));
  }
  assert.match(html, /id="sound-toggle"[^>]+aria-pressed="false"/);
  assert.match(html, /id="sound-toggle"[^>]+aria-label="Mute sound"/);
  assert.match(fs.readFileSync(stylesheetPath, "utf8"), /touch-action:\s*manipulation/);
});

test("the hidden selector cannot override its hidden state", () => {
  const stylesheet = fs.readFileSync(stylesheetPath, "utf8");
  assert.match(stylesheet, /\.game-selector\[hidden\]\s*\{[^}]*display:\s*none\s*;/s);
});

test("active screen status stays outside the selector overlay", () => {
  const html = readHtml();
  const selectorStart = html.indexOf('<section id="game-selector"');
  const selectorEnd = html.indexOf("</section>", selectorStart);
  const statusPosition = html.indexOf('id="screen-message"');
  assert.ok(selectorStart >= 0 && selectorEnd > selectorStart, "selector section must be present");
  assert.ok(statusPosition < selectorStart || statusPosition > selectorEnd, "status must not be hidden with selector");
});

test("keyboard mapping covers selector navigation, game input, and utility shortcuts", () => {
  const source = readSource();
  for (const key of [
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    '"w"', '"a"', '"s"', '"d"',
    '"Enter"', '" "', '"r"', '"Escape"', '"m"',
  ]) {
    assert.match(source, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /addEventListener\(["']keydown["']/);
  assert.match(source, /addEventListener\(["']keyup["']/);
  assert.match(source, /preventDefault\(\)/);
  assert.match(source, /handleKeyDown/);
  assert.match(source, /handleKeyUp/);
});

test("direction controls support held pointer input and always release capture", () => {
  const source = readSource();
  for (const eventName of ["pointerdown", "pointerup", "pointercancel", "lostpointercapture"]) {
    assert.match(source, new RegExp(eventName));
  }
  assert.match(source, /setPointerCapture/);
  assert.match(source, /releasePointerCapture/);
  assert.match(source, /heldDirections/);
  assert.match(source, /pointerId/);
  assert.match(source, /touch-action/);
  assert.match(source, /clearHeldInput/);
});

test("controller owns one clamped requestAnimationFrame lifecycle", () => {
  const source = readSource();
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /animationFrameId/);
  assert.match(source, /startLoop/);
  assert.match(source, /stopLoop/);
  assert.match(source, /lastFrameTime/);
  assert.match(source, /MAX_UI_DELTA/);
  assert.match(source, /Math\.min\([^\n]+MAX_UI_DELTA/);
  assert.match(source, /Math\.max\(0,?\s*elapsed/);
  assert.match(source, /cancelAnimationFrame\(animationFrameId\)/);
});

test("each engine has an update and distinct canvas render path", () => {
  const source = readSource();
  for (const name of [
    "renderBlockDrop", "renderBrickBreaker", "renderAlienBlaster", "renderMazeMuncher",
    "updateBlockDrop", "updateBrickBreaker", "updateAlienBlaster", "updateMazeMuncher",
  ]) {
    assert.match(source, new RegExp(`function ${name}`));
  }
  assert.match(source, /case\s+["']block-drop["']/);
  assert.match(source, /case\s+["']brick-breaker["']/);
  assert.match(source, /case\s+["']alien-blaster["']/);
  assert.match(source, /case\s+["']maze-muncher["']/);
  assert.match(source, /stepBlockDrop/);
  assert.match(source, /stepBrickBreaker/);
  assert.match(source, /stepAlienBlaster/);
  assert.match(source, /stepMazeMuncher/);
});

test("restart, selector/home, status, and sound controls update accessible state", () => {
  const source = readSource();
  assert.match(source, /restartGame/);
  assert.match(source, /goHome/);
  assert.match(source, /selectGame/);
  assert.match(source, /screenMessage/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /setAttribute\(["']aria-label["']/);
  assert.match(source, /soundToggle/);
  assert.match(source, /muted/);
  assert.match(source, /addEventListener\(["']click["']/);
});

test("Web Audio cues are gesture-gated, muteable, and safe when unavailable", () => {
  const source = readSource();
  assert.match(source, /AudioContext/);
  assert.match(source, /webkitAudioContext/);
  assert.match(source, /ensureAudio/);
  assert.match(source, /resume\(\)/);
  assert.match(source, /createOscillator/);
  assert.match(source, /createGain/);
  assert.match(source, /gain\.setValueAtTime/);
  assert.match(source, /handleUserGesture/);
  assert.match(source, /playCue/);
  for (const cue of ["select", "start", "move", "launch", "fire", "score", "life", "win", "loss"]) {
    assert.match(source, new RegExp(`["']${cue}["']`));
  }
  assert.match(source, /if\s*\(muted\)/);
  assert.match(source, /try\s*\{/);
});

test("browser verification hook is frozen, read-only, and does not expose engine objects", () => {
  const source = readSource();
  assert.match(source, /window\.__ARCADE_TEST__\s*=\s*Object\.freeze\(\{/);
  assert.match(source, /activeGame/);
  assert.match(source, /selector|paused/);
  assert.match(source, /mute|muted/);
  assert.match(source, /snapshot/);
  assert.match(source, /actions/);
  assert.match(source, /Object\.freeze\(snapshot/);
  const hookStart = source.indexOf("window.__ARCADE_TEST__");
  const hookEnd = source.indexOf("\n\nchoices.forEach", hookStart);
  const hookSource = source.slice(hookStart, hookEnd);
  assert.doesNotMatch(hookSource, /\bgame\s*,/);
});

test("test script runs the arcade UI contract suite", () => {
  const script = fs.readFileSync(testScriptPath, "utf8");
  assert.match(script, /node --test tests\/arcade_ui\.test\.mjs/);
  assert.match(script, /node --test tests\/arcade_runtime\.test\.mjs/);
});
