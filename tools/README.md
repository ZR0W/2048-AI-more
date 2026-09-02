# tools/

Command-line helpers for working with the game logic outside the browser.
Pure Node, no dependencies.

## `play-game.js`

Plays a full game of 2048 headlessly using one of the existing AI classes,
with a fixed RNG seed so the game is 100% reproducible.

```sh
node tools/play-game.js --seed 42 --ai smart
node tools/play-game.js --seed 42 --ai rng --tile-gen evil --verbose
node tools/play-game.js --help
```

How it works: it loads `grid.js`, `tile.js`, `game_manager.js`,
`basic_ai.js`, and `smart_ai.js` into a Node `vm` context (skipping the
DOM/jQuery-only files), then overrides that context's `Math.random` with a
seeded PRNG (mulberry32) *before* any game code runs. Every place the game
calls `Math.random()` — tile spawn position/value, and `RNGAI`'s move
choice — goes through the seeded generator, so the same `--seed` always
replays the exact same game regardless of which AI is used.

This is also the starting point for a headless self-play/benchmark harness
(see `../GOALS.md`).
