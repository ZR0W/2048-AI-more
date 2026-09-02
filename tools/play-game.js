#!/usr/bin/env node
// Plays out a full game of 2048 headlessly (no browser/DOM) using one of the
// existing AI classes, with a fixed RNG seed so the game is reproducible.
//
// Usage:
//   node tools/play-game.js --seed 42 --ai smart
//   node tools/play-game.js --seed 42 --ai rng --tile-gen evil --verbose
//   node tools/play-game.js --seed 42 --ai smart --json
//   node tools/play-game.js --help
//
// The AI itself may be non-deterministic-*looking* (e.g. RNGAI), but since
// the game's Math.random() is replaced with a seeded PRNG before any game
// code runs, every AI is fully reproducible given the same --seed.

"use strict";

const runner = require("./lib/game-runner");

function parseArgs(argv) {
  const args = {
    seed: 1,
    ai: "smart",
    size: 4,
    maxMoves: 100000,
    tileGen: "random",
    verbose: false,
    json: false,
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
      case "--json":
        args.json = true;
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
  --json            Print one line of machine-readable JSON instead of the
                    human-readable summary (suppresses all other output)
  --help            Show this message

Examples:
  node tools/play-game.js --seed 42 --ai smart
  node tools/play-game.js --seed 42 --ai rng --tile-gen evil --verbose
  node tools/play-game.js --seed 42 --ai smart --json
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!runner.AI_CLASS_BY_NAME[args.ai]) {
    throw new Error(
      `Unknown --ai: ${args.ai} (expected one of: ${Object.keys(runner.AI_CLASS_BY_NAME).join(", ")})`
    );
  }

  if (!args.json) {
    console.log(
      `Replay with: node tools/play-game.js --seed ${args.seed} --ai ${args.ai} ` +
        `--tile-gen ${args.tileGen} --size ${args.size}`
    );
  }

  let onMove = null;
  if (args.verbose && !args.json) {
    onMove = function (moveNum, game, direction) {
      if (moveNum === 0) {
        console.log(`\nMove 0 (start):\n${runner.renderBoard(game)}\n`);
      } else {
        console.log(`Move ${moveNum} (${runner.DIRECTION_NAMES[direction]}), score ${game.score}:`);
        console.log(runner.renderBoard(game) + "\n");
      }
    };
  }

  const result = runner.playGame({
    seed: args.seed,
    ai: args.ai,
    size: args.size,
    tileGen: args.tileGen,
    maxMoves: args.maxMoves,
    onMove: onMove,
  });

  if (args.json) {
    console.log(
      JSON.stringify({
        seed: result.seed,
        ai: result.ai,
        tileGen: result.tileGen,
        size: result.size,
        moves: result.moves,
        score: result.score,
        maxTile: result.maxTile,
        over: result.over,
      })
    );
    return;
  }

  console.log("Final board:");
  console.log(runner.renderBoard(result.game));
  console.log("");
  console.log(`Seed:        ${result.seed}`);
  console.log(`AI:          ${result.ai}`);
  console.log(`Tile gen:    ${result.tileGen}`);
  console.log(`Moves:       ${result.moves}${result.hitMaxMoves ? " (hit --max-moves cap)" : ""}`);
  console.log(`Score:       ${result.score}`);
  console.log(`Max tile:    ${result.maxTile}`);
  console.log(`Game over:   ${result.over}`);
  console.log(`Elapsed:     ${result.elapsedMs}ms`);
}

main();
