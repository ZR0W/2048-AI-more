# GOALS.md

## Objective

Train a model to play 2048, as a new AI mode alongside the existing
rule-based ones (`RNGAI`, `PriorityAI`, `AlgorithmAI`, `SmartAI`) in this
repo. Unlike `SmartAI` — which is a hand-tuned heuristic search, not a
trained model (see `AGENT.md` / `summary.md`) — this should be an AI whose
decision-making is actually learned from play (self-play or otherwise),
not hand-coded.

## Success criteria

- A new AI class (e.g. `TrainedAI` / `NeuralAI`) that implements the same
  `nextMove()` interface as the existing AIs and plugs into
  `AIInputManager` the same way (see `AGENT.md` → "The AI interface
  contract" and "Integration point").
- Benchmarked head-to-head against `SmartAI` over many games (average max
  tile, win rate at 2048, average score) — the existing `SmartAI` (reaches
  2048 reliably, ~7.5ms/move, see `summary.md`) is the baseline to beat.
- Training process is reproducible (documented steps or a script) rather
  than a one-off notebook run.

## Candidate approaches

Full technical detail for each of these is in `summary.md` → "Ideas for
New AIs to Implement" (options 3–5). Summary of the trained-model options:

1. **N-tuple network + TD-learning** — the classic, well-documented
   approach for 2048 (used by the strongest known 2048 bots). Small linear
   lookup tables over local board patterns, trained purely via self-play
   TD(0)/TD(λ) updates, no labeled data. Converges in well under an hour on
   a laptop. Recommended starting point.
2. **Small CNN + TD-learning** — same self-play training loop as (1), but
   with a learned convolutional feature representation instead of fixed
   tuples. A reasonable middle ground if a "real neural net" is preferred
   over lookup tables.
3. **Deep Q-Network (DQN)** — action-value learning via experience replay.
   More standard deep-RL machinery, historically weaker ceiling for 2048
   than (1)/(2) without heavy tuning.
4. **Self-play + MCTS (AlphaZero-style)** — strongest possible ceiling,
   also by far the most implementation and compute effort. Probably a v2
   goal rather than a starting point.

Input representation for any NN-based option: 4×4×16 one-hot tensor per
board (one-hot on `log2(tile value)` per cell) — see `summary.md` for why
raw tile values don't work well as input.

## Proposed phasing

1. **Baseline harness** — headless self-play runner (reuse/extend the Node
   `vm`-based smoke-test pattern already used to test `SmartAI`, see
   `summary.md`) that can play N games with any `nextMove()`-shaped AI and
   report score/max-tile/win-rate stats. Needed regardless of which
   approach is chosen, both for training data generation and benchmarking.
2. **First trained model** — implement approach (1), n-tuple + TD-learning,
   train via self-play using the harness from step 1, and confirm it beats
   `RNGAI`/`PriorityAI`/`AlgorithmAI` at minimum.
3. **Integrate into the game** — wire the trained model into
   `AIInputManager` as a new AI mode so it's playable/watchable in the
   browser like the others.
4. **Benchmark vs. `SmartAI`** — run both over many games, compare stats,
   decide whether to iterate (more training, better tuple shapes, deeper
   TD(λ) trace) or move on to a stronger approach (CNN / MCTS).

## Open questions (not yet decided)

- **Training environment:** train in-browser (TensorFlow.js, matches the
  repo's "no build step" ethos) vs. train offline (Python/Node script,
  export weights/tables, load them for inference only in the browser)?
  Offline is likely faster to iterate on for options 1–3 above.
- **Which approach to start with** — this doc recommends n-tuple +
  TD-learning as the pragmatic first step, but that's a recommendation,
  not a decision made on your behalf.
- **How much of this should live in-browser vs. as a separate
  training/tooling directory** (e.g. a `training/` folder with Python/Node
  scripts, separate from the pure client-side game code)?
- **Target strength** — "beat `SmartAI`'s average" is a reasonable minimum
  bar, but is there a specific target (e.g. consistently reach 4096, or
  win — reach 2048 — a certain % of games)?
