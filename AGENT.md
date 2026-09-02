# AGENT.md

Notes for any agent (Claude Code or otherwise) working in this repo. This is
a fork of [aj-r/2048-AI](https://github.com/aj-r/2048-AI), itself a fork of
the original [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048).
Purpose of this fork (`2048-ai-more`): extend the existing rule-based AIs
with trained/learned AIs. See `GOALS.md` for the driving objective and
`summary.md` for a full write-up of the existing implementation.

## Big picture

Client-side-only 2048 game, no backend, no build step, no package manager.
Open `index.html` in a browser and it runs. `js/` is loaded as a flat set of
`<script>` tags (order matters — see `index.html`), not modules — every file
defines globals (`Grid`, `Tile`, `GameController`, `GameManager`, the AI
classes, etc.) onto `window`.

There is **no test framework** in the repo (no `package.json`). Verification
so far has been: `npx jshint <files>` for lint, and a hand-rolled Node
smoke test that loads the non-DOM files (`grid.js`, `tile.js`,
`game_manager.js`, `basic_ai.js`, `smart_ai.js`) into a `vm` context and
plays full games headlessly. That pattern (VM-load the pure-logic files,
skip anything touching `document`/`jQuery`) is the way to script/test this
codebase from Node without a browser.

## File map

| File | Role |
|---|---|
| `index.html` | Loads all scripts, defines the DOM structure incl. AI control buttons (`.smart-ai-button` etc.) |
| `js/grid.js` | `Grid` — 2D cell array, `cellContent`/`insertTile`/`availableCells`/`clone`/`serialize`. Pure data, no game rules. |
| `js/tile.js` | `Tile` — position + value + merge bookkeeping. |
| `js/game_manager.js` | `GameController` (pure game rules: `moveTiles`, `moveAvailable`, `findFarthestPosition`, `buildTraversals`, `getVector`, `movesAvailable`) and `GameManager` (wraps `GameController`, adds DOM/localStorage/actuator wiring, tile spawning incl. the adversarial `addEvilTile`). **`GameController` is reusable headlessly** — the AI search code clones a `Grid`, wraps it in a fresh `GameController`, and simulates moves on it without touching the DOM. This is the hook point for any new search-based AI. |
| `js/basic_ai.js` | Three trivial baseline AIs: `RNGAI`, `PriorityAI`, `AlgorithmAI`. Each is `{game}` in constructor + `nextMove()` returning 0-3 (up/right/down/left). |
| `js/smart_ai.js` | `SmartAI` — the current best AI. Hand-coded depth-3 expectimax-ish search over a hand-coded heuristic (`gridQuality` = monotonicity + empty-cell count). Full breakdown in `summary.md`. **Not a trained model** — this is the baseline any trained AI should be benchmarked against. |
| `js/ai_input_manager.js` | `AIInputManager` — the driver. Owns the `AIMode`/`AISpeed`/`TileGenerator` enums, instantiates whichever AI class per `setAIMode`, calls `ai.nextMove()` on an interval, emits a `"move"` event that `GameManager.move` listens for, tracks a max-tile histogram (`updateStats`). **This is the integration point for a new AI**: add an enum value, a `case` in `setAIMode` instantiating the new class, and a button in `index.html` wired via `bindButtonPress`. |
| `js/html_actuator.js` | Pure rendering (DOM updates for tiles/score). Not relevant to AI logic. |
| `js/local_storage_manager.js` | Persists best score / in-progress game state. Not relevant to AI logic. |
| `js/animframe_polyfill.js`, `bind_polyfill.js`, `classlist_polyfill.js` | Browser compat shims, ignore. |

## The AI interface contract

Every AI is a small class with this shape:

```js
FooAI = function (game) {
  this.game = game; // a GameController/GameManager instance
};
FooAI.prototype.nextMove = function () {
  // return 0 (up), 1 (right), 2 (down), or 3 (left)
};
```

`game.moveAvailable(direction)` tells you if a direction is legal without
mutating state. To *simulate* a move without touching the real game (what
`SmartAI` does), clone the grid and wrap it in a scratch `GameController`:

```js
var testGrid = grid.clone();
var testGame = new GameController(testGrid);
var moved = testGame.moveTiles(direction); // mutates testGrid, not the real game
```

`AIInputManager` is the only caller of `nextMove()` in production; nothing
else needs to change to add a new AI besides that file + `index.html`.

## Known issues in the inherited code (not yet fixed)

- `SmartAI` has a dead, commented-out goal-planning system
  (`determineGoal`/`determineSubGoal`/`getDirections`, `GoalType`
  BUILD/SHIFT/MOVE). `getDirections` is also missing a `return` statement.
  Harmless today since it's unreachable, but worth deleting rather than
  fixing if it's ever touched — the active `planAhead`/`gridQuality` search
  fully replaced it.
- `SmartAI.planAhead` takes the **worst-case** quality across possible tile
  spawns rather than a probability-weighted expectation. This is a
  deliberate (if debatable) design choice, not a bug — flagged here because
  any new expectimax-style AI should decide explicitly which of the two it
  wants rather than copying this without noticing.
- No `.jshintrc` violations are functional, all style-only (missing
  semicolons, line length). Lint is clean enough to trust as a smoke check
  after edits.

## Conventions to follow when adding code

- 2-space indentation, matches `.jshintrc`.
- Direction encoding is fixed across the whole codebase: `0 = up, 1 = right,
  2 = down, 3 = left`. Don't invent a different encoding for a new AI.
- New AI files go in `js/` alongside `basic_ai.js`/`smart_ai.js`, get a
  `<script>` tag added to `index.html` (order matters: must load after
  `grid.js`/`tile.js`/`game_manager.js`, before `ai_input_manager.js`), and
  get registered in `ai_input_manager.js`'s `AIMode` enum + `setAIMode`.
- Since there's no bundler, anything requiring npm packages (e.g.
  TensorFlow.js) needs to be either loaded via a `<script>` CDN tag in
  `index.html` or trained fully offline (Python/Node) with only the final
  inference step (and its runtime deps) added to the browser page.
