# 5 — Addressing

**Parent:** <a href="../0016.md" title="0016 — Make the document a program rather than a drawing">0016</a>
· **Previous:** [Expressions](04-expressions.md)
· **Next:** [Structure that computes](06-structure.md)

This is the only genuinely invasive change in the RFC, it is invisible to a user,
and it is the one thing I would most want done before anything that depends on
it. **Do it once.**

## What a path is today

A `NodePath` is an index path: `[1, 2]` is the third child of the second node of
a definition's body. It is the editor's universal handle — selection, insertion,
drag and drop, prop edits, undo steps, the code pane's mark, and the map from a
scene hit back to the node that authored it all travel as paths.

Two features on the wish list each break it, and they break it differently.

**Named slots** mean a node's children are no longer one list. `[1, 2]` becomes
ambiguous the moment a `DualAntennaCart` has a left and a right, so a path needs
to say which: `[1, 'left', 0]`.

**Repetition** means one authored node can produce many built ones. Addressing
*the authored template* is unchanged, but addressing *the third pendulum* — to
drag it, to select it, to mark it in the code — needs an iteration index that no
authored path contains.

## Why once

Everything in the list above has to be taught the new shape, and the work is
mechanical but wide: `insertion.ts`'s holder and insertion-point logic, `moveNode`
and `movedPath`, the tree pane's row keys and drag targets, `dragTargetAt` and
the pick cycling, `emitScene`'s range keys, and every history step.

**The two halves are not the same size, and only one of them is this migration.**
Everything in the list above addresses an *authored* node, so it is the slot
component that touches all of it. The iteration index reaches selection, picking
and the drag path, and nothing else — because, as above, addressing the authored
template is unchanged by repetition.

So the ordering argument is about slots rather than about both:

- **The slot component is invasive whenever it lands.** Every site that walks a
  path has to learn that a node's children are no longer one list, and each one
  built before it lands is one more site to migrate. That is the case for doing
  it once, and early, while the number of such sites is as small as it will ever
  be.
- **The instantiation trail is additive**, and can land with the only feature
  that produces more than one copy to address. Designing it now is worth doing —
  the shapes have to fit together — but landing it early buys nothing.

## What already exists to build on

More than the blank-page feeling suggests.

**`buildScene` has a `Trail`** — the chain of composites that produced an
element. That is the natural place for an iteration index to live, because it is
already the record of *how* a built thing came to be rather than *where* it sits
in a body.

**The one-to-many map already works.** A defined component's instance already
produces many frames from one authored node, and the editor already handles it:
`authoredPathOf` maps a hit to the node in this body that stands for it,
`expandedOf` maps it to the node that actually built it in whatever body wrote
that, and Shift-click walks between them. Repetition is the same shape with a
counter attached. This is the part most likely to be feared and least likely to
be hard.

**Unique frame ids are already enforced.** The core `Scene` refuses a frame the
tree reaches twice and two frames sharing an id, which is exactly the guard
repetition needs — generated ids must differ per iteration, and the existing
check will say so loudly if they do not.

## The shape

Not settled here, but the constraints are:

- A path must remain comparable and prefix-testable, since selection, insertion
  refusals and `movedPath` all lean on that.
- It must distinguish *authored* position from *instantiated* position, because
  an edit applies to the template and a selection may refer to one expansion.
  These are two different things and collapsing them is how the tree view ends
  up editing the wrong pendulum.
- A slot component must be optional in representation but not in meaning: a node
  with one unnamed slot should not pay for slots it does not have, or every
  existing path in the tests changes shape for nothing.

The likeliest answer is a path of segments where a segment is an index plus an
optional slot name, paired with a separate instantiation trail carrying iteration
indices — keeping "which node" and "which copy of it" as two answers rather than
one interleaved sequence.
