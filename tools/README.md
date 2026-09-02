# tools/

Command-line helpers for working with the game logic outside the browser.
Pure Node, no dependencies.

## `play-game.js`

Plays a full game of 2048 headlessly using one of the existing AI classes,
with a fixed RNG seed so the game is 100% reproducible.

```sh
node tools/play-game.js --seed 42 --ai smart
node tools/play-game.js --seed 42 --ai rng --tile-gen evil --verbose
node tools/play-game.js --seed 42 --ai smart --json
node tools/play-game.js --help
```

Pass `--json` to print a single line of machine-readable JSON (`{seed, ai,
tileGen, size, moves, score, maxTile, over}`) instead of the human-readable
summary; all other output is suppressed so the line is safe to pipe into
`JSON.parse`.

How it works: it loads `grid.js`, `tile.js`, `game_manager.js`,
`basic_ai.js`, and `smart_ai.js` into a Node `vm` context (skipping the
DOM/jQuery-only files), then overrides that context's `Math.random` with a
seeded PRNG (mulberry32) *before* any game code runs. Every place the game
calls `Math.random()` — tile spawn position/value, and `RNGAI`'s move
choice — goes through the seeded generator, so the same `--seed` always
replays the exact same game regardless of which AI is used. This plumbing
lives in `lib/game-runner.js`, shared with `benchmark.js` below.

## `benchmark.js`

Runs many headless games per AI, in-process (no per-game process-startup
overhead), and reports aggregate stats: average/median/stdev score,
average/median game length, win rate (max tile ≥ 2048), and a max-tile
distribution histogram.

```sh
node tools/benchmark.js
node tools/benchmark.js --games 50 --ai smart,rng
node tools/benchmark.js --games 100 --ai rng,priority,algorithm --csv out.csv
node tools/benchmark.js --help
# or, equivalently:
tools/benchmark.sh --games 50 --ai smart,rng
```

`SmartAI`'s depth-3 search is far slower than the other three AIs (seconds
per game vs. single-digit milliseconds), so the default `--games` is kept
modest (20) and a run including `smart` prints a heads-up when `--games` is
large — opt into a bigger `smart` benchmark explicitly. Progress prints
per-AI as games complete. `--csv <path>` additionally writes one row per
game (`seed,ai,tileGen,size,moves,score,maxTile,over`) for external
plotting/analysis. `--seed-start <n>` (default 1) makes a batch
reproducible as a whole: game *i* for a given AI uses seed
`seed-start + i`.

This is the headless self-play/benchmark harness described in
`../GOALS.md`.
