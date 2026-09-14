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
the alternative is doing it twice with a migration in between. And **the two
independent tracks start early**, because they buy schedule room for everything
that is not independent.

## Prep — invisible, and worth its own steps

1. **A prop value becomes a tagged thing.** One variant today, `literal`. No
   behaviour changes, nothing renders differently, and every prop site is touched
   exactly once instead of once now and once when expressions arrive.
2. **Addressing carries slots and iteration** — [page 5](05-addressing.md). The
   single most invasive change here, entirely invisible, and the only one whose
   cost doubles if it is split. Slot components are unused and iteration is
   `null` everywhere when it lands.

## The independent tracks

These depend on nothing above and block nothing below, so they can run whenever
there is appetite — and the second is the one I would start sooner than it
appears to deserve.

- **Springs**, linear and rotary — [page 9](09-elements.md). Additive, exercises
  the force-assembly path that external force channels will need later, and keeps
  something visible moving while the document work is still design.
- **Hand-written components** — [page 7](07-handwritten.md). Argued there as the
  pressure valve: it converts everything below from a blocker into an
  inconvenience, and it takes the schedule pressure off the language design,
  which is where schedule pressure does the most damage.

## The spine

3. **Parameters, literal values only.** A definition declares typed parameters; an
   instance passes literals; a child prop may *be* a parameter reference and
   nothing more. This is promote-to-prop, already on the frontier, and it forces
   the scope, naming and declaration-block design ([page 3](03-scope.md)) without
   needing an expression language. `Pendulum` gets its `length` here.
4. **Structural expressions.** Arithmetic and vector operations over parameters
   and constants, stored as a DAG ([page 4](04-expressions.md)). `PendulumCart`
   can compute. `emitScene`'s constants heuristic is deleted rather than tuned.
5. **Signals.** The second evaluation context, hanging off the pose map, plus
   world-space decals — which is the wish list's line between two anchors, and
   which settles [0003](../0003.md).
6. **Named slots** — [page 6](06-structure.md). Cheap once addressing is done,
   awkward before.
7. **[0005](../0005.md), sibling order.** Resolved *before* repetition rather than
   discovered through it.
8. **Repetition.** Chain and repeat, with the emitted form decided before the
   editor work — the round-trip constraint is what decides what the node can be.
9. **The port surface.** Outputs and instance names first, then manipulators and
   force channels, then key bindings. [0011](../0011.md) closes here.

## Later

- **Algebraic enums** — the feature is deferrable, the decision behind it is not
  ([page 8](08-metadata.md)), and the decision has to be taken at step 3.
- **The expression graph pane.** Deferred deliberately and blocked by nothing
  once step 4 stores a graph rather than a tree. It is a second renderer of data
  that already exists, which is the whole reason to store a graph.
- **Bidirectional code editing.** Out of scope, by [page 1](01-overview.md).

## What each step has to prove

The round-trip rule is the gate, and it is worth saying at each step what
"working" means, because for several of these the interesting failure is not in
the editor:

| step | what has to round-trip |
|---|---|
| parameters | a definition with parameters emits a function with a signature, and reads back |
| expressions | a computed prop emits as an expression and parses back to the same graph, sharing included |
| slots | an instance with named slots emits as element-valued props and reads back |
| repetition | a chain of N emits as a construct, **not** as N unrolled literals |
| hand-written | the definition's source is its own emitted form, trivially — but the whole-document guarantee weakens to per-definition |
