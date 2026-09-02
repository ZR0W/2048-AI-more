"use strict";

// Shared headless game/AI plumbing used by both play-game.js (single game,
// human-readable or --json output) and benchmark.js (many games in-process,
// aggregated stats). Keeping this here means a batch run doesn't pay
// per-process Node startup overhead for every game.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const AI_CLASS_BY_NAME = {
  smart: "SmartAI",
  algorithm: "AlgorithmAI",
  priority: "PriorityAI",
  rng: "RNGAI",
};

const DIRECTION_NAMES = ["up", "right", "down", "left"];

// Deterministic 32-bit PRNG (mulberry32). Swapped in for Math.random()
// inside the sandboxed game context so a given seed always replays the
// same sequence of tile spawns (and RNGAI's move choice, which also calls
// Math.random()).
function makeSeededRandomSource(seed) {
  return `
    (function () {
      var state = ${seed >>> 0};
      Math.random = function () {
        state |= 0;
        state = (state + 0x6D2B79F5) | 0;
        var t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
  `;
}

function buildSandbox(seed) {
  const sandbox = {};
  vm.createContext(sandbox);

  // Must run before any game file, so every Math.random() call the game
  // code makes (tile spawn position/value, RNGAI's move choice) is seeded.
  vm.runInContext(makeSeededRandomSource(seed), sandbox, { filename: "seeded-random.js" });

  const jsDir = path.join(__dirname, "..", "..", "js");
  const files = ["tile.js", "grid.js", "game_manager.js", "basic_ai.js", "smart_ai.js"];
  for (const file of files) {
    const fullPath = path.join(jsDir, file);
    vm.runInContext(fs.readFileSync(fullPath, "utf8"), sandbox, { filename: fullPath });
  }
  return sandbox;
}

function makeGame(sandbox, size, tileGen) {
  const grid = new sandbox.Grid(size);
  const game = new sandbox.GameController(grid);
  game.score = 0;
  game.over = false;
  game.lastDirection = 0;

  if (tileGen === "evil") {
    game.generateTile = sandbox.GameManager.prototype.addEvilTile;
  } else if (tileGen === "random") {
    game.generateTile = sandbox.GameManager.prototype.addRandomTile;
  } else {
    throw new Error(`Unknown tile-gen: ${tileGen}`);
  }

  game.generateTile();
  game.generateTile();
  return game;
}

function renderBoard(game) {
  const size = game.grid.size;
  const colWidth = 6;
  const lines = [];
  for (let y = 0; y < size; y++) {
    let row = "";
    for (let x = 0; x < size; x++) {
      const tile = game.grid.cellContent({ x: x, y: y });
      const text = tile ? String(tile.value) : ".";
      row += text.padStart(colWidth);
    }
    lines.push(row);
  }
  return lines.join("\n");
}

function maxTileValue(game) {
  let max = 0;
  game.grid.eachCell(function (x, y, tile) {
    if (tile) max = Math.max(max, tile.value);
  });
  return max;
}

// Plays one full headless game and returns its result. Pass `onMove(moveNum,
// game, direction)` to observe every ply (moveNum 0 is the initial board,
// direction is null then); used by play-game.js's --verbose mode.
function playGame(options) {
  const seed = options.seed;
  const ai = options.ai;
  const size = options.size || 4;
  const tileGen = options.tileGen || "random";
  const maxMoves = options.maxMoves || 100000;
  const onMove = options.onMove;

  const aiClassName = AI_CLASS_BY_NAME[ai];
  if (!aiClassName) {
    throw new Error(
      `Unknown ai: ${ai} (expected one of: ${Object.keys(AI_CLASS_BY_NAME).join(", ")})`
    );
  }

  const sandbox = buildSandbox(seed);
  const game = makeGame(sandbox, size, tileGen);
  const aiInstance = new sandbox[aiClassName](game);

  if (onMove) onMove(0, game, null);

  let moves = 0;
  const start = Date.now();
  while (!game.over && moves < maxMoves) {
    const direction = aiInstance.nextMove();
    const moved = game.moveTiles(direction);
    if (!moved) break; // Shouldn't happen: nextMove() only returns legal moves.
    game.lastDirection = direction;
    game.generateTile();
    moves++;
    if (onMove) onMove(moves, game, direction);
  }
  const elapsedMs = Date.now() - start;

  return {
    seed: seed,
    ai: ai,
    tileGen: tileGen,
    size: size,
    moves: moves,
    hitMaxMoves: moves >= maxMoves,
    score: game.score,
    maxTile: maxTileValue(game),
    over: game.over,
    elapsedMs: elapsedMs,
    game: game,
  };
}

module.exports = {
  AI_CLASS_BY_NAME: AI_CLASS_BY_NAME,
  DIRECTION_NAMES: DIRECTION_NAMES,
  buildSandbox: buildSandbox,
  makeGame: makeGame,
  renderBoard: renderBoard,
  maxTileValue: maxTileValue,
  playGame: playGame,
};
