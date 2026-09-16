# 10 — Staging

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [New elements](09-elements.md)
· **Next:** [Risks](11-risks.md)

**Illustrative, not binding.** This is an ordering of *risk*, written to show
which things unblock which and which are cheap now and expensive later. The
frontier is what actually decides what happens next, and it is expected to
diverge from this page as the work teaches things — that is the method working,
not the plan failing.

Two principles produced the order. **Prep that is invisible goes first**, because
each of these gets more expensive with every site built before it — the
alternative is migrating that site too. And **the two independent tracks start
early**, because they buy schedule room for everything that is not independent.

## Prep — invisible, and worth its own steps

1. **A prop value becomes a tagged thing.** One variant today, `literal`. No
   behaviour changes, nothing renders differently, and every prop site is touched
   exactly once instead of once now and once when expressions arrive.
2. **Addressing carries slots** — [page 5](05-addressing.md). The single most
   invasive change here, entirely invisible, and the one whose cost grows with
   every site built before it: each one has to learn that a node's children are
   no longer one list. Slot components are unused when it lands. The
   *instantiation trail* that carries an iteration index is designed alongside it
   but is additive, and lands with repetition.

## The independent tracks

These depend on nothing above and block nothing below, so they can run whenever
there is appetite — and the second is the one I would start sooner than it
appears to deserve.

- **Springs**, linear and rotary — [page 9](09-elements.md). Additive to the
  document, which is what makes them independent, but real work in the core: each
  is a class, a JSON case on each side of the `physm-rs` boundary, a Rust force
  term and a cross-validated test. That is a feature, not a warm-up — and it
  exercises the force-assembly path external force channels will need later,
  while keeping something visible moving during the document design.
- **Hand-written components** — [page 7](07-handwritten.md). Argued there as the
  pressure valve: it converts everything below from a blocker into an
  inconvenience, and it takes the schedule pressure off the language design,
  which is where schedule pressure does the most damage.

## The spine

2. **Parameters, literal values only.** A definition declares typed parameters; an
   instance passes literals; a child prop may *be* a parameter reference and
   nothing more. This is promote-to-prop, already on the frontier, and it forces
   the scope, naming and declaration-block design ([page 3](03-scope.md)) without
   needing an expression language. `Pendulum` gets its `length` here.
3. **Structural expressions.** Arithmetic and vector operations over parameters
   and constants, stored as a DAG ([page 4](04-expressions.md)). `PendulumCart`
   can compute. `emitScene`'s constants heuristic is deleted rather than tuned.
4. **Signals.** The second evaluation context, hanging off the pose map, plus
   world-space decals — the wish list's line between two anchors. Says which
   solver a per-tick value is specified against ([page 2](02-values.md)).
5. **Named slots** — [page 6](06-structure.md). Cheaper once addressing is done,
   awkward before, and it needs emitter *and* reader work for element-valued
   props, which neither supports today.
6. **Repetition.** Chain and repeat, with the emitted form decided before the
   editor work — the emission constraint is what decides what the node can be.
7. **The port surface.** Outputs and instance names first, then manipulators and
   force channels, then key bindings. [0011](../0011.md) closes here, and the
   emission rule has to be settled for it before the parameters step fixes the
   declaration block's shape.

## Later

- **Algebraic enums** — the feature is deferrable, the decision behind it is not
  ([page 8](08-metadata.md)), and the decision has to be taken with parameters.
- **The expression graph pane.** Deferred deliberately and blocked by nothing
  once expressions are stored as a graph rather than a tree. It is a second renderer of data
  that already exists, which is the whole reason to store a graph.
- **Bidirectional code editing.** Out of scope, by [page 1](01-overview.md).

## What each step has to prove

The emission rule is the gate, and it is worth saying at each step what
"working" means, because for several of these the interesting failure is not in
the editor. **"Emits" is the whole test** — `expectRoundTrip` builds the emitted
module and compares scenes, and never asks for the document back
([page 1](01-overview.md)):

| step | what has to emit |
|---|---|
| parameters | a definition with parameters emits a function with a signature, and the emitted module builds the same scene |
| expressions | a computed prop emits as the host language's own expression — `length={halfLength * 2}`, not a wrapper — and the emitted module builds the same scene |
| signals | a world-space decal emits as an element whose endpoint props hold expressions, and the built scene draws the same line |
| slots | an instance with named slots emits as element-valued props — new work in the emitter, and in the reader for the import path |
| repetition | a chain of N emits as a construct, **not** as N unrolled literals |
| hand-written | the definition's source *is* its own emitted form, so it is the one kind that needs no save format — [page 7](07-handwritten.md) |
| the port surface | **unsettled, and the one step the rule has not been applied to.** `function Pendulum({ length }): ReactElement` cannot express `bobPosition`; a manipulator is editor-only metadata with no runtime meaning; a key binding routed into `cart.trackForce` is a scene-level construct that does not exist. Each needs an invented form the emitter writes and the reader reads |

**That last row is a real hole rather than a formality.** The rule's own answer,
if outputs and channels turn out to have no TSX spelling, is that they belong in the
escape hatch — which would mean [0011](../0011.md) closes by hand-writing a
component rather than by declaring a surface. That is a large enough difference
to want settled before the parameters step fixes the declaration block.
