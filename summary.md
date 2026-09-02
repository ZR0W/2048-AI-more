# 2048-AI — Implementation Summary

Repo: `2048-AI` (fork of the original 2048 game). Plain HTML/CSS/JS, no build
system, no `package.json`, no test framework.

## Testing performed

- No automated test suite exists in the repo. `.jshintrc` + `CONTRIBUTING.md`
  indicate lint is the closest thing to a "test" convention.
- Ran `npx jshint` on the core files (`basic_ai.js`, `smart_ai.js`,
  `ai_input_manager.js`, `game_manager.js`, `grid.js`, `tile.js`) → clean
  except style nits (missing semicolons, long lines, a couple unused vars).
  No functional errors.
- Wrote an ad-hoc Node smoke test that loads `grid.js`, `tile.js`,
  `game_manager.js`, `basic_ai.js`, `smart_ai.js` into a `vm` context
  (bypassing the DOM/jQuery-only parts) and played full games with each AI.
  All four ran to completion without exceptions:
  - RNGAI → max tile 64
  - PriorityAI → max tile 128
  - AlgorithmAI (zig-zag) → max tile 512
  - SmartAI → **reached 2048** in 1,771 moves, averaging ~7.5ms/move with no
    runaway blowup over the course of the game.

## The four AI strategies

### `js/basic_ai.js`
1. **`RNGAI`** — picks a uniformly random legal direction.
2. **`PriorityAI`** — fixed priority order (up, left, right, down); plays the
   first legal one.
3. **`AlgorithmAI`** — alternates up/left each turn, falling back to the
   priority list when neither is legal. A trivial "corner-building"
   heuristic.

### `js/smart_ai.js` — `SmartAI` (the real AI)
A hand-tuned depth-limited search, **not** a trained model.

- **Evaluation function** (`gridQuality`): sums a *monotonicity* score across
  every row and column (rewards tiles that increase/decrease consistently
  toward a direction, penalizes reversals) plus a weighted count of empty
  cells (weight 8). Same family of heuristic used by well-known 2048
  solvers, simplified (no "smoothness" term, no bitboards).
- **Search** (`planAhead`, default depth 3): for each of the 4 moves,
  simulates the move on a cloned grid, then enumerates possible tile-spawn
  locations — pruned to cells *adjacent to an existing tile* only (assumed
  worst case). For each spawn, recurses one ply deeper (the AI's own best
  continuation), then takes the **worst-case** resulting quality across
  spawns rather than a probability-weighted average — an expectimax-style
  search that is pessimistic at the chance node rather than
  expectation-based.
- **Move selection** (`chooseBestMove`): minimizes `qualityLoss` (expected
  drop from current quality) rather than maximizing raw quality, tie-broken
  by quality then by probability of the worst outcome. Risk-averse rather
  than purely quality-maximizing.
- **Dead code found:** an earlier goal-based planning system
  (`determineGoal`, `determineSubGoal`, "BUILD/SHIFT/MOVE" sub-goals) is
  entirely commented out in `nextMove` and unused. `getDirections` (only
  used by that dead path) is also missing a `return` statement — a latent
  bug, harmless since it's never called.

## Orchestration

- `js/ai_input_manager.js` — `AIInputManager` swaps in whichever AI class
  based on UI buttons, drives moves on an interval (Full/Fast/Slow speed),
  tracks a histogram of the highest tile reached per game, and auto-restarts
  after a loss.
- `js/game_manager.js` — includes an **"Evil" tile generator**
  (`GameManager.addEvilTile`): instead of spawning tiles randomly, it
  deliberately places the new tile in the worst position along the edge
  opposite the last move direction, adjacent to the highest-value tile it
  can find. Adversarial stress-test mode for whichever AI (or human) is
  playing.

---

# Ideas for New AIs to Implement

Roughly in order of implementation effort. All can plug into
`AIInputManager` the same way the existing ones do — just needs a class with
a `nextMove()` method and registration in the `AIMode` enum / `setAIMode`
switch.

## 1. Deeper / smarter expectimax (small effort)
Fix the existing search rather than replace it:
- Use **true expected value** at chance nodes (probability-weighted average
  over all empty cells, weighted 90%/10% for spawning a 2 vs a 4) instead of
  worst-case-only. This is what most strong classical 2048 bots do.
- Add **alpha-beta-style pruning** and **iterative deepening with a time
  budget** so depth can scale adaptively (search deeper when the board is
  emptier / cheaper, shallower when many cells are occupied).
- Improve the heuristic: add a **smoothness** term (penalize large value
  differences between adjacent tiles) and an explicit **corner-weighting**
  term (snake/weighted-matrix heuristic), on top of the existing
  monotonicity + empty-cell terms.

## 2. Monte Carlo Tree Search (medium effort)
Instead of a fixed-depth exhaustive tree, run random playouts:
- From the current state, repeatedly sample a move (guided by UCB1) then
  simulate the rest of the game with a fast random/greedy rollout policy,
  backing up the final score (or max tile) to estimate each move's value.
- Naturally handles the huge branching factor better than exhaustive search
  at higher depths, and is easy to time-box (run for N milliseconds, return
  the best move found so far) which fits the existing `AISpeed` concept well.

## 3. Genetic algorithm / CMA-ES weight tuning (medium effort, big payoff for low effort)
Keep `SmartAI`'s existing heuristic structure (monotonicity, empty cells,
smoothness, corner weighting) but stop hand-picking the weights:
- Represent the weight vector as a genome, run many self-play games per
  candidate, and evolve weights against average/max score. This is a
  classic, well-documented approach for 2048 (search "2048 AI weight
  tuning genetic algorithm") and would meaningfully improve `SmartAI`
  without touching its search structure at all — a nice standalone project.

## 4. N-Tuple Network + TD-learning (the classic "trained" 2048 AI)
This is what the strongest known 2048 bots (e.g. Szubert & Jaśkowski's
research, and most open-source 2048 AIs that beat human play) actually use,
and is arguably a better fit than a deep NN for this specific game:
- **Representation:** instead of one big neural net, define a set of
  overlapping "tuples" of board cells (e.g. all 4-in-a-row/column windows,
  plus a few L/square-shaped tuples). Each tuple has its own lookup table
  mapping the *combination of tile values it sees* → a learned scalar value.
- **Evaluation:** the board's value = sum of all tuples' looked-up values
  (after accounting for the 8 board symmetries — rotations/reflections — to
  share learning across equivalent positions).
- **Training:** TD(0)/TD(λ) self-play — after each move, update the tuple
  tables toward the observed reward + the value of the resulting state. No
  labeled data needed; it bootstraps purely from self-play, and converges
  fast (hours, not days) because the tuple tables are small and linear.
- **Why this beats a "normal" NN here:** 2048's state space is small and
  highly structured (16 cells, each one of ~17 possible log2 values), so a
  linear combination of local lookup tables can represent the value function
  almost exactly, while training in a fraction of the time/compute a deep
  net would need. This is genuinely worth trying before jumping to deep RL.

## 5. Deep NN
If you want an actual trained neural net rather than a tuple network, here's
a concrete shape that would work well for 2048:

**Input representation**
- Encode the 4×4 board as a **4×4×16 one-hot tensor**: for each cell, a
  16-length one-hot vector over `{empty, 2, 4, 8, ..., 65536}` (i.e. one-hot
  on `log2(value)`, 0 for empty). This is the representation used by most
  successful 2048 deep-RL papers/projects — raw tile values confuse a net
  because 2048 vs 4 differ by 3 orders of magnitude, but their *log2
  exponents* differ by just 1.

**Architecture**
- A small **CNN**: a couple of conv layers with rectangular filters sized to
  catch rows/columns/2×2 blocks (e.g. 1×2, 2×1, 2×2 kernels — mirroring the
  n-tuple idea above but learned), flattened into 1–2 dense layers, ending
  in either:
  - a single scalar **value head** (expected score / win probability from
    this state) — used inside expectimax/MCTS in place of the hand-coded
    `gridQuality`, or
  - a **policy head** (4 move logits) + value head, AlphaZero-style, used
    with MCTS for both move selection and training targets.

**Training approach**
- **Option A — Deep Q-Network (DQN):** treat each move as an action, reward
  = merge score gained (or +1 per successful move, large penalty on game
  over), train via experience replay + target network. Simplest to
  implement, historically gets to ~2048–4096 tiles with a decent net but
  plateaus without heavy tuning.
- **Option B — Self-play + MCTS (AlphaZero-style):** use the CNN's
  value/policy heads to guide MCTS during self-play, then train the net on
  the (state, MCTS visit-count policy, final outcome) tuples generated. Much
  stronger ceiling, notably more implementation/compute effort.
- **Option C — TD-learning directly on the value head:** same TD(0)/TD(λ)
  update rule as the n-tuple approach above, but backpropagated into the CNN
  weights instead of table lookups. A nice middle ground: keeps the simple
  self-play training loop of approach 4 but with a learned (rather than
  fixed) feature representation.

**Practical note:** since the whole game already runs in-browser as plain
JS, the natural fit is **TensorFlow.js** — train either in-browser or
offline in Python/Keras and export weights, then run inference with
`tf.js` inside a new `NeuralAI` class implementing `nextMove()`. Given the
board is only 16 cells, even a modest net can run inference well within the
existing `fastMoveTime` (200ms) budget.

**Suggested starting point if you want to actually build one:** start with
option 4 (n-tuple + TD-learning) or option C (small CNN + TD-learning) —
both train from scratch via self-play in well under an hour on a laptop and
will likely outperform the current `SmartAI` without needing MCTS or
AlphaZero-level infrastructure.
