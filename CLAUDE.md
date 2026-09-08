# CLAUDE.md — physm

A 2D rigid-body physics engine, in three implementations, with the mathematics
written down separately from the code.

| Directory | What it is |
| --- | --- |
| [`physm-rs`](physm-rs/) | The Rust solver, compiled to wasm. The fast path. |
| [`physm-js`](physm-js/) | The JavaScript solver, and the React app that draws it. |
| [`physm-py`](physm-py/) | The original 2019 prototype. Historical; not maintained. |
| [`docs`](docs/) | [`algorithm.md`](docs/algorithm.md) — the equations of motion, mapped onto the code. [`constraints.md`](docs/constraints.md) — the loop-closure design. |

## Invariants

These look like defects to a reader tidying up, and are not. Each was a
deliberate decision with a reason that is not visible from the code alone.

### `JsSolver`'s naive assembly must stay naive

`JsSolver` builds the mass matrix entry by entry; `physm-rs` builds the same
matrix by composite-inertia sweeps. That is duplication in the sense that both
compute `g`, and it is **not** duplication worth removing.

The cross-validation in `Solver.test.js` runs the same scene through both and
requires the trajectories to agree. That check is only worth having because the
two get there by *different* routes — two implementations that mirror each other
are one implementation with a spare copy, and would agree just as happily while
both being wrong. Unifying them would leave the test passing and testing nothing.

### The demo scene's numbers are round on purpose

`App.jsx` places its rope anchors at round numbers, where the two chains do
**not** meet. That is the demonstration: a `CoincidenceConstraint` solves for its
second attachment point, so arbitrary geometry builds. Deriving the positions so
the chains meet exactly would remove the thing the scene exists to show — and is
why the numbers there are worth leaving alone, whatever they happen to be.

### Constraints solve; they do not grade

A constraint type leaves one parameter unspecified and `Scene.addConstraint`
fills it in from the pose — `length` for a distance constraint, `position2` for a
coincidence one. An earlier design measured the geometry and *rejected* an
inconsistent scene; it was replaced because it forces the author to solve a
problem the code can solve, and because "move the frames until the points
coincide" is not advice an interactive scene builder can act on.

## Style

These are not preferences to weigh against others; treat them as requirements.

### One exported component per file

A file exports **one** React component, and its name matches the filename. It may
also contain small, private helper components that are not exported.

### Define before use

**Definitions appear in topologically sorted order.** JavaScript hoisting makes
forward references legal; they are still forbidden here. A reader should never
have to scroll down to find out what something is, and a file should read from
its primitives to its conclusions.

### Let the code breathe

**A comment that occupies its own line gets a blank line above it**, nearly
always. More generally, use vertical whitespace to group related statements —
dense code is harder to read than long code.

```js
const { vector, distance } = scene.getSeparation('pole1', tip, 'pole2', tip);
expect(distance).toBeCloseTo(TIP_GAP, 4);

// Mirrored poles put the tips at the same height, so the gap is horizontal.
expect(vector[1]).toBeCloseTo(0, 4);
```

### Prefer small helper functions

Split freely, even when it costs a few extra parameters. A helper's signature
makes its inputs and outputs explicit, which is worth real verbosity — especially
in JS/TS, where closures capture the enclosing scope silently and a block's
actual dependencies are otherwise invisible.

### Single quotes

`'like this'`.

## Working here

```bash
cd physm-js && npm run setup   # builds both wasm targets, then installs
cd physm-js && npm test        # rebuilds the node wasm target first
cd physm-js && npm run dev     # the demo, on :5173
cd physm-rs && cargo test
cd physm-rs && cargo fmt
```

CI runs both packages on every push and pull request: `physm-rs` is `cargo fmt
--check` plus `cargo test`; `physm-js` is lint, typecheck, test and build.
