# 1 — Overview

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Next:** [Structural values and signals](02-values.md)

[0014](../0014.md) built an editor whose document is an element tree, and the
trick that made it tractable was that **JSX is already a data literal**:
`<RopeChain anchor={p} />` evaluates to `{ type, props }` without calling
`RopeChain`, so the element tree *is* a document model. No parser, no
round-trip machinery.

That trick has a price, and this RFC is about paying it. An element tree is a
*value*. A component function is a *program*. By choosing the tree, the editor
can describe any scene that is fully determined the moment it is written down,
and cannot describe any scene whose shape or numbers depend on anything.

## What the subset can and cannot say

Everything the editor emits today is a literal. A prop is plain data —
`emitScene` refuses one that is not. A defined component takes no props. A
definition's body holds at most one `Children` placeholder. The only names it can
say are component names, a node's `key`, and the `id` on a frame or an anchor —
and an id is scene-wide, so a definition that names one cannot be instantiated
twice.

So a `Pendulum` is a particular pendulum, of a particular length, and a second
pendulum of a different length is a second definition or an edited copy. The
editor can draw a rig; it cannot describe a family of rigs.

The TSX it emits has none of those limits. A hand-written `Pendulum` takes a
`length` prop, computes with it, and returns a different tree for different
arguments — and `buildScene` runs it perfectly well, because calling composites
is exactly what `buildScene` does. **The restriction is in the document, not in
the machine underneath it.**

## The rule

- **The document is a decidable subset of TSX, and what it emits is real TSX.**
  Whatever the document can express, `emitScene` writes in the host language's
  own syntax — `length={halfLength * 2}`, not a wrapper only physm can read —
  and **building that module produces the same scene**. That is the existing
  discipline, and it stays: `expectRoundTrip` in the emitter's tests evaluates
  the emitted source, builds it, and compares the scene against the document's
  own. [Page 4](04-expressions.md) is what it looks like for an expression.
- **It has never meant the *document* comes back, and that is worth being exact
  about**, because the looser reading is the one that invites features which
  cannot work. `documentFrom` turns an element tree into a **one-definition**
  document, so a document with a scene and a `Pendulum` has never been
  recoverable from its own output. It is the way *in* — for a hand-written rig,
  or for a test — and it was never the way back.
- **Expressions widen that gap rather than opening it.** `documentFrom` reads a
  tree the runtime has already *evaluated*, so it recovers what survives
  evaluation: a literal does, and `halfLength * 2` arrives as a number. Which
  makes explicit what was already true — **the document needs a save format of
  its own** ([0017](../0017.md)), because its output was never one.
- **Hand-written components are the escape hatch.** Anything outside the subset
  is written as source, in the editor, and captured as an opaque definition that
  produces a tree when called — [page 7](07-handwritten.md).
- **The subset grows deliberately.** Parameters, then expressions, then signals,
  then slots, then repetition. Each step is a widening of what the document can
  say, with a matching widening of the emitter and the reader.
- **Two things have not been put through the rule yet** — the port surface
  (outputs, manipulators, force channels) and key bindings. None of them has a
  TSX spelling that a component's signature can express, which makes them the
  steps where the rule has work to do rather than a verdict to confirm.
  [Page 10](10-staging.md#what-each-step-has-to-prove) says what follows if they
  cannot meet it.

The rule pays for itself the first time someone proposes a feature: if it can be
written as TSX that builds the same scene, it belongs in the document; if it
cannot, it belongs in the escape hatch; and "we will make it emit later" is a
design task, not a shrug.

## What is deliberately not being built

**Bidirectional code editing.** The long-term wish is to edit the emitted TSX and
have the document follow. That is a different and much harder problem —
two sources of truth, with reconciliation, comment preservation, and a merge
story — and nothing here depends on it. The hand-written component is the
90% answer: a *single* source of truth per definition, chosen per definition.
Some definitions are trees, some are source, and the editor knows which.

**A general-purpose language.** The expression system is a typed dataflow graph
over a small set of operations — [page 4](04-expressions.md). It has no
statements, no user functions, no recursion, no strings beyond labels. If you
want those, that is what the escape hatch is for. Every feature admitted to the
expression language has to survive being drawn as a node graph, which is a
usefully brutal filter.

**A rewrite.** The solver, the frames, the constraints, and the one walk from
state to pose are untouched by all of this. `Scene.getPosMatrixMap` becomes *more*
load-bearing, not less — [page 2](02-values.md) — and the only core additions are
new elements that contribute forces.

Untouched is not the same as free, though, and the reason is easy to forget from
inside the editor: **physm has two solvers.** `RsSolver` serializes the scene and
runs the tick loop inside wasm, the demo runs that path rather than `JsSolver`,
and the two are held to agreeing trajectories on purpose. A new force-contributing
element has to exist on both sides of that boundary before the fast path can run a
scene containing one — [page 9](09-elements.md) — and a per-tick signal has to say
which solver it is specified against — [page 2](02-values.md).

## Which layers actually change

| layer | change |
|---|---|
| solver, frames, constraints | none, beyond new force-contributing elements |
| `physm-rs`, across `Scene.toJsonObj` | each new core element twice — a JSON case per side, a Rust force term, and a cross-validated test |
| `buildScene` / assembly | new node kinds to expand; the elaboration phase becomes explicit rather than incidental |
| document model | parameters, expression-valued props, named slots, repetition, ports — the bulk of the work |
| addressing (`NodePath`) | one invasive change, done once — [page 5](05-addressing.md) |
| `emitScene` / `documentFrom` | grows with the subset, and gates every step |
| editor panes | properties pane gains expression editing; tree view gains parameter and port nodes; a graph pane eventually |
| component metadata | user parameters are schema-first by necessity — [page 8](08-metadata.md) |
