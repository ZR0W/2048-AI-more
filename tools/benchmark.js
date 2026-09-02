#!/usr/bin/env node
// Runs many headless games per AI and reports aggregate stats (score,
// game length, win rate, max-tile distribution) so the rule-based AIs can
// be compared against each other -- and, eventually, against a trained AI
// (see ../GOALS.md). Games run in-process via tools/lib/game-runner.js, so
// there's no per-game process-startup overhead.
//
// Usage:
//   node tools/benchmark.js
//   node tools/benchmark.js --games 50 --ai smart,rng
//   node tools/benchmark.js --games 100 --ai rng,priority,algorithm --csv out.csv
//   node tools/benchmark.js --help
//
// Note: SmartAI's depth-3 search is much slower than the other three AIs
// (roughly a few seconds per game vs. single-digit milliseconds), so a
// large --games with "smart" included can take a while. The default
// --games is kept modest for that reason -- pass a bigger number
// explicitly for a full report.

"use strict";

const fs = require("fs");
const runner = require("./lib/game-runner");

const ALL_AIS = Object.keys(runner.AI_CLASS_BY_NAME);

function parseArgs(argv) {
  const args = {
    games: 20,
    ai: ALL_AIS.slice(),
    tileGen: "random",
    seedStart: 1,
    size: 4,
    maxMoves: 100000,
    csv: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split(/=(.*)/s);
    const takeValue = () => (inlineValue !== undefined ? inlineValue : argv[++i]);

    switch (flag) {
      case "--games":
        args.games = parseInt(takeValue(), 10);
        break;
      case "--ai":
        args.ai = takeValue()
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name.length > 0);
        break;
      case "--tile-gen":
        args.tileGen = takeValue();
        break;
      case "--seed-start":
        args.seedStart = parseInt(takeValue(), 10);
        break;
      case "--size":
        args.size = parseInt(takeValue(), 10);
        break;
      case "--max-moves":
        args.maxMoves = parseInt(takeValue(), 10);
        break;
      case "--csv":
        args.csv = takeValue();
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
Benchmark the rule-based AIs over many headless games.

Usage:
  node tools/benchmark.js [options]

Options:
  --games <n>        Games to play per AI (default: 20). SmartAI is much
                      slower than the other AIs -- opt into a large number
                      explicitly.
  --ai <list>         Comma-separated: ${ALL_AIS.join(", ")}
                      (default: all of them)
  --tile-gen <name>   random | evil (default: random)
  --seed-start <n>    First seed used (default: 1). Game i for a given AI
                      uses seed (seed-start + i), so a run is reproducible.
  --size <n>          Board size (default: 4)
  --max-moves <n>     Safety cap on move count per game (default: 100000)
  --csv <path>        Also write one row per game to this CSV file
  --help              Show this message

Examples:
  node tools/benchmark.js --games 30
  node tools/benchmark.js --games 100 --ai rng,priority --csv results.csv
`);
}

function average(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdev(values) {
  const mean = average(values);
  const variance = average(values.map((v) => (v - mean) * (v - mean)));
  return Math.sqrt(variance);
}

function runBenchmarkForAI(aiName, args) {
  const results = [];
  for (let i = 0; i < args.games; i++) {
    process.stdout.write(`\r${aiName}: game ${i + 1}/${args.games}...`);
    results.push(
      runner.playGame({
        seed: args.seedStart + i,
        ai: aiName,
        size: args.size,
        tileGen: args.tileGen,
        maxMoves: args.maxMoves,
      })
    );
  }
  process.stdout.write(`\r${aiName}: ${args.games}/${args.games} games done.` + " ".repeat(10) + "\n");
  return results;
}

// Buckets max tiles by power of two (128, 256, ..., mirrors the histogram
// AIInputManager.updateStats() shows in the browser's .stats-container).
function maxTileHistogram(results) {
  const counts = {};
  for (const result of results) {
    counts[result.maxTile] = (counts[result.maxTile] || 0) + 1;
  }
  return Object.keys(counts)
    .map(Number)
    .sort((a, b) => a - b)
    .map((maxTile) => ({ maxTile: maxTile, count: counts[maxTile] }));
}

function summarize(aiName, results) {
  const scores = results.map((r) => r.score);
  const moves = results.map((r) => r.moves);
  const wins = results.filter((r) => r.maxTile >= 2048).length;

  return {
    ai: aiName,
    games: results.length,
    avgScore: average(scores),
    medianScore: median(scores),
    stdevScore: stdev(scores),
    avgMoves: average(moves),
    medianMoves: median(moves),
    winRate: wins / results.length,
    histogram: maxTileHistogram(results),
  };
}

function printSummaryTable(summaries) {
  const headers = ["AI", "Games", "Avg Score", "Median Score", "Stdev Score", "Avg Moves", "Median Moves", "Win Rate"];
  const rows = summaries.map((s) => [
    s.ai,
    String(s.games),
    s.avgScore.toFixed(1),
    s.medianScore.toFixed(1),
    s.stdevScore.toFixed(1),
    s.avgMoves.toFixed(1),
    s.medianMoves.toFixed(1),
    (s.winRate * 100).toFixed(1) + "%",
  ]);

  const widths = headers.map((h, col) => Math.max(h.length, ...rows.map((r) => r[col].length)));
  const formatRow = (cells) => cells.map((cell, col) => cell.padEnd(widths[col])).join("  ");

  console.log("");
  console.log(formatRow(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) {
    console.log(formatRow(row));
  }

  console.log("\nMax-tile distribution:");
  for (const s of summaries) {
    const parts = s.histogram.map(
      (bucket) => `${bucket.maxTile}: ${bucket.count} (${((bucket.count / s.games) * 100).toFixed(1)}%)`
    );
    console.log(`  ${s.ai.padEnd(10)} ${parts.join("  ")}`);
  }
}

function writeCsv(path, allResults) {
  const header = "seed,ai,tileGen,size,moves,score,maxTile,over";
  const lines = allResults.map(
    (r) => `${r.seed},${r.ai},${r.tileGen},${r.size},${r.moves},${r.score},${r.maxTile},${r.over}`
  );
  fs.writeFileSync(path, [header].concat(lines).join("\n") + "\n");
  console.log(`\nWrote ${allResults.length} rows to ${path}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  for (const aiName of args.ai) {
    if (!runner.AI_CLASS_BY_NAME[aiName]) {
      throw new Error(`Unknown --ai: ${aiName} (expected one of: ${ALL_AIS.join(", ")})`);
    }
  }

  if (args.ai.includes("smart") && args.games > 20) {
    console.log(
      `Note: SmartAI is much slower than the other AIs -- ${args.games} games may take a while.\n`
    );
  }

  const allResults = [];
  const summaries = [];
  for (const aiName of args.ai) {
    const results = runBenchmarkForAI(aiName, args);
    allResults.push(...results);
    summaries.push(summarize(aiName, results));
  }

  printSummaryTable(summaries);

  if (args.csv) {
    writeCsv(args.csv, allResults);
  }
}

main();
