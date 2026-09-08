# CLAUDE.md — physm

A 2D rigid-body physics engine, in three implementations, with the mathematics
written down separately from the code.

| Directory | What it is |
| --- | --- |
| [`physm-rs`](physm-rs/) | The Rust solver, compiled to wasm. The fast path. |
| [`physm-js`](physm-js/) | The JavaScript solver, and the React app that draws it. [`src/react`](physm-js/src/react/) is the React binding: drawing a scene, and authoring one as JSX. |
| [`physm-py`](physm-py/) | The original 2019 prototype. Historical; not maintained. |
| [`docs`](docs/) | [`algorithm.md`](docs/algorithm.md) — the equations of motion, mapped onto the code. [`constraints.md`](docs/constraints.md) — the loop-closure design. |
| [`docs/issues`](docs/issues/) | The issue tracker: one Markdown file per issue. Regenerate its index with `scripts/render_issues`. |

## Invariants

These look like defects to a reader tidying up, and are not. Each was a
deliberate decision with a reason that is not visible from the code alone.

### `JsSolver`'s naive assembly must stay naive

`JsSolver` builds the mass matrix entry by entry; `physm-rs` builds the same
matrix by composite-inertia sweeps. That is duplication in the sense that both
compute `g`, and it is **not** duplication worth removing.

The cross-validation in `Solver.test.ts` runs the same scene through both and
requires the trajectories to agree. That check is only worth having because the
two get there by *different* routes — two implementations that mirror each other
are one implementation with a spare copy, and would agree just as happily while
both being wrong. Unifying them would leave the test passing and testing nothing.

### The core does not know how to draw

The **scene graph** imports no React: `Scene`, `Frame`, `Decal` and the decal
classes are plain data with geometry on them, so a scene builds, steps and
serializes with no renderer present. Drawing lives in
[`physm-js/src/react`](physm-js/src/react/); `App.jsx` and `index.jsx` are the
app shell that mounts it.

That is the boundary, and it is stated as one rather than as a directory-wide
grep — `git grep react physm-js/src` has hits outside `src/react/` and always
will, because the app is a React app. What must not come back is a `Scene`,
`Frame` or `Decal` that cannot exist without a renderer.

The binding has an *authoring* half as well as a drawing one — `Scene`,
`TrackFrame`, `BoxDecal` and so on, which describe a rig as JSX. Those wrap the
core classes and do not replace them: the constructors stay the API, and a
component is a way of calling one. A scene assembled from JSX and the same
scene assembled by hand are required to be equal, and there is a test that says
so — comparing both the serialization *and* the decals directly, because
`Scene.toJsonObj` omits decals by default and `Decal.toJsonObj` throws, so
serialization alone is blind to a third of the surface.

`DecalView` switches on a union of the decal classes to decide what element a
shape becomes.

That looks like indirection worth collapsing — put `getDomElement` back on the
decal and the switch disappears. It is deliberate: it is what lets a scene be
built, stepped and inspected with no renderer present, and what a second
renderer would need.

The switch narrows over a union of *classes*, not over `kind` alone, and that
detail is the point: a `kind`-only check catches a new kind string but happily
admits a new class reusing an existing one, which is then cast to the wrong
class and draws `NaN`. Adding a decal must be a compile error in `DecalView`
rather than a shape silently missing from the picture, and only the union
delivers that.

### The demo scene's numbers are round on purpose

`CartAndRope.tsx` places its rope anchors at round numbers, where the two chains
do **not** meet. That is the demonstration: a `CoincidenceConstraint` solves for its
second attachment point, so arbitrary geometry builds. Deriving the positions so
the chains meet exactly would remove the thing the scene exists to show — and is
why the numbers there are worth leaving alone, whatever they happen to be.

### Constraints solve for what is omitted, and check what is given

Both branches are live, and the asymmetry is the point.

A parameter the author **omits** is solved for from the pose — `length` for a
distance constraint, `position2` for a coincidence one — so the constraint holds
at `t = 0` by construction, at any geometry. Solving is the *default* because an
earlier design made the author place the frames so the constraint was already
satisfied and then graded the result, which forces them to solve a problem the
code can solve, and because "move the frames until the points coincide" is not
advice an interactive scene builder can act on.

A parameter the author **supplies** is still measured against the pose and
**rejected** on disagreement. Those `throw`s in `Constraint.resolveGeometry` are
load-bearing: this formulation conserves a violation rather than correcting it,
so a stated value that disagrees is a permanent, silent error.
`addConstraint`'s `allowInitialViolation` is the deliberate opt-out, and the
tests for the formulation need it.

## Style

These are not preferences to weigh against others; treat them as requirements.

### One principal export per file, named for the file

A file exports **one** React component, and its name matches the filename. It may
also contain small, private helper components that are not exported.

Most modules here are not components, and the same rule applies to them: a module
is named for its principal export, which is its default export, with closely
related types and helpers alongside — `Constraint.js` exports `Constraint` plus
its two subclasses and `consistencyTolerance`; `Solver.js` exports `Solver` plus
`InvalidStateMapError`.

`utils.js` is the counter-example, not the pattern: twenty-odd unrelated exports
under a name that describes none of them. It is being dismantled.

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

CI runs on pull requests, and on pushes to `master`, when `physm-js/`,
`physm-rs/`, `docs/issues/`, `scripts/` or the workflow itself changes — a PR
touching only `docs/algorithm.md` or `docs/constraints.md` produces no run at
all, which is worth knowing before treating a green tick as coverage of a change
to the mathematics. `physm-rs` is `cargo fmt --check` plus `cargo test`;
`physm-js` is lint, typecheck, test and build; `issues` checks that the tracker's
generated index matches its issue files.

## Issues

The tracker is [`docs/issues/`](docs/issues/) — one Markdown file per issue,
numbered `NNNN.md`, with a generated index at
[`docs/issues/README.md`](docs/issues/README.md). Conventions and how to write a
good one: the [shared issue tracker guide][guide].

Two things about it are easy to get wrong:

- **The index is generated. Never hand-edit it**, including when it conflicts on
  a rebase — run `scripts/render_issues` and stage the result. A hand-merged
  index silently disagrees with what the generator would produce.
- **Flip an issue's status in the PR that changes it**, not a follow-up, so
  `master` is correct the moment that PR merges. The house merge style is
  squash-and-merge, so there is no clean window to fix it up afterwards.

`scripts/render_issues` is [vendored boilerplate][vendored] — shared across
Kroeplex repos and edited upstream, not here.

[guide]: https://github.com/kroeplex/dev-docs/blob/main/docs/issue-tracking.md
[vendored]: https://github.com/kroeplex/dev-docs/blob/main/boilerplate/scripts/render_issues
