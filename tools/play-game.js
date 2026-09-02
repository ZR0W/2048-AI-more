#!/usr/bin/env node
// Plays out a full game of 2048 headlessly (no browser/DOM) using one of the
// existing AI classes, with a fixed RNG seed so the game is reproducible.
//
// Usage:
//   node tools/play-game.js --seed 42 --ai smart
//   node tools/play-game.js --seed 42 --ai rng --tile-gen evil --verbose
//   node tools/play-game.js --help
//
// The AI itself may be non-deterministic-*looking* (e.g. RNGAI), but since
// the game's Math.random() is replaced with a seeded PRNG before any game
// code runs, every AI is fully reproducible given the same --seed.

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function parseArgs(argv) {
  const args = {
    seed: 1,
    ai: "smart",
    size: 4,
    maxMoves: 100000,
    tileGen: "random",
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split(/=(.*)/s);
    const takeValue = () => (inlineValue !== undefined ? inlineValue : argv[++i]);

    switch (flag) {
      case "--seed":
        args.seed = parseInt(takeValue(), 10);
        break;
      case "--ai":
        args.ai = takeValue();
        break;
      case "--size":
        args.size = parseInt(takeValue(), 10);
        break;
      case "--max-moves":
        args.maxMoves = parseInt(takeValue(), 10);
        break;
      case "--tile-gen":
        args.tileGen = takeValue();
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Play a full game of 2048 headlessly on a fixed RNG seed.

Usage:
  node tools/play-game.js [options]

Options:
  --seed <n>       RNG seed (default: 1). Same seed + same options always
                    produces the exact same game.
  --ai <name>       smart | algorithm | priority | rng   (default: smart)
  --tile-gen <name> random | evil                         (default: random)
  --size <n>        Board size (default: 4)
  --max-moves <n>   Safety cap on move count (default: 100000)
  --verbose         Print the board after every move
  --help            Show this message

Examples:
  node tools/play-game.js --seed 42 --ai smart
  node tools/play-game.js --seed 42 --ai rng --tile-gen evil --verbose
`);
}

// Deterministic 32-bit PRNG (mulberry32). Swapped in for Math.random()
// inside the sandboxed game context so a given seed always replays the
// same sequence of tile spawns (and RNGAI moves, which also call
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

const AI_CLASS_BY_NAME = {
  smart: "SmartAI",
  algorithm: "AlgorithmAI",
  priority: "PriorityAI",
  rng: "RNGAI",
};

const DIRECTION_NAMES = ["up", "right", "down", "left"];

function buildSandbox(seed) {
  const sandbox = {};
  vm.createContext(sandbox);

  // Must run before any game file, so every Math.random() call the game
  // code makes (tile spawn position/value, RNGAI's move choice) is seeded.
  vm.runInContext(makeSeededRandomSource(seed), sandbox, { filename: "seeded-random.js" });

  const jsDir = path.join(__dirname, "..", "js");
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
    throw new Error(`Unknown --tile-gen: ${tileGen}`);
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const aiClassName = AI_CLASS_BY_NAME[args.ai];
  if (!aiClassName) {
    throw new Error(
      `Unknown --ai: ${args.ai} (expected one of: ${Object.keys(AI_CLASS_BY_NAME).join(", ")})`
    );
  }

  const sandbox = buildSandbox(args.seed);
  const game = makeGame(sandbox, args.size, args.tileGen);
  const ai = new sandbox[aiClassName](game);

  console.log(
    `Replay with: node tools/play-game.js --seed ${args.seed} --ai ${args.ai} ` +
      `--tile-gen ${args.tileGen} --size ${args.size}`
  );
  if (args.verbose) {
    console.log(`\nMove 0 (start):\n${renderBoard(game)}\n`);
  }

  let moves = 0;
  const start = Date.now();
  while (!game.over && moves < args.maxMoves) {
    const direction = ai.nextMove();
    const moved = game.moveTiles(direction);
    if (!moved) break; // Shouldn't happen: nextMove() only returns legal moves.
    game.lastDirection = direction;
    game.generateTile();
    moves++;
    if (args.verbose) {
      console.log(`Move ${moves} (${DIRECTION_NAMES[direction]}), score ${game.score}:`);
      console.log(renderBoard(game) + "\n");
    }
  }
  const elapsedMs = Date.now() - start;

  console.log("Final board:");
  console.log(renderBoard(game));
  console.log("");
  console.log(`Seed:        ${args.seed}`);
  console.log(`AI:          ${args.ai}`);
  console.log(`Tile gen:    ${args.tileGen}`);
  console.log(`Moves:       ${moves}${moves >= args.maxMoves ? " (hit --max-moves cap)" : ""}`);
  console.log(`Score:       ${game.score}`);
  console.log(`Max tile:    ${maxTileValue(game)}`);
  console.log(`Game over:   ${game.over}`);
  console.log(`Elapsed:     ${elapsedMs}ms`);
}

main();
