# 4 · The tree view

<sub>[← Prev: 3 · Components and focus](./03-focus.md) · [↑ Index](../0014.md) · [Next: 5 · Component metadata →](./05-metadata.md)</sub>

## The root is the focused component

The tree shows one component definition — whichever the active tab focuses
([page 3](./03-focus.md#focus-is-tabs-not-a-stack)) — with that component as the
root and its body below it. On the scene tab that is the whole scene; on a
`Pendulum` tab it is a rod, a ball and a weight, and nothing else exists.

Everything below describes one such tree.

## Two axes, not one

It is tempting to sort nodes into "components" and "primitives". The useful split
is two independent axes:

|              | **Core** (`TrackFrame`, `Weight`, `Line`…) | **Composite** (`RopeChain`, `Pendulum`…) |
| ------------ | ------------------------------------------ | ---------------------------------------- |
| **Authored** | editable; children editable                | editable; **expansion** read-only        |
| **Expanded** | read-only                                  | read-only, expandable further            |

A `RotationalFrame` is editable when you dragged it in and read-only when
`RopeSegment` produced it. Nothing about the *kind* of node decides; only where
it came from does.

## What `+` does

One affordance, two meanings, and the ownership colouring is what tells them
apart — no mode switch, no second control:

- **On a node with authored children**, `+` reveals those children. Editable.
  This is the common case and the one that should feel like a file tree.
- **On an authored composite**, `+` additionally offers a distinct
  `⟨expansion⟩` row. Under it is what the component produced: read-only, greyed,
  and expandable further. **Double-click instead** to open its definition in a
  tab and edit it — expansion and focus are the two different questions
  [page 3](./03-focus.md#expansion-is-for-looking-focus-is-for-editing)
  separates.

So `RopeChain` in the demo shows:

```
▾ RopeChain            anchor=[-5.4, 1]
  ▸ ⟨expansion⟩                              ← read-only, 5 frames deep
  ▾ Pendulum                                 ← authored, editable
```

The `Pendulum` sits directly under `RopeChain` because it is `RopeChain`'s
authored child, even though the expansion puts it five levels down — the slot
presentation from [page 2](./02-document.md#where-the-two-trees-meet).

## Recursion is not a problem

`RopeChain` recurses. The instinct is to forbid it and require a flat
`RopeChainSegment` list instead. **Don't** — under the ownership rule the
recursion has nowhere to cause trouble:

- It happens entirely inside the expansion, which is read-only.
- It terminates, because `index >= SEGMENT_COUNT` returns `children`.
- The editor sees exactly one node, `RopeChain`, with one prop.

The tree view expands the recursion lazily and it looks like any other five-deep
chain. **The one thing the expansion needs is a depth cap** — not because
`RopeChain` is unbounded, but because a component with a genuine bug would
otherwise hang the editor rather than reporting itself. A cap of a few hundred,
with the row marked as truncated, turns an infinite loop into a diagnostic.

Recursion does surface one real wart, and it belongs to
[page 5](./05-metadata.md) rather than here: `RopeChain`'s `index` prop is an
internal accumulator that happens to be declared like a public one.

## Identity, and what a row is called

**Props do not identify a node**, and it is worth being explicit because the
opposite is a tempting shortcut. Two instances of the same component with
byte-identical props are still two instances; and a prop is a value that can
change, so identifying by one means the node's identity changes when someone
edits a field.

**The identifier is React's `key`, and its absence means the child index.** That
is the same rule React itself uses for reconciliation, it is the rule the
document should use for selection, and it is what
[page 8](./08-play.md#editing-while-it-runs) needs to carry simulation state
across an edit. Nothing else in the node is stable under editing.

So a node's identity is its **key path** — the sequence of keys or indices from
the focused component's root — which is what
[selection](#selection) below stores.

⚠️ **Index-based identity is positional, and reordering changes it.** Move a
segment and the state that was carried on index 3 now belongs to whatever
occupies index 3. That is React's behaviour too, and the answer is the same
one: an explicit `key` where identity has to survive reordering. The editor
should offer to set one rather than requiring it, and should set one
automatically on any node the user has reordered.

**Labels are a display question, not an identity one.** A row reads
`RopeChain`, and where siblings would be indistinguishable the editor appends
the disambiguator it already has — the key, or the index. `RopeChain #0` and
`RopeChain #1` are honest; `RopeChain anchor=[-5.4, 1]` looks more informative
and silently claims the prop means something it does not.

A prop or two in a dimmed suffix is still useful *as a summary*, and the
metadata can name which ones read well there. That is a hint about display,
carrying no claim about identity, and it should be named so that it cannot be
mistaken for one.

For expanded nodes, the label should say what produced them:
`RotationalFrame ← RopeSegment`. The frame is what the physics sees; the
component is what you would change to affect it.

## Selection

One selection, shared across the component editor's panes, and it is the **key
path** described above rather than a node object — because the document is
replaced rather than mutated on every edit (which is what makes undo free), so a
node reference would be stale the moment anything changed.

Selecting an **expanded** node is allowed and useful: it is how you answer "which
frame is that, and what made it?". The properties pane shows its props read-only,
and offers **"select the node that produced this"** — which walks up to the
nearest authored ancestor. That is the bridge from "I clicked a thing in the
scene" to "here is what I can actually change", and it is the piece that makes
scene-view picking worth having ([page 7](./07-editing.md)).

## Reordering and re-parenting

Drag within the tree, with two constraints that fall out of the model:

- **Only authored nodes drag.** An expanded node has no position in the document
  to move.
- **A drop target must accept the node.** `<Weight>` inside `<Line>` is not a
  scene; the metadata's slot kind ([page 5](./05-metadata.md)) says what may
  contain what, and the drop indicator refuses rather than allowing an edit that
  produces a broken scene.

**Order is not cosmetic**, which is exactly [0005](../0005.md)'s point: for
decals it is SVG paint order, and for frames it is `sortedFrames` order, which
indexes the mass matrix. So a reorder is a real edit with a physical
consequence, and the tree view is the only place a person can express it
directly.

**A reorder should set explicit keys on the nodes it moves**, per
[identity](#identity-and-what-a-row-is-called) — otherwise the positional
identity shifts under the move and anything keyed to it follows the slot rather
than the node.

## Extract to component

Right-click a node → **Extract to component**. The subtree leaves this
definition, becomes one of its own, and an instance takes its place; the editor
focuses the new component in a fresh tab.

[Page 3](./03-focus.md#extract-to-component) covers what that means for the
module. What it means *here* is that the tree is where the gesture lives, because
the tree is the only pane that can express "this node and everything under it" —
and it is the operation that turns a rig laid out from primitives into a rig
described by composites, which is the transition the editor exists to make
cheap.

---
<sub>[← Prev: 3 · Components and focus](./03-focus.md) · [↑ Index](../0014.md) · [Next: 5 · Component metadata →](./05-metadata.md)</sub>
