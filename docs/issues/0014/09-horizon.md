# 9 · The constraint-first horizon

<sub>[← Prev: 8 · Play](./08-play.md) · [↑ Index](../0014.md) · [Next: 10 · Staging →](./10-staging.md)</sub>

This page is short on purpose. The CAD-like direction — model flatly, relate by
constraint, let the runtime work out the hierarchy — is not what is being built,
and the useful question is not *how would we do it* but **does any of the above
foreclose it.**

## The hybrid already exists

`<Coincidence frame1="left-tip" frame2="right-tip" />` is a document node that
names two frames and is a child of neither. It is a **flat edge in a
hierarchical document**, and it is already there, already emitted, already
solved. The constraint machinery this repo just finished building is exactly the
mechanism the flat direction runs on.

So the difference between "hierarchical with some constraints" and
"constraint-first" is quantitative — how many frames versus how many multipliers
— rather than architectural. That is a better position to be in than it sounds,
and it is worth noticing that it happened without anyone aiming at it.

## What the design here already admits

- **The document is a tree of elements, but the *scene* is not a tree.** Named
  references ([page 5](./05-metadata.md#references-have-to-become-names)) are
  already edges the tree cannot express, and the editor already needs an index
  from name to node to keep them honest. More edges is more of the same job.
- **Constraint types are open.** `Distance` and `Coincidence` are two entries in
  a vocabulary; equal-length, parallel, angle and coincident-at-a-point are the
  same shape of thing.
- **The editor's dependency on hierarchy is presentational.** The tree view
  needs *a* tree, but a scene that is mostly constraints could present as a flat
  list with an edge overlay without changing the document model underneath.

## What it would actually take

The two hard parts are both in the runtime, not the editor:

1. **Degree-of-freedom accounting.** Karl's example — constrain a segment's
   length, and the angle remains free, so it "essentially becomes a
   `RotationalFrame` automatically". That is a rank computation over the
   constraint Jacobian, and it is the *same* computation [0002](../0002.md)
   already needs to detect a pinned scene. One of these is a diagnostic and the
   other is a compiler; they share their hardest step.
2. **Choosing a hierarchy from a constraint graph.** Every constraint expressed
   as a frame relationship is a multiplier saved and a better-conditioned
   system. Deciding which constraints to absorb into the tree is a graph problem
   with a real objective function, and it is the piece that would take
   sustained work.

## The recommendation

**Do nothing about this now, and change nothing to accommodate it.** The one
thing worth carrying forward is a habit rather than a mechanism: when a choice
comes up between "the parent-child edge means X" and "a constraint means X",
prefer the constraint, because it is the representation that survives the shift.

Concretely, that is already the argument for
[named references over `ref` handles](./05-metadata.md#references-have-to-become-names)
— which is being done for the editor's own reasons and happens to be the same
direction.

---
<sub>[← Prev: 8 · Play](./08-play.md) · [↑ Index](../0014.md) · [Next: 10 · Staging →](./10-staging.md)</sub>
